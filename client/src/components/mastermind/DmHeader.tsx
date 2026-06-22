import { getAvatarColor } from '@/utils/avatar';

import type { DmUserWire } from '@shared/mastermind/events';

type DmHeaderProps = {
    otherUser: DmUserWire;
};

/** Header for a direct-message conversation: the counterparty's avatar + name (in place of #channel). */
export function DmHeader({ otherUser }: DmHeaderProps) {
    const name = `${otherUser.firstName} ${otherUser.lastName}`.trim();
    const initials =
        `${otherUser.firstName.charAt(0)}${otherUser.lastName.charAt(0)}`.toUpperCase() || '?';

    return (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0 bg-background min-h-[52px]">
            {otherUser.profileImageUrl ? (
                <img
                    src={otherUser.profileImageUrl}
                    alt={name}
                    className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                />
            ) : (
                <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: getAvatarColor(otherUser.id) }}
                >
                    {initials}
                </div>
            )}
            <span className="font-semibold text-foreground text-base truncate">{name}</span>
        </div>
    );
}
