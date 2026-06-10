// WebSocket protocol contract for Mastermind real-time. Imported by both the server
// (server/websocket) and the client (use-mastermind-socket) so the two agree on the wire
// format. The `type` string discriminators are the real contract; payload timestamps are
// ISO strings on the wire (JSON has no Date).

// ── Client → server ──────────────────────────────────────────────────────────────
export const ClientToServer = {
    Subscribe: 'subscribe',
    Unsubscribe: 'unsubscribe',
} as const;

export type SubscribeMessage = { type: typeof ClientToServer.Subscribe; channelId: string };
export type UnsubscribeMessage = { type: typeof ClientToServer.Unsubscribe; channelId: string };
export type ClientMessage = SubscribeMessage | UnsubscribeMessage;

// ── Server → client ──────────────────────────────────────────────────────────────
export const ServerToClient = {
    MessageCreated: 'message.created',
    MessageUpdated: 'message.updated',
    MessageDeleted: 'message.deleted',
    // A reaction was added or removed; carries the delta so each client computes its own state.
    ReactionChanged: 'reaction.changed',
    // A channel's single pin changed (set, replaced, or cleared).
    MessagePinned: 'message.pinned',
    // The doorbell stream — delivered to every tab of the recipient, channel-independent.
    NotificationCreated: 'notification.created',
} as const;

export type ServerToClientType = (typeof ServerToClient)[keyof typeof ServerToClient];

// A file attached to a message (dates serialized to ISO strings on the wire).
export interface MessageAttachmentWire {
    id: string;
    fileUrl: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
}

// Aggregated reaction state for a single emoji on a message. `reactedByMe` is per-viewer,
// which is why reaction events carry a per-user delta rather than this summary (see below).
export interface MessageReactionSummary {
    emoji: string;
    count: number;
    reactedByMe: boolean;
}

// A message as the client receives it over the socket (dates serialized to ISO strings).
export interface MastermindMessageWire {
    id: string;
    channelId: string;
    senderId: string;
    content: string;
    isEdited: boolean;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
    senderFirstName: string;
    senderLastName: string;
    senderProfileImageUrl: string | null;
    attachments: MessageAttachmentWire[];
    reactions: MessageReactionSummary[];
    // Present on message.created events; omitted on message.updated / message.deleted.
    mentionedUserIds?: string[];
    mentionedEveryone?: boolean;
}

export type ServerMessageEvent = {
    type:
        | typeof ServerToClient.MessageCreated
        | typeof ServerToClient.MessageUpdated
        | typeof ServerToClient.MessageDeleted;
    message: MastermindMessageWire;
};

// A reaction add/remove delta. Each client applies it to its own cache, setting
// reactedByMe only when userId is the viewer — that is how per-viewer state stays correct
// off a single channel-wide broadcast.
export type ReactionChangedEvent = {
    type: typeof ServerToClient.ReactionChanged;
    messageId: string;
    channelId: string;
    emoji: string;
    userId: string;
    action: 'add' | 'remove';
};

// A channel's pinned message, with who pinned it (null fields if that user was deleted).
export interface PinnedMessageWire {
    message: MastermindMessageWire;
    pinnedByUserId: string | null;
    pinnedByFirstName: string | null;
    pinnedByLastName: string | null;
    pinnedAt: string;
}

export type MessagePinnedEvent = {
    type: typeof ServerToClient.MessagePinned;
    channelId: string;
    pinned: PinnedMessageWire | null;
};

// A bell-feed notification as the client receives it (REST and socket share this shape;
// dates serialized to ISO strings). Actor fields are null when the actor was deleted.
export interface NotificationWire {
    id: string;
    type: 'mention' | 'channel_mention';
    channelId: string | null;
    channelName: string | null;
    messageId: string | null;
    messageExcerpt: string;
    actorId: string | null;
    actorFirstName: string | null;
    actorLastName: string | null;
    actorProfileImageUrl: string | null;
    isRead: boolean;
    createdAt: string;
}

export type ServerNotificationEvent = {
    type: typeof ServerToClient.NotificationCreated;
    notification: NotificationWire;
};

// The path the WebSocket upgrade is served on (kept off Vite's HMR socket).
export const MASTERMIND_WS_PATH = '/ws';
