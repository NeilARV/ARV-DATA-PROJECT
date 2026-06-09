import type { MastermindMessageWire } from '@shared/mastermind/events';

const AVATAR_COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
];

function getAvatarColor(senderId: string): string {
    let hash = 0;
    for (let i = 0; i < senderId.length; i++) {
        hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

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
};

export function MessageItem({ message, showHeader }: MessageItemProps) {
    const { senderFirstName, senderLastName, senderId, senderProfileImageUrl } = message;
    const initials = `${senderFirstName.charAt(0)}${senderLastName.charAt(0)}`.toUpperCase();
    const avatarColor = getAvatarColor(senderId);
    const displayName = `${senderFirstName} ${senderLastName}`;

    return (
        <div
            className={`flex gap-3 px-4 hover:bg-accent/30 transition-colors group ${
                showHeader ? 'pt-3 pb-1' : 'py-0.5'
            }`}
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
                    <div className="text-sm text-foreground leading-relaxed">
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
