import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Bell, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useNotifications } from '@/hooks/use-notifications';

import { getAvatarColor } from '@/utils/avatar';

import type { NotificationWire } from '@shared/mastermind/events';

function formatRelativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function notificationText(n: NotificationWire): string {
    const channel = n.channelName ? `#${n.channelName}` : 'a channel';
    return n.type === 'channel_mention'
        ? `mentioned everyone in ${channel}`
        : `mentioned you in ${channel}`;
}

export function NotificationBell() {
    const [, setLocation] = useLocation();
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [open]);

    function handleNotificationClick(n: NotificationWire) {
        if (!n.isRead) markRead(n.id);
        setOpen(false);
        if (n.channelName) {
            const base = `/mastermind/${encodeURIComponent(n.channelName)}`;
            setLocation(n.messageId ? `${base}?m=${n.messageId}` : base);
        }
    }

    const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => setOpen(!open)}
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                data-testid="button-notification-bell"
            >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none">
                        {badgeLabel}
                    </span>
                )}
            </Button>

            {open && (
                <div
                    className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-background border border-border rounded-md shadow-lg z-[502]"
                    data-testid="notification-dropdown"
                >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                        <span className="text-sm font-semibold text-foreground">Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                onClick={() => markAllRead()}
                                data-testid="button-mark-all-read"
                            >
                                <Check className="w-3 h-3" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto py-1">
                        {notifications.length === 0 ? (
                            <p className="px-3 py-6 text-sm text-muted-foreground text-center">
                                No notifications yet
                            </p>
                        ) : (
                            notifications.map((n) => (
                                <NotificationItem
                                    key={n.id}
                                    notification={n}
                                    onClick={() => handleNotificationClick(n)}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

type NotificationItemProps = {
    notification: NotificationWire;
    onClick: () => void;
};

function NotificationItem({ notification, onClick }: NotificationItemProps) {
    const { actorId, actorFirstName, actorLastName, actorProfileImageUrl } = notification;
    const actorName =
        actorFirstName || actorLastName
            ? `${actorFirstName ?? ''} ${actorLastName ?? ''}`.trim()
            : 'Someone';
    const initials =
        `${(actorFirstName ?? '?').charAt(0)}${(actorLastName ?? '').charAt(0)}`.toUpperCase();

    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-accent transition-colors"
        >
            {actorProfileImageUrl ? (
                <img
                    src={actorProfileImageUrl}
                    alt={actorName}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5"
                />
            ) : (
                <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: getAvatarColor(actorId ?? 'unknown') }}
                >
                    {initials}
                </div>
            )}

            <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                    <span className="font-semibold">{actorName}</span>{' '}
                    {notificationText(notification)}
                </p>
                {notification.messageExcerpt && (
                    <p className="text-sm text-muted-foreground truncate">
                        {notification.messageExcerpt}
                    </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(notification.createdAt)}
                </p>
            </div>

            {!notification.isRead && (
                <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
            )}
        </button>
    );
}
