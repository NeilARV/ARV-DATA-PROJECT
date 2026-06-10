import { useEffect, useRef } from 'react';

import { getAvatarColor } from '@/utils/avatar';

import type { MastermindMessageWire } from '@shared/mastermind/events';

function formatTimestamp(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (date.toDateString() === now.toDateString()) return timeStr;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${timeStr}`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr;
}

type MessageItemProps = {
    message: MastermindMessageWire;
    showHeader: boolean;
    isHighlighted?: boolean;
};

export function MessageItem({ message, showHeader, isHighlighted = false }: MessageItemProps) {
    const { senderFirstName, senderLastName, senderId, senderProfileImageUrl } = message;
    const rootRef = useRef<HTMLDivElement>(null);
    const initials = `${senderFirstName.charAt(0)}${senderLastName.charAt(0)}`.toUpperCase();
    const avatarColor = getAvatarColor(senderId);
    const displayName = `${senderFirstName} ${senderLastName}`;

    // Deep-link target: bring the message into view when the highlight lands on it.
    useEffect(() => {
        if (isHighlighted) {
            rootRef.current?.scrollIntoView({ block: 'center' });
        }
    }, [isHighlighted]);

    return (
        <div
            ref={rootRef}
            className={`flex gap-3 px-4 hover:bg-accent/30 transition-colors group ${
                showHeader ? 'pt-3 pb-1' : 'py-0.5'
            }${isHighlighted ? ' mm-message-highlight' : ''}`}
        >
            {/* Avatar column — fixed 36px width keeps message bodies aligned */}
            <div className="w-9 flex-shrink-0 flex justify-center pt-0.5">
                {showHeader && (
                    senderProfileImageUrl ? (
                        <img
                            src={senderProfileImageUrl}
                            alt={displayName}
                            className="w-9 h-9 rounded-full object-cover"
                        />
                    ) : (
                        <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                            style={{ backgroundColor: avatarColor }}
                        >
                            {initials}
                        </div>
                    )
                )}
            </div>

            {/* Message body */}
            <div className="flex-1 min-w-0">
                {showHeader && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground">{displayName}</span>
                        <span className="text-xs text-muted-foreground">
                            {formatTimestamp(message.createdAt)}
                        </span>
                    </div>
                )}

                {message.isDeleted ? (
                    <p className="text-sm italic text-muted-foreground">This message was deleted.</p>
                ) : (
                    <div className="mastermind-message text-sm text-foreground leading-relaxed">
                        <span dangerouslySetInnerHTML={{ __html: message.content }} />
                        {message.isEdited && (
                            <span className="text-xs text-muted-foreground ml-1">(edited)</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
