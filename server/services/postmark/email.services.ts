import { ServerClient } from "postmark";
import { db } from "server/storage";
import { users, userRelationshipManagers } from "@database/schemas/users.schema";
import { eq, inArray } from "drizzle-orm";
import {
  listSenderSignatures,
  findSignatureByEmail,
  type PostmarkSenderSignature,
} from "./senders.services";

const DEFAULT_FROM_EMAIL = "neil@arvfinance.com";

function getServerKey(): string {
  const key = process.env.POSTMARK_SERVER_API_KEY;
  if (!key) throw new Error("POSTMARK_SERVER_API_KEY is not set");
  return key;
}

let clientInstance: ServerClient | null = null;

// Returns the Postmark server client. Throws if POSTMARK_SERVER_API_KEY is not set.
export function getPostmarkClient(): ServerClient {
  if (!clientInstance) {
    clientInstance = new ServerClient(getServerKey());
  }
  return clientInstance;
}

// Default From address when the recipient has no relationship manager or their RM is not a confirmed Postmark sender
export function getDefaultFromEmail(): string {
  return DEFAULT_FROM_EMAIL;
}

export interface SendEmailWithTemplateParams {
  From: string;
  To: string;
  TemplateAlias: string;
  TemplateModel: Record<string, unknown>;
}

// Sends a single email using a Postmark template
export async function sendEmailWithTemplate(
  payload: SendEmailWithTemplateParams
): Promise<void> {
  const client = getPostmarkClient();
  await client.sendEmailWithTemplate(payload);
}

// ── Sender signature cache ─────────────────────────────────────────────────────
// Cached for 5 minutes to avoid repeated Postmark API calls within a single job run.
const SENDER_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedSenders: PostmarkSenderSignature[] = [];
let cachedSendersAt = 0;

export async function getConfirmedSenders(): Promise<PostmarkSenderSignature[]> {
  const now = Date.now();
  if (cachedSenders.length > 0 && now - cachedSendersAt < SENDER_CACHE_TTL_MS) {
    return cachedSenders;
  }

  if (!process.env.POSTMARK_ACCOUNT_TOKEN) {
    return [];
  }

  let all: PostmarkSenderSignature[] = [];
  const pageSize = 50;
  let offset = 0;
  let totalCount = 0;
  do {
    const res = await listSenderSignatures(pageSize, offset);
    all = all.concat(res.SenderSignatures ?? []);
    totalCount = res.TotalCount ?? 0;
    offset += pageSize;
  } while (offset < totalCount);

  cachedSenders = all;
  cachedSendersAt = now;
  return all;
}

// ── RM email lookup helpers ────────────────────────────────────────────────────

// Given user IDs, returns a map of userId → their relationship manager's email.
export async function getRmEmailsByUserIds(
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;

  const rows = await db
    .select({
      recipientUserId: userRelationshipManagers.userId,
      rmEmail: users.email,
    })
    .from(userRelationshipManagers)
    .innerJoin(users, eq(userRelationshipManagers.relationshipManagerId, users.id))
    .where(inArray(userRelationshipManagers.userId, userIds));

  for (const row of rows) {
    if (!map.has(row.recipientUserId) && row.rmEmail) {
      map.set(row.recipientUserId, row.rmEmail);
    }
  }
  return map;
}

// Given RM user IDs (e.g. from email_whitelist), returns a map of rmId → email.
export async function getRmEmailsByRmIds(
  rmIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (rmIds.length === 0) return map;

  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, rmIds));

  for (const row of rows) {
    if (row.email) map.set(row.id, row.email);
  }
  return map;
}

// ── From address resolution ────────────────────────────────────────────────────

// Resolves the best "From" address for a given RM email: if the RM is a confirmed
// Postmark sender, use their email; otherwise fall back to the default.
export function resolveFromAddress(
  confirmedSenders: PostmarkSenderSignature[],
  rmEmail: string | undefined
): string {
  if (!rmEmail) return DEFAULT_FROM_EMAIL;
  const signature = findSignatureByEmail(confirmedSenders, rmEmail);
  if (signature && signature.Confirmed) return signature.EmailAddress;
  return DEFAULT_FROM_EMAIL;
}

// ── High-level send helpers ────────────────────────────────────────────────────

// Send a template email to a single user, resolving their RM as the From address.
export async function sendTemplateToUser(params: {
  toEmail: string;
  toUserId?: string;
  rmEmail?: string;       // override: use this RM email instead of looking up
  templateAlias: string;
  templateModel: Record<string, unknown>;
}): Promise<void> {
  const senders = await getConfirmedSenders();

  let rmEmail = params.rmEmail;
  if (!rmEmail && params.toUserId) {
    const rmMap = await getRmEmailsByUserIds([params.toUserId]);
    rmEmail = rmMap.get(params.toUserId);
  }

  const fromAddress = resolveFromAddress(senders, rmEmail);

  await sendEmailWithTemplate({
    From: fromAddress,
    To: params.toEmail,
    TemplateAlias: params.templateAlias,
    TemplateModel: params.templateModel,
  });
}

// Send a template email to multiple users, batch-resolving their RMs.
// Returns { sent: number, failed: string[] }.
export async function sendTemplateToUsers(params: {
  recipients: Array<{
    email: string;
    userId?: string;
    rmEmail?: string;     // override: pre-resolved RM email (e.g. from whitelist)
  }>;
  templateAlias: string;
  templateModelForRecipient: (recipient: { email: string; userId?: string }) => Record<string, unknown>;
  logPrefix?: string;
}): Promise<{ sent: number; failed: string[] }> {
  const { recipients, templateAlias, templateModelForRecipient, logPrefix = "[EMAIL]" } = params;

  const senders = await getConfirmedSenders();

  // Batch-resolve RM emails for recipients that have a userId but no pre-resolved rmEmail
  const userIdsToLookup = recipients
    .filter((r) => r.userId && !r.rmEmail)
    .map((r) => r.userId!);
  const rmMap = await getRmEmailsByUserIds(userIdsToLookup);

  let sent = 0;
  const failed: string[] = [];

  for (const recipient of recipients) {
    const rmEmail = recipient.rmEmail ?? (recipient.userId ? rmMap.get(recipient.userId) : undefined);
    const fromAddress = resolveFromAddress(senders, rmEmail);

    try {
      await sendEmailWithTemplate({
        From: fromAddress,
        To: recipient.email,
        TemplateAlias: templateAlias,
        TemplateModel: templateModelForRecipient(recipient),
      });
      sent++;
    } catch (err) {
      failed.push(recipient.email);
      console.error(
        `${logPrefix} Failed to send to ${recipient.email}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return { sent, failed };
}
