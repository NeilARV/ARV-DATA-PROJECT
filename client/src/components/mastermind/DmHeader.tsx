import { UserAvatar } from '@/components/mastermind/UserAvatar';

import type { DmUserWire } from '@shared/mastermind/events';

type DmHeaderProps = {
    otherUser: DmUserWire;
};

/** Header for a direct-message conversation: the counterparty's avatar + name (in place of #channel). */
export function DmHeader({ otherUser }: DmHeaderProps) {
    const name = `${otherUser.firstName} ${otherUser.lastName}`.trim();

    return (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0 bg-background min-h-[52px]">
            <UserAvatar user={otherUser} sizeClass="w-6 h-6" textClass="text-[10px]" />
            <span className="font-semibold text-foreground text-base truncate">{name}</span>
        </div>
    );
}
