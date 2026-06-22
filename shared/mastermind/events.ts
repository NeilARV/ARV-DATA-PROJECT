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
    // Cross-channel unread doorbell — a new message landed in `channelId`. Delivered to every
    // eligible user except the sender, regardless of which channel they're subscribed to, so
    // sidebar unread badges update live without a refresh. Carries only unread-relevant fields;
    // the message body rides MessageCreated to subscribers of that channel.
    ChannelActivity: 'channel.activity',
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

// Unfurled metadata for a link in a message. Sourced from the link_previews cache and matched
// to the message by URL at hydration time; absent until the background unfurl populates the cache.
export interface LinkPreviewWire {
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    logo: string | null;
    publisher: string | null;
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
    linkPreviews: LinkPreviewWire[];
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

// Display payload for a deal_bid notification, denormalized so the bell needs no extra fetch.
export interface DealBidNotificationMetadata {
    amount: string;
    address: string;
}

// A bell-feed notification as the client receives it (REST and socket share this shape;
// dates serialized to ISO strings). Actor fields are null when the actor was deleted.
// Mention types carry channel/message context; deal_bid carries dealId + metadata instead.
// `announcement` is the admin/owner @announcement broadcast (same context as channel_mention).
// `direct_message` carries channel/message context but is routed by the actor (the DM sender),
// since a DM channel has no human-facing name to deep-link by.
export interface NotificationWire {
    id: string;
    type: 'mention' | 'channel_mention' | 'announcement' | 'deal_bid' | 'direct_message';
    channelId: string | null;
    channelName: string | null;
    messageId: string | null;
    messageExcerpt: string;
    dealId: number | null;
    metadata: DealBidNotificationMetadata | null;
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

// A user as embedded in DM payloads — the counterparty on a conversation/list item/header.
export interface DmUserWire {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
}

// One open direct-message conversation as the sidebar receives it (the `GET /api/dms` list item).
// A DM has exactly one counterparty, denormalized here so the list needs no extra fetch. The
// synthetic DM channel name is never sent — the UI keys off `otherUser` and routes by their id.
// `lastMessageAt` is the most recent non-deleted message time (ISO string), used for ordering.
export interface DirectMessageSummaryWire {
    channelId: string;
    otherUser: DmUserWire;
    unreadCount: number;
    lastMessageAt: string;
}

// The unread-relevant fields of a cross-channel activity doorbell. The client computes its own
// per-viewer mention state from mentionedEveryone / mentionedUserIds — the body is never sent.
export interface ChannelActivityWire {
    channelId: string;
    mentionedUserIds: string[];
    mentionedEveryone: boolean;
}

export type ServerChannelActivityEvent = {
    type: typeof ServerToClient.ChannelActivity;
} & ChannelActivityWire;

// The path the WebSocket upgrade is served on (kept off Vite's HMR socket).
export const MASTERMIND_WS_PATH = '/ws';
