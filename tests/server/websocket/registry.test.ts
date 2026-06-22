import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    addClient,
    removeClient,
    subscribeToChannel,
    unsubscribeFromChannel,
    broadcastToChannel,
    broadcastToUser,
    broadcastToOtherUsers,
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

describe('registry — cross-channel doorbell', () => {
    it('delivers to every other user regardless of channel subscription, excluding the sender', () => {
        const sender = makeClient('sender');
        const viewerA = makeClient('u-a');
        const viewerB = makeClient('u-b');
        addClient(sender);
        addClient(viewerA);
        addClient(viewerB);
        // The recipients are looking at unrelated channels — they aren't subscribed to chan-1.
        subscribeToChannel(sender, 'chan-1');
        subscribeToChannel(viewerA, 'chan-2');

        broadcastToOtherUsers('sender', { type: 'channel.activity', channelId: 'chan-1' });

        expect(sender.ws.send).not.toHaveBeenCalled();
        expect(viewerA.ws.send).toHaveBeenCalledTimes(1);
        expect(viewerB.ws.send).toHaveBeenCalledTimes(1);
    });

    it('restricts delivery to the allow-list when one is given (admin-only channels)', () => {
        const sender = makeClient('admin-sender');
        const admin = makeClient('admin-2');
        const member = makeClient('member-1');
        addClient(sender);
        addClient(admin);
        addClient(member);

        broadcastToOtherUsers(
            'admin-sender',
            { type: 'channel.activity', channelId: 'admin-chan' },
            new Set(['admin-sender', 'admin-2']),
        );

        expect(admin.ws.send).toHaveBeenCalledTimes(1);
        expect(member.ws.send).not.toHaveBeenCalled();
        expect(sender.ws.send).not.toHaveBeenCalled();
    });

    it('reaches every tab of a recipient', () => {
        const sender = makeClient('sender');
        const tab1 = makeClient('u-a');
        const tab2 = makeClient('u-a');
        addClient(sender);
        addClient(tab1);
        addClient(tab2);

        broadcastToOtherUsers('sender', { type: 'channel.activity', channelId: 'chan-1' });

        expect(tab1.ws.send).toHaveBeenCalledTimes(1);
        expect(tab2.ws.send).toHaveBeenCalledTimes(1);
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
