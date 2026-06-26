import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Bell, Check, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ResendVerificationModal } from '@/components/auth/ResendVerificationModal';

import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-notifications';

import { getAvatarColor } from '@/utils/avatar';

import type {
    NotificationWire,
    NotificationMetadata,
    DealBidNotificationMetadata,
    CodeViolationNotificationMetadata,
} from '@shared/mastermind/events';

// metadata is a union keyed by notification type; narrow before reading type-specific fields.
function isDealBidMeta(m: NotificationMetadata | null): m is DealBidNotificationMetadata {
    return m != null && 'amount' in m;
}
function isCodeViolationMeta(m: NotificationMetadata | null): m is CodeViolationNotificationMetadata {
    return m != null && 'cvViolationId' in m;
}

// Cap the dropdown at the 10 most recent; matches the server feed limit and guards against
// real-time pushes growing the in-memory list beyond what we want to display.
const MAX_VISIBLE_NOTIFICATIONS = 10;

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
    if (n.type === 'code_violation') {
        const address = isCodeViolationMeta(n.metadata) ? n.metadata.address : '';
        return address ? `Code violation reported at ${address}` : 'Code violation reported';
    }
    if (n.type === 'deal_bid') {
        const amount =
            isDealBidMeta(n.metadata) && n.metadata.amount
                ? `$${Number(n.metadata.amount).toLocaleString()}`
                : 'an offer';
        return `submitted an offer of ${amount}`;
    }
    if (n.type === 'direct_message') return 'sent you a message';
    const channel = n.channelName ? `#${n.channelName}` : 'a channel';
    if (n.type === 'announcement') return `made an announcement in ${channel}`;
    return n.type === 'channel_mention'
        ? `mentioned everyone in ${channel}`
        : `mentioned you in ${channel}`;
}

// Secondary line under the actor row: the deal address for offers, the violation type for
// a code violation, else the message excerpt.
function notificationDetail(n: NotificationWire): string {
    if (n.type === 'code_violation') {
        return isCodeViolationMeta(n.metadata) ? (n.metadata.violationType ?? '') : '';
    }
    if (n.type === 'deal_bid') {
        return isDealBidMeta(n.metadata) ? (n.metadata.address ?? '') : '';
    }
    return n.messageExcerpt;
}

export function NotificationBell() {
    const [, setLocation] = useLocation();
    const { hasUnverifiedEmail } = useAuth();
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
    const [open, setOpen] = useState(false);
    const [resendOpen, setResendOpen] = useState(false);
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
        if (n.type === 'code_violation') {
            if (isCodeViolationMeta(n.metadata)) {
                setLocation(`/data?propertyId=${n.metadata.propertyId}`);
            }
            return;
        }
        if (n.type === 'deal_bid' && n.dealId != null) {
            setLocation(`/deals?dealId=${n.dealId}`);
            return;
        }
        if (n.type === 'direct_message' && n.actorId) {
            setLocation(`/mastermind/dm/${n.actorId}`);
            return;
        }
        if (n.channelName) {
            const base = `/mastermind/${encodeURIComponent(n.channelName)}`;
            setLocation(n.messageId ? `${base}?m=${n.messageId}` : base);
        }
    }

    // A critical alert (unverified email) outranks the numeric unread count: the badge shows
    // "!" instead of a number so it reads as action-required, not just "you have messages".
    const showBadge = hasUnverifiedEmail || unreadCount > 0;
    const badgeLabel = hasUnverifiedEmail ? '!' : unreadCount > 99 ? '99+' : String(unreadCount);

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => setOpen(!open)}
                aria-label={
                    hasUnverifiedEmail
                        ? 'Notifications (action required: verify your email)'
                        : `Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`
                }
                data-testid="button-notification-bell"
            >
                <Bell className="w-4 h-4" />
                {showBadge && (
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
                        {hasUnverifiedEmail && (
                            <div
                                className="flex items-start gap-2.5 px-3 py-2 border-b border-border bg-destructive/5"
                                data-testid="notification-verify-email"
                            >
                                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground">
                                        Verify your email
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Confirm your email to post deals, submit offers, and join
                                        the community.
                                    </p>
                                    <button
                                        type="button"
                                        className="mt-1 text-xs font-medium text-primary hover:underline"
                                        onClick={() => {
                                            setOpen(false);
                                            setResendOpen(true);
                                        }}
                                        data-testid="button-verify-email-resend"
                                    >
                                        Resend verification email
                                    </button>
                                </div>
                            </div>
                        )}

                        {notifications.length === 0 && !hasUnverifiedEmail ? (
                            <p className="px-3 py-6 text-sm text-muted-foreground text-center">
                                No notifications yet
                            </p>
                        ) : (
                            notifications.slice(0, MAX_VISIBLE_NOTIFICATIONS).map((n) => (
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

            <ResendVerificationModal open={resendOpen} onClose={() => setResendOpen(false)} />
        </div>
    );
}

type NotificationItemProps = {
    notification: NotificationWire;
    onClick: () => void;
};

function NotificationItem({ notification, onClick }: NotificationItemProps) {
    const { actorId, actorFirstName, actorLastName, actorProfileImageUrl } = notification;
    // A code violation is a system alert with no human actor — render an alert glyph and
    // drop the "{name} did X" framing the other types use.
    const isCodeViolation = notification.type === 'code_violation';
    const actorName =
        actorFirstName || actorLastName
            ? `${actorFirstName ?? ''} ${actorLastName ?? ''}`.trim()
            : 'Someone';
    const initials =
        `${(actorFirstName ?? '?').charAt(0)}${(actorLastName ?? '').charAt(0)}`.toUpperCase();
    const detail = notificationDetail(notification);

    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-accent transition-colors"
        >
            {isCodeViolation ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-destructive/10 text-destructive flex-shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                </div>
            ) : actorProfileImageUrl ? (
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
                    {isCodeViolation ? (
                        <span className="font-semibold">{notificationText(notification)}</span>
                    ) : (
                        <>
                            <span className="font-semibold">{actorName}</span>{' '}
                            {notificationText(notification)}
                        </>
                    )}
                </p>
                {detail && (
                    <p className="text-sm text-muted-foreground truncate">{detail}</p>
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
