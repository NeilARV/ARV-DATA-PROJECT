import { getAvatarColor, getInitials } from '@/utils/avatar';

import type { DmUserWire } from '@shared/mastermind/events';

type UserAvatarProps = {
    user: DmUserWire;
    /** Tailwind size classes for the avatar box, e.g. "w-6 h-6". */
    sizeClass: string;
    /** Tailwind text-size class for the initials fallback, e.g. "text-[10px]" — unused when a profile image is present. */
    textClass?: string;
    className?: string;
};

/**
 * A user's avatar: their profile image, or a deterministic colored circle with their initials.
 * The single source of truth for member/counterparty avatars across the Mastermind UI so the
 * markup and the empty-name fallback can't drift between call sites.
 */
export function UserAvatar({ user, sizeClass, textClass = '', className = '' }: UserAvatarProps) {
    const name = `${user.firstName} ${user.lastName}`.trim();
    if (user.profileImageUrl) {
        return (
            <img
                src={user.profileImageUrl}
                alt={name}
                className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
            />
        );
    }
    return (
        <div
            className={`${sizeClass} ${textClass} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ${className}`}
            style={{ backgroundColor: getAvatarColor(user.id) }}
        >
            {getInitials(user.firstName, user.lastName)}
        </div>
    );
}
