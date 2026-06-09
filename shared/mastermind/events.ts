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
    // Reserved for later parts — the doorbell stream (Parts 7/8). No emitters yet.
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
}

export type ServerMessageEvent = {
    type:
        | typeof ServerToClient.MessageCreated
        | typeof ServerToClient.MessageUpdated
        | typeof ServerToClient.MessageDeleted;
    message: MastermindMessageWire;
};

// The path the WebSocket upgrade is served on (kept off Vite's HMR socket).
export const MASTERMIND_WS_PATH = '/ws';
