const POSTMARK_SENDERS_BASE = "https://api.postmarkapp.com/senders";

export interface PostmarkSenderSignature {
  Domain: string;
  EmailAddress: string;
  ReplyToEmailAddress: string;
  Name: string;
  Confirmed: boolean;
  ID: number;
}

export interface ListSendersResponse {
  TotalCount: number;
  SenderSignatures: PostmarkSenderSignature[];
}

function getAccountToken(): string {
  const token = process.env.POSTMARK_ACCOUNT_TOKEN;
  if (!token) throw new Error("POSTMARK_ACCOUNT_TOKEN is not set");
  return token;
}

// GET /senders — list sender signatures (paginated).
export async function listSenderSignatures(
  count = 50,
  offset = 0
): Promise<ListSendersResponse> {
  const token = getAccountToken();
  const url = `${POSTMARK_SENDERS_BASE}?count=${count}&offset=${offset}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Postmark-Account-Token": token,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postmark list senders failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<ListSendersResponse>;
}

// POST /senders — create a sender signature.
export async function createSenderSignature(params: {
  FromEmail: string;
  Name: string;
  ReplyToEmail?: string;
  ConfirmationPersonalNote?: string;
}): Promise<PostmarkSenderSignature & Record<string, unknown>> {
  const token = getAccountToken();
  const res = await fetch(POSTMARK_SENDERS_BASE, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Account-Token": token,
    },
    body: JSON.stringify({
      FromEmail: params.FromEmail,
      Name: params.Name,
      ...(params.ReplyToEmail != null && params.ReplyToEmail !== ""
        ? { ReplyToEmail: params.ReplyToEmail }
        : {}),
      ...(params.ConfirmationPersonalNote != null
        ? { ConfirmationPersonalNote: params.ConfirmationPersonalNote }
        : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postmark create sender failed: ${res.status} ${body}`);
  }
  return res.json();
}

// DELETE /senders/:id — remove a sender signature.
export async function deleteSenderSignature(signatureId: number): Promise<void> {
  const token = getAccountToken();
  const url = `${POSTMARK_SENDERS_BASE}/${signatureId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "X-Postmark-Account-Token": token,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postmark delete sender failed: ${res.status} ${body}`);
  }
}


// Find a sender signature by email (case-insensitive) in the current page of results.
// For pagination, call listSenderSignatures in a loop if you have many senders.
export function findSignatureByEmail(
  signatures: PostmarkSenderSignature[],
  email: string
): PostmarkSenderSignature | undefined {
  const normalized = email.trim().toLowerCase();
  return signatures.find(
    (s) => s.EmailAddress.trim().toLowerCase() === normalized
  );
}
