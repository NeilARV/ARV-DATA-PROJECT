import { apiRequest } from '@/lib/queryClient';

import type {
    MessageAttachmentWire,
    PinnedMessageWire,
} from '@shared/mastermind/events';

// Metadata returned by the upload endpoint, sent back when creating the message.
export type UploadedAttachment = Omit<MessageAttachmentWire, 'id'>;

export async function addReaction(messageId: string, emoji: string): Promise<void> {
    await apiRequest('POST', `/api/messages/${messageId}/reactions`, { emoji });
}

export async function removeReaction(messageId: string, emoji: string): Promise<void> {
    await apiRequest('DELETE', `/api/messages/${messageId}/reactions`, { emoji });
}

export async function editMessage(messageId: string, content: string): Promise<void> {
    await apiRequest('PATCH', `/api/messages/${messageId}`, { content });
}

export async function deleteMessage(messageId: string): Promise<void> {
    await apiRequest('DELETE', `/api/messages/${messageId}`);
}

export async function setChannelPin(
    channelId: string,
    messageId: string,
): Promise<PinnedMessageWire | null> {
    const res = await apiRequest('POST', `/api/channels/${channelId}/pin`, { messageId });
    const json = (await res.json()) as { pinned: PinnedMessageWire | null };
    return json.pinned;
}

export async function removeChannelPin(channelId: string): Promise<void> {
    await apiRequest('DELETE', `/api/channels/${channelId}/pin`);
}

// Multipart upload — raw fetch (FormData) since apiRequest forces a JSON content type.
export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/mastermind/attachments', {
        method: 'POST',
        body: formData,
        credentials: 'include',
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
    }
    const json = (await res.json()) as { attachment: UploadedAttachment };
    return json.attachment;
}
