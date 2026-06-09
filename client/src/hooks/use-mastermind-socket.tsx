import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';

import { queryClient } from '@/lib/queryClient';
import { messagesQueryKey, mergeMessages } from '@/lib/mastermind-messages';
import {
    ClientToServer,
    ServerToClient,
    MASTERMIND_WS_PATH,
    type MastermindMessageWire,
} from '@shared/mastermind/events';

export { messagesQueryKey, mergeMessages };

type SocketStatus = 'connecting' | 'open' | 'closed';

type SocketContextValue = {
    status: SocketStatus;
    subscribeToChannel: (channelId: string) => void;
    unsubscribeFromChannel: (channelId: string) => void;
};

const MastermindSocketContext = createContext<SocketContextValue | null>(null);

const MAX_RECONNECT_DELAY_MS = 30_000;

export function MastermindSocketProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated, canAccessApp } = useAuth();
    const [status, setStatus] = useState<SocketStatus>('closed');
    const apiRef = useRef<{
        subscribe: (channelId: string) => void;
        unsubscribe: (channelId: string) => void;
    } | null>(null);

    useEffect(() => {
        if (!isAuthenticated || !canAccessApp) return;

        let socket: WebSocket | null = null;
        let activeChannel: string | null = null;
        let attempts = 0;
        let reconnectTimer: number | undefined;
        let closedByUs = false;

        const sendIfOpen = (msg: object) => {
            if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
        };

        // On reconnect, recover anything missed while the socket was down (Part 3 backfill).
        const backfill = async (channelId: string) => {
            const existing =
                queryClient.getQueryData<MastermindMessageWire[]>(messagesQueryKey(channelId)) ??
                [];
            const last = existing[existing.length - 1];
            if (!last) {
                void queryClient.invalidateQueries({ queryKey: messagesQueryKey(channelId) });
                return;
            }
            try {
                const res = await fetch(
                    `/api/channels/${channelId}/messages?since=${last.id}`,
                    { credentials: 'include' },
                );
                if (!res.ok) return;
                const data = (await res.json()) as {
                    messages: MastermindMessageWire[];
                    hasMore: boolean;
                };
                if (data.hasMore) {
                    // Drifted past the backfill window — simplest correct recovery is a refetch.
                    void queryClient.invalidateQueries({ queryKey: messagesQueryKey(channelId) });
                    return;
                }
                queryClient.setQueryData<MastermindMessageWire[]>(
                    messagesQueryKey(channelId),
                    (old) => mergeMessages(old ?? [], data.messages),
                );
            } catch {
                // Network blip mid-reconnect; the next event or a manual refresh recovers.
            }
        };

        const handleEvent = (ev: MessageEvent) => {
            let data: unknown;
            try {
                data = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
            } catch {
                return;
            }
            if (!data || typeof data !== 'object') return;

            const evt = data as { type?: string; message?: MastermindMessageWire };
            if (
                evt.type === ServerToClient.MessageCreated ||
                evt.type === ServerToClient.MessageUpdated ||
                evt.type === ServerToClient.MessageDeleted
            ) {
                const message = evt.message;
                if (message && typeof message.channelId === 'string') {
                    queryClient.setQueryData<MastermindMessageWire[]>(
                        messagesQueryKey(message.channelId),
                        (old) => mergeMessages(old ?? [], [message]),
                    );
                }
            }
        };

        const scheduleReconnect = () => {
            if (closedByUs) return;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            // Cap the exponent so 2 ** attempts can never overflow toward Infinity.
            const delay =
                Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** Math.min(attempts, 5)) +
                Math.random() * 1000;
            attempts = Math.min(attempts + 1, 6);
            reconnectTimer = window.setTimeout(connect, delay);
        };

        function connect() {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
            socket = new WebSocket(`${proto}://${window.location.host}${MASTERMIND_WS_PATH}`);
            setStatus('connecting');

            socket.onopen = () => {
                setStatus('open');
                attempts = 0;
                if (activeChannel) {
                    sendIfOpen({ type: ClientToServer.Subscribe, channelId: activeChannel });
                    void backfill(activeChannel);
                }
            };
            socket.onmessage = handleEvent;
            socket.onclose = () => {
                setStatus('closed');
                socket = null;
                scheduleReconnect();
            };
            socket.onerror = () => {
                socket?.close();
            };
        }

        apiRef.current = {
            subscribe: (channelId: string) => {
                if (activeChannel && activeChannel !== channelId) {
                    sendIfOpen({ type: ClientToServer.Unsubscribe, channelId: activeChannel });
                }
                activeChannel = channelId;
                sendIfOpen({ type: ClientToServer.Subscribe, channelId });
            },
            unsubscribe: (channelId: string) => {
                if (activeChannel === channelId) activeChannel = null;
                sendIfOpen({ type: ClientToServer.Unsubscribe, channelId });
            },
        };

        connect();

        return () => {
            closedByUs = true;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            apiRef.current = null;
            socket?.close();
            socket = null;
            setStatus('closed');
        };
    }, [isAuthenticated, canAccessApp]);

    const subscribeToChannel = useCallback((channelId: string) => {
        apiRef.current?.subscribe(channelId);
    }, []);
    const unsubscribeFromChannel = useCallback((channelId: string) => {
        apiRef.current?.unsubscribe(channelId);
    }, []);

    return (
        <MastermindSocketContext.Provider
            value={{ status, subscribeToChannel, unsubscribeFromChannel }}
        >
            {children}
        </MastermindSocketContext.Provider>
    );
}

export function useMastermindSocket(): SocketContextValue {
    const ctx = useContext(MastermindSocketContext);
    if (!ctx) {
        throw new Error('useMastermindSocket must be used within MastermindSocketProvider');
    }
    return ctx;
}
