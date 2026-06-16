import crypto from 'crypto';
import path from 'path';
import { getSupabase, mastermindStorageBucket, storagePathFromUrl } from 'server/lib/supabase';
import type { MessageAttachmentInput } from '@database/validation/mastermind.validation';
import { ServiceError } from 'server/lib/error';

export class AttachmentServiceError extends ServiceError {}

// image/* render inline; everything else is offered as a download link (Phase 1).
// Must stay in sync with the Supabase bucket's allowed MIME types — uploads of any type the
// bucket rejects fail at storage, so the bucket is the source of truth for this list.
export const ALLOWED_ATTACHMENT_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'application/pdf',
    'text/csv',
    'text/plain',
]);

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// Cap per Supabase Storage .remove() call. A channel delete can collect attachments across all of
// its messages, which is unbounded; chunking keeps each request under Supabase's object limit so a
// large channel doesn't fail (and orphan) the whole batch at once.
const STORAGE_REMOVE_BATCH_SIZE = 100;

// Uploads a single file to Supabase Storage and returns the metadata the client then sends
// back with the message. Storage is the only producer of these URLs, which is why the message
// create path can validate that an attachment URL points at this bucket.
export async function uploadAttachment({
    userId,
    buffer,
    mimetype,
    originalName,
}: {
    userId: string;
    buffer: Buffer;
    mimetype: string;
    originalName: string;
}): Promise<MessageAttachmentInput> {
    if (!ALLOWED_ATTACHMENT_TYPES.has(mimetype)) {
        throw new AttachmentServiceError(400, 'Unsupported file type');
    }
    if (buffer.length === 0) {
        throw new AttachmentServiceError(400, 'File is empty');
    }
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
        throw new AttachmentServiceError(400, 'File is too large');
    }

    const ext = path.extname(originalName).slice(1).toLowerCase() || 'bin';
    const storagePath = `mastermind/${userId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await getSupabase()
        .storage.from(mastermindStorageBucket)
        .upload(storagePath, buffer, { contentType: mimetype, upsert: false });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const {
        data: { publicUrl },
    } = getSupabase().storage.from(mastermindStorageBucket).getPublicUrl(storagePath);

    return {
        fileUrl: publicUrl,
        fileName: originalName.slice(0, 255),
        fileType: mimetype,
        fileSizeBytes: buffer.length,
    };
}

// Best-effort removal of a set of attachment URLs from Supabase Storage. Shared by the message
// delete/edit paths and channel delete. Failures are logged, never thrown — the DB rows are the
// source of truth. `context` is a label (e.g. `message <id>` / `channel <id>`) for log lines.
export async function removeAttachmentStorageByUrls(
    fileUrls: string[],
    context: string,
): Promise<void> {
    if (fileUrls.length === 0) return;

    const paths = fileUrls
        .map((url) => storagePathFromUrl(url, mastermindStorageBucket))
        .filter((p): p is string => p !== null);

    // A stored URL that doesn't map to a storage path can never be deleted — surface it
    // instead of silently leaking the object.
    if (paths.length !== fileUrls.length) {
        console.error(
            `Mastermind attachment cleanup: ${fileUrls.length - paths.length} URL(s) for ${context} ` +
                `did not map to a storage path; those objects may be orphaned.`,
        );
    }
    if (paths.length === 0) return;

    // Supabase .remove() resolves with { data, error } rather than throwing on an API-level
    // failure (bad path, permissions, RLS). The try/catch only covers transport errors, so the
    // returned error must be inspected too — otherwise a failed delete leaks files with no signal.
    for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH_SIZE) {
        const batch = paths.slice(i, i + STORAGE_REMOVE_BATCH_SIZE);
        try {
            const { error } = await getSupabase()
                .storage.from(mastermindStorageBucket)
                .remove(batch);
            if (error) {
                console.error(
                    `Failed to remove mastermind attachment storage for ${context}:`,
                    error.message,
                );
            }
        } catch (err) {
            console.error(`Failed to remove mastermind attachment storage for ${context}:`, err);
        }
    }
}
