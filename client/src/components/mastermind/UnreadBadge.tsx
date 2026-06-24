type UnreadBadgeProps = {
    count: number;
    hasMention: boolean;
};

/** Count pill for unread messages (channels and DMs); tinted when the unread set includes an
 *  @mention. Renders nothing when count is 0. */
export function UnreadBadge({ count, hasMention }: UnreadBadgeProps) {
    if (count === 0) return null;
    const label = count > 99 ? '99+' : String(count);
    return (
        <span className={`mm-unread-badge ${hasMention ? 'mm-unread-badge-mention' : ''}`}>
            {label}
        </span>
    );
}
