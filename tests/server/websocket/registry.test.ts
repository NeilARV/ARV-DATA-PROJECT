import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    addClient,
    removeClient,
    subscribeToChannel,
    unsubscribeFromChannel,
    broadcastToChannel,
    broadcastToUser,
    getChannelSubscriberCount,
    getUserClientCount,
    resetRegistry,
    type Client,
} from 'server/websocket/registry';

const OPEN = 1; // WebSocket.OPEN

function makeClient(userId: string, readyState = OPEN): Client {
    return {
        ws: { readyState, send: vi.fn() } as unknown as Client['ws'],
        userId,
        subscribedChannels: new Set(),
        isAlive: true,
    };
}

beforeEach(() => resetRegistry());

describe('registry — channel broadcast', () => {
    it('delivers a channel broadcast only to that channel’s subscribers', () => {
        const a = makeClient('u1');
        const b = makeClient('u2');
        addClient(a);
        addClient(b);
        subscribeToChannel(a, 'chan-1');
        subscribeToChannel(b, 'chan-2');

        broadcastToChannel('chan-1', { type: 'message.created', message: { id: 'm1' } });

        expect(a.ws.send).toHaveBeenCalledTimes(1);
        expect(b.ws.send).not.toHaveBeenCalled();
    });

    it('stops delivering after unsubscribe', () => {
        const a = makeClient('u1');
        addClient(a);
        subscribeToChannel(a, 'chan-1');
        unsubscribeFromChannel(a, 'chan-1');

        broadcastToChannel('chan-1', { type: 'message.created' });
        expect(a.ws.send).not.toHaveBeenCalled();
        expect(getChannelSubscriberCount('chan-1')).toBe(0);
    });

    it('does not send to a non-open socket', () => {
        const a = makeClient('u1', 0); // CONNECTING
        addClient(a);
        subscribeToChannel(a, 'chan-1');

        broadcastToChannel('chan-1', { type: 'message.created' });
        expect(a.ws.send).not.toHaveBeenCalled();
    });
});

describe('registry — user broadcast (doorbell)', () => {
    it('delivers to every tab of a user', () => {
        const tab1 = makeClient('u1');
        const tab2 = makeClient('u1');
        addClient(tab1);
        addClient(tab2);

        broadcastToUser('u1', { type: 'notification.created' });
        expect(tab1.ws.send).toHaveBeenCalledTimes(1);
        expect(tab2.ws.send).toHaveBeenCalledTimes(1);
        expect(getUserClientCount('u1')).toBe(2);
    });
});

describe('registry — cleanup', () => {
    it('removeClient clears channel and user membership', () => {
        const a = makeClient('u1');
        addClient(a);
        subscribeToChannel(a, 'chan-1');

        removeClient(a);

        expect(getChannelSubscriberCount('chan-1')).toBe(0);
        expect(getUserClientCount('u1')).toBe(0);
        broadcastToChannel('chan-1', { type: 'message.created' });
        expect(a.ws.send).not.toHaveBeenCalled();
    });
});
