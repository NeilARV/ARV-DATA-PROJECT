import type { NotificationWire } from '@shared/mastermind/events';

// The bell-feed cache key. The REST load and live socket prepends both write here,
// so useNotifications and the socket provider must agree on it.
export const NOTIFICATIONS_QUERY_KEY = ['/api/notifications'] as const;

export type NotificationsResponse = {
    notifications: NotificationWire[];
    unreadCount: number;
};
