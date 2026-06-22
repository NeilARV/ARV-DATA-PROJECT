import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { MessageSquarePlus, Store } from 'lucide-react';

import { MastermindCard } from '@/components/mastermind/MastermindCard';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { fetchVendor } from '@/api/vendors.api';
import { getAvatarColor } from '@/utils/avatar';

// Vendor cards are wider to give the description room; user cards stay compact. The portal
// uses the same width to clamp the card on-screen, so these stay the single source of truth.
const USER_CARD_WIDTH = 288;
const VENDOR_CARD_WIDTH = 340;

type MemberRow = {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
};

type ActiveCard = {
    kind: 'user' | 'vendor';
    id: string;
    label: string;
    rect: DOMRect;
};

// Mention chips are injected as raw HTML (dangerouslySetInnerHTML), so the card is driven by
// event delegation on the message container rather than per-chip React handlers. The card opens
// on CLICK only and stays until the user clicks elsewhere, presses Escape, hits its X, or scrolls.
const CHIP_SELECTOR = 'span[data-type="mention"], span[data-type="vendorMention"]';

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
    return (first + last).toUpperCase();
}

export function useMentionCard(channelId: string) {
    const [active, setActive] = useState<ActiveCard | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const [, setLocation] = useLocation();
    const { user } = useAuth();

    const closeCard = useCallback(() => setActive(null), []);

    // Shares the cache with the composer's member query (same key), so the list is usually warm.
    const { data: membersData } = useQuery({
        queryKey: [`/api/channels/${channelId}/members`],
        queryFn: () =>
            apiRequest('GET', `/api/channels/${channelId}/members`).then((r) => r.json()) as Promise<{
                users: MemberRow[];
            }>,
        staleTime: 2 * 60 * 1000,
        enabled: !!channelId,
    });

    const vendorQuery = useQuery({
        queryKey: ['vendor', active?.kind === 'vendor' ? active.id : null],
        queryFn: () => fetchVendor(active!.id),
        enabled: active?.kind === 'vendor',
        staleTime: 5 * 60 * 1000,
    });

    const onContainerClick = useCallback((e: React.MouseEvent) => {
        const chip = (e.target as Element).closest?.(CHIP_SELECTOR) as HTMLElement | null;
        // Only rendered-message chips open a card — ignore chips inside the inline edit composer.
        if (!chip || !chip.closest('.mastermind-message')) return;
        const id = chip.getAttribute('data-id') ?? '';
        // @channel (broadcast) carries a sentinel id and gets no card.
        if (!id || id.startsWith('@')) return;
        const kind = chip.getAttribute('data-type') === 'vendorMention' ? 'vendor' : 'user';
        const label = chip.getAttribute('data-label') ?? chip.textContent?.replace(/^@/, '') ?? '';
        setActive({ kind, id, label, rect: chip.getBoundingClientRect() });
    }, []);

    // Click-outside (ignoring chips, which the container handler owns) + Escape close the card.
    useEffect(() => {
        if (!active) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Element;
            if (cardRef.current?.contains(target)) return;
            if (target.closest?.(CHIP_SELECTOR)) return;
            setActive(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setActive(null);
        };
        // The card is pinned to a rect captured at click time; a resize (or mobile keyboard
        // show/hide) invalidates that anchor, so close rather than render it at a stale spot.
        const onResize = () => setActive(null);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onResize);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onResize);
        };
    }, [active]);

    let cardNode: React.ReactNode = null;
    if (active) {
        const { rect } = active;
        const cardWidth = active.kind === 'vendor' ? VENDOR_CARD_WIDTH : USER_CARD_WIDTH;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - cardWidth - 8));
        // Open below the chip, or above it when the chip sits in the lower half of the viewport.
        const openBelow = rect.top < window.innerHeight / 2;
        const vertical = openBelow
            ? { top: rect.bottom + 6 }
            : { bottom: window.innerHeight - rect.top + 6 };

        const card =
            active.kind === 'vendor' ? (
                <MastermindCard
                    name={vendorQuery.data?.name ?? active.label}
                    nameHref={`/vendors?vendor=${active.id}`}
                    imageUrl={vendorQuery.data?.logoUrl}
                    fallbackIcon={Store}
                    description={vendorQuery.data?.description}
                    phone={vendorQuery.data?.phone}
                    website={vendorQuery.data?.website}
                    isLoading={vendorQuery.isLoading}
                    width={VENDOR_CARD_WIDTH}
                    onClose={closeCard}
                />
            ) : (
                (() => {
                    const member = membersData?.users.find((m) => m.id === active.id);
                    const name = member
                        ? `${member.firstName} ${member.lastName}`
                        : active.label;
                    // No "Send message" on your own chip — you can't DM yourself.
                    const isSelf = active.id === user?.id;
                    return (
                        <MastermindCard
                            name={name}
                            imageUrl={member?.profileImageUrl}
                            initials={initialsFromName(name)}
                            avatarColor={getAvatarColor(active.id)}
                            actionLabel={isSelf ? undefined : 'Send message'}
                            actionIcon={isSelf ? undefined : MessageSquarePlus}
                            onAction={
                                isSelf
                                    ? undefined
                                    : () => {
                                          closeCard();
                                          setLocation(`/mastermind/dm/${active.id}`);
                                      }
                            }
                            onClose={closeCard}
                        />
                    );
                })()
            );

        cardNode = createPortal(
            <div ref={cardRef} className="fixed z-[99999]" style={{ left, ...vertical }}>
                {card}
            </div>,
            document.body,
        );
    }

    return { onContainerClick, closeCard, cardNode };
}
