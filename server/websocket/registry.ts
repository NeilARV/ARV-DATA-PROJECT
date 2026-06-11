import { WebSocket } from 'ws';
import type { ServerToClientType } from '@shared/mastermind/events';

// One connected browser tab. A user may hold several (multiple tabs).
export interface Client {
    ws: WebSocket;
    userId: string;
    subscribedChannels: Set<string>;
    isAlive: boolean;
}

export type OutboundEvent = { type: ServerToClientType } & Record<string, unknown>;

// In-memory only — correct for the single Reserved VM. Horizontal scaling later needs
// Redis pub/sub to share these across instances (see mastermind.md Known Limitation).
const channelSubscribers = new Map<string, Set<Client>>();
const userClients = new Map<string, Set<Client>>();

export function addClient(client: Client): void {
    let set = userClients.get(client.userId);
    if (!set) {
        set = new Set();
        userClients.set(client.userId, set);
    }
    set.add(client);
}

export function removeClient(client: Client): void {
    client.subscribedChannels.forEach((channelId) => {
        const subs = channelSubscribers.get(channelId);
        if (subs) {
            subs.delete(client);
            if (subs.size === 0) channelSubscribers.delete(channelId);
        }
    });
    client.subscribedChannels.clear();

    const set = userClients.get(client.userId);
    if (set) {
        set.delete(client);
        if (set.size === 0) userClients.delete(client.userId);
    }
}

export function subscribeToChannel(client: Client, channelId: string): void {
    client.subscribedChannels.add(channelId);
    let subs = channelSubscribers.get(channelId);
    if (!subs) {
        subs = new Set();
        channelSubscribers.set(channelId, subs);
    }
    subs.add(client);
}

export function unsubscribeFromChannel(client: Client, channelId: string): void {
    client.subscribedChannels.delete(channelId);
    const subs = channelSubscribers.get(channelId);
    if (subs) {
        subs.delete(client);
        if (subs.size === 0) channelSubscribers.delete(channelId);
    }
}

function send(client: Client, event: OutboundEvent): void {
    if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(event));
    }
}

// Firehose: deliver to every client currently viewing this channel.
export function broadcastToChannel(channelId: string, event: OutboundEvent): void {
    const subs = channelSubscribers.get(channelId);
    if (!subs) return;
    subs.forEach((client) => send(client, event));
}

// Doorbell: deliver to every tab of a single user. Built for Parts 7/8; no emitters yet.
export function broadcastToUser(userId: string, event: OutboundEvent): void {
    const set = userClients.get(userId);
    if (!set) return;
    set.forEach((client) => send(client, event));
}

// ── Introspection (tests / debugging) ───────────────────────────────────────────
export function getChannelSubscriberCount(channelId: string): number {
    return channelSubscribers.get(channelId)?.size ?? 0;
}

export function getUserClientCount(userId: string): number {
    return userClients.get(userId)?.size ?? 0;
}

export function getAllClients(): Client[] {
    const all: Client[] = [];
    userClients.forEach((set) => {
        set.forEach((client) => all.push(client));
    });
    return all;
}

export function resetRegistry(): void {
    channelSubscribers.clear();
    userClients.clear();
}
