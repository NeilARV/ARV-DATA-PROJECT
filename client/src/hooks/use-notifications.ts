import { useMutation, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';

import { apiRequest, queryClient } from '@/lib/queryClient';
import {
    NOTIFICATIONS_QUERY_KEY,
    type NotificationsResponse,
} from '@/lib/mastermind-notifications';

import type { NotificationWire } from '@shared/mastermind/events';

type UseNotificationsValue = {
    notifications: NotificationWire[];
    unreadCount: number;
    isLoading: boolean;
    markRead: (id: string) => void;
    markAllRead: () => void;
};

function setCache(updater: (old: NotificationsResponse) => NotificationsResponse) {
    queryClient.setQueryData<NotificationsResponse>(NOTIFICATIONS_QUERY_KEY, (old) =>
        old ? updater(old) : old,
    );
}

export function useNotifications(): UseNotificationsValue {
    // TEMPORARY: notifications are Mastermind-only, and Mastermind is admin/owner-only for now —
    // don't fetch the feed for non-admins. Revert to `canAccessApp` when Mastermind opens up.
    const { isAuthenticated, canAccessMastermind } = useAuth();

    const { data, isLoading } = useQuery<NotificationsResponse>({
        queryKey: NOTIFICATIONS_QUERY_KEY,
        enabled: isAuthenticated && canAccessMastermind,
        staleTime: Infinity, // live socket events keep this cache current
    });

    const markReadMutation = useMutation({
        mutationFn: (id: string) => apiRequest('PATCH', `/api/notifications/${id}/read`),
        onMutate: (id: string) => {
            setCache((old) => ({
                notifications: old.notifications.map((n) =>
                    n.id === id ? { ...n, isRead: true } : n,
                ),
                unreadCount: Math.max(
                    0,
                    old.unreadCount -
                        (old.notifications.some((n) => n.id === id && !n.isRead) ? 1 : 0),
                ),
            }));
        },
        onError: () => {
            void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
        },
    });

    const markAllReadMutation = useMutation({
        mutationFn: () => apiRequest('PATCH', '/api/notifications/read-all'),
        onMutate: () => {
            setCache((old) => ({
                notifications: old.notifications.map((n) => ({ ...n, isRead: true })),
                unreadCount: 0,
            }));
        },
        onError: () => {
            void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
        },
    });

    return {
        notifications: data?.notifications ?? [],
        unreadCount: data?.unreadCount ?? 0,
        isLoading,
        markRead: markReadMutation.mutate,
        markAllRead: markAllReadMutation.mutate,
    };
}
