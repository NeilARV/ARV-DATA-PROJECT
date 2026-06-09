import type { WebSocket, RawData } from 'ws';
import { ClientToServer } from '@shared/mastermind/events';
import {
    addClient,
    removeClient,
    subscribeToChannel,
    unsubscribeFromChannel,
    type Client,
} from './registry';
import { getChannelById } from 'server/services/channels/channels.services';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Wires up a freshly authenticated socket: registers it, handles subscribe/unsubscribe,
// tracks liveness for the heartbeat, and cleans up on close.
export function handleConnection(ws: WebSocket, userId: string): void {
    const client: Client = {
        ws,
        userId,
        subscribedChannels: new Set(),
        isAlive: true,
    };
    addClient(client);

    ws.on('pong', () => {
        client.isAlive = true;
    });

    ws.on('message', (raw) => {
        void handleClientMessage(client, raw);
    });

    ws.on('close', () => removeClient(client));
    ws.on('error', () => removeClient(client));
}

async function handleClientMessage(client: Client, raw: RawData): Promise<void> {
    let msg: unknown;
    try {
        msg = JSON.parse(raw.toString());
    } catch {
        return;
    }
    if (!msg || typeof msg !== 'object') return;

    const { type, channelId } = msg as { type?: unknown; channelId?: unknown };
    if (typeof channelId !== 'string') return;

    if (type === ClientToServer.Subscribe) {
        if (!UUID_REGEX.test(channelId)) return;
        // Subscribing only requires the channel to be readable; eligibility was proven at upgrade.
        let channel;
        try {
            channel = await getChannelById(channelId);
        } catch (err) {
            console.error('[ws] subscribe channel lookup failed:', err);
            return;
        }
        if (channel && channel.type === 'public' && !channel.isArchived) {
            subscribeToChannel(client, channelId);
        }
        return;
    }

    if (type === ClientToServer.Unsubscribe) {
        unsubscribeFromChannel(client, channelId);
    }
}
