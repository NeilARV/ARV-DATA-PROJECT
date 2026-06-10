import crypto from 'crypto';
import path from 'path';
import { getSupabase, mastermindStorageBucket } from 'server/lib/supabase';
import type { MessageAttachmentInput } from '@database/validation/mastermind.validation';

export class AttachmentServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'AttachmentServiceError';
    }
}

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
