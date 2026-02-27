/**
 * Postmark transactional email sending.
 * Uses the Server API (POSTMARK_SERVER_API_KEY). Sender verification is handled in senders.services.
 */

import { ServerClient } from "postmark";

const DEFAULT_FROM_EMAIL = "neil@arvfinance.com";

function getServerKey(): string {
  const key = process.env.POSTMARK_SERVER_API_KEY;
  if (!key) throw new Error("POSTMARK_SERVER_API_KEY is not set");
  return key;
}

let clientInstance: ServerClient | null = null;

/**
 * Returns the Postmark server client. Throws if POSTMARK_SERVER_API_KEY is not set.
 */
export function getPostmarkClient(): ServerClient {
  if (!clientInstance) {
    clientInstance = new ServerClient(getServerKey());
  }
  return clientInstance;
}

/**
 * Default From address when the recipient has no relationship manager or their RM is not a confirmed Postmark sender.
 */
export function getDefaultFromEmail(): string {
  return DEFAULT_FROM_EMAIL;
}

export interface SendEmailWithTemplateParams {
  From: string;
  To: string;
  TemplateAlias: string;
  TemplateModel: Record<string, unknown>;
}

/**
 * Sends a single email using a Postmark template.
 */
export async function sendEmailWithTemplate(
  payload: SendEmailWithTemplateParams
): Promise<void> {
  const client = getPostmarkClient();
  await client.sendEmailWithTemplate(payload);
}
