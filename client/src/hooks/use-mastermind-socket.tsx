import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';

import { queryClient } from '@/lib/queryClient';
import {
    messagesQueryKey,
    pinQueryKey,
    mergeMessages,
    applyMessageMutation,
    applyReactionDelta,
} from '@/lib/mastermind-messages';
import {
    NOTIFICATIONS_QUERY_KEY,
    type NotificationsResponse,
} from '@/lib/mastermind-notifications';
import {
    ClientToServer,
    ServerToClient,
    MASTERMIND_WS_PATH,
    type MastermindMessageWire,
    type NotificationWire,
    type PinnedMessageWire,
} from '@shared/mastermind/events';

export { messagesQueryKey, mergeMessages };

type SocketStatus = 'connecting' | 'open' | 'closed';

type SocketContextValue = {
    status: SocketStatus;
    subscribeToChannel: (channelId: string) => void;
    unsubscribeFromChannel: (channelId: string) => void;
    lastCreatedMessage: MastermindMessageWire | null;
};

const MastermindSocketContext = createContext<SocketContextValue | null>(null);

const MAX_RECONNECT_DELAY_MS = 30_000;

export function MastermindSocketProvider({ children }: { children: ReactNode }) {
    // TEMPORARY: Mastermind is admin/owner-only for now, so only open the WS for admins/owners.
    // Revert to `canAccessApp` when Mastermind becomes generally available.
    const { isAuthenticated, canAccessMastermind, user } = useAuth();
    const [status, setStatus] = useState<SocketStatus>('closed');
    const [lastCreatedMessage, setLastCreatedMessage] = useState<MastermindMessageWire | null>(null);

    // Latest viewer id without re-subscribing the socket; read inside WS event handlers.
    const viewerIdRef = useRef<string | undefined>(undefined);
    viewerIdRef.current = user?.id;
    const apiRef = useRef<{
        subscribe: (channelId: string) => void;
        unsubscribe: (channelId: string) => void;
    } | null>(null);

    useEffect(() => {
        if (!isAuthenticated || !canAccessMastermind) return;

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

            const evt = data as {
                type?: string;
                message?: MastermindMessageWire;
                notification?: NotificationWire;
                pinned?: PinnedMessageWire | null;
                channelId?: string;
                messageId?: string;
                emoji?: string;
                userId?: string;
                action?: 'add' | 'remove';
            };

            if (evt.type === ServerToClient.MessageCreated) {
                const message = evt.message;
                if (message && typeof message.channelId === 'string') {
                    queryClient.setQueryData<MastermindMessageWire[]>(
                        messagesQueryKey(message.channelId),
                        (old) => mergeMessages(old ?? [], [message]),
                    );
                    setLastCreatedMessage(message);
                }
                return;
            }

            // Edits/deletes merge field-wise so live reaction/attachment state survives.
            if (
                evt.type === ServerToClient.MessageUpdated ||
                evt.type === ServerToClient.MessageDeleted
            ) {
                const message = evt.message;
                if (message && typeof message.channelId === 'string') {
                    queryClient.setQueryData<MastermindMessageWire[]>(
                        messagesQueryKey(message.channelId),
                        (old) => applyMessageMutation(old ?? [], message),
                    );
                    // A deleted message can never stay pinned.
                    if (evt.type === ServerToClient.MessageDeleted) {
                        queryClient.setQueryData<{ pinned: PinnedMessageWire | null }>(
                            pinQueryKey(message.channelId),
                            (old) =>
                                old?.pinned?.message.id === message.id ? { pinned: null } : old,
                        );
                    }
                }
                return;
            }

            if (
                evt.type === ServerToClient.ReactionChanged &&
                typeof evt.channelId === 'string' &&
                typeof evt.messageId === 'string' &&
                typeof evt.emoji === 'string' &&
                typeof evt.userId === 'string' &&
                (evt.action === 'add' || evt.action === 'remove')
            ) {
                queryClient.setQueryData<MastermindMessageWire[]>(
                    messagesQueryKey(evt.channelId),
                    (old) =>
                        applyReactionDelta(
                            old ?? [],
                            {
                                messageId: evt.messageId!,
                                emoji: evt.emoji!,
                                userId: evt.userId!,
                                action: evt.action!,
                            },
                            viewerIdRef.current,
                        ),
                );
                return;
            }

            if (evt.type === ServerToClient.MessagePinned && typeof evt.channelId === 'string') {
                queryClient.setQueryData<{ pinned: PinnedMessageWire | null }>(
                    pinQueryKey(evt.channelId),
                    { pinned: evt.pinned ?? null },
                );
                return;
            }

            if (evt.type === ServerToClient.NotificationCreated) {
                const notification = evt.notification;
                if (!notification || typeof notification.id !== 'string') return;
                // Prepend into the bell-feed cache; the first GET seeds it if absent.
                queryClient.setQueryData<NotificationsResponse>(
                    NOTIFICATIONS_QUERY_KEY,
                    (old) => {
                        if (!old || old.notifications.some((n) => n.id === notification.id)) {
                            return old;
                        }
                        return {
                            notifications: [notification, ...old.notifications],
                            unreadCount: old.unreadCount + 1,
                        };
                    },
                );
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
    }, [isAuthenticated, canAccessMastermind]);

    const subscribeToChannel = useCallback((channelId: string) => {
        apiRef.current?.subscribe(channelId);
    }, []);
    const unsubscribeFromChannel = useCallback((channelId: string) => {
        apiRef.current?.unsubscribe(channelId);
    }, []);

    return (
        <MastermindSocketContext.Provider
            value={{ status, subscribeToChannel, unsubscribeFromChannel, lastCreatedMessage }}
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
