import { MASTERMIND_REACTION_EMOJIS, MAX_ATTACHMENTS_PER_MESSAGE } from '@database/validation/mastermind.validation';

export { MASTERMIND_REACTION_EMOJIS, MAX_ATTACHMENTS_PER_MESSAGE };

// The file picker filter — images render inline, the rest become download links.
// Mirrors the server allowlist (ALLOWED_ATTACHMENT_TYPES) and the Supabase bucket config.
export const MASTERMIND_ALLOWED_FILE_ACCEPT = [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'text/csv',
    'text/plain',
].join(',');
