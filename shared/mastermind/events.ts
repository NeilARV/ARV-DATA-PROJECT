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
    // The doorbell stream — delivered to every tab of the recipient, channel-independent.
    NotificationCreated: 'notification.created',
} as const;

export type ServerToClientType = (typeof ServerToClient)[keyof typeof ServerToClient];

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
