import type { MessageAttachmentWire } from '@shared/mastermind/events';

export type ChannelSummary = {
    id: string;
    name: string;
    description: string | null;
    unreadCount: number;
    hasMention: boolean;
};

// Payload emitted by InlineMessageEditor.onSave and consumed by MessageItem's edit mutation.
export type EditMessagePayload = {
    content: string;
    keptAttachments: MessageAttachmentWire[];
    newFiles: File[];
};
