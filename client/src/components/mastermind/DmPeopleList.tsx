import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/mastermind/UserAvatar';
import { UnreadBadge } from '@/components/mastermind/UnreadBadge';

import { fetchDmCandidates, type DmCandidate } from '@/api/dms.api';
import { formatUserName } from '@/utils/name';
import type { DirectMessageSummaryWire, DmUserWire } from '@shared/mastermind/events';

type DmPeopleListProps = {
    dms: DirectMessageSummaryWire[];
    activeDmUserId: string | null;
    onSelectDm: (userId: string) => void;
};

// A single row in the unified list: any eligible person, carrying their unread count (0 for someone
// the user hasn't messaged yet). `isConversation` marks people the user already has a DM with, so the
// list can draw a divider where conversations end and other suggestions begin.
type PersonRow = { user: DmUserWire; unreadCount: number; isConversation: boolean };

// Idle suggestions are capped so the list fills the sidebar's spare height without scrolling forever;
// to reach anyone beyond the cap the user searches. Search results allow a few more, with scroll.
const MAX_SUGGESTIONS = 15;
const MAX_SEARCH_RESULTS = 25;

/**
 * Inline people picker that lives below the "Direct Messages" header (replaces the old modal). Renders
 * one unified list: people the user has conversations with first (most recent first, with unread
 * badges), then everyone else A–Z, capped when idle. Typing searches the whole list by name. Selecting
 * a person opens (or drafts) a DM via `onSelectDm`.
 */
export function DmPeopleList({ dms, activeDmUserId, onSelectDm }: DmPeopleListProps) {
    const [search, setSearch] = useState('');

    const { data: candidates, isLoading } = useQuery<DmCandidate[]>({
        queryKey: ['/api/dms/candidates'],
        queryFn: fetchDmCandidates,
        staleTime: 2 * 60 * 1000,
    });

    const q = search.trim().toLowerCase();
    const isSearching = q.length > 0;

    // Conversations first (most recent first), then every other eligible person A–Z. One list so an
    // active or past conversation always sits among the suggestions rather than in a separate block.
    const conversationRows: PersonRow[] = [...dms]
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
        .map((d) => ({ user: d.otherUser, unreadCount: d.unreadCount, isConversation: true }));

    const dmUserIds = new Set(dms.map((d) => d.otherUser.id));
    const otherRows: PersonRow[] = (candidates ?? [])
        .filter((u) => !dmUserIds.has(u.id))
        .sort((a, b) => formatUserName(a).localeCompare(formatUserName(b)))
        .map((u) => ({ user: u, unreadCount: 0, isConversation: false }));

    const allRows = [...conversationRows, ...otherRows];
    const rows = isSearching
        ? allRows
              .filter((r) => formatUserName(r.user).toLowerCase().includes(q))
              .slice(0, MAX_SEARCH_RESULTS)
        : allRows.slice(0, MAX_SUGGESTIONS);

    let listContent: React.ReactNode;
    if (rows.length > 0) {
        listContent = (
            <ul>
                {rows.map(({ user, unreadCount, isConversation }, i) => {
                    const isActive = activeDmUserId === user.id;
                    const hasUnread = unreadCount > 0;
                    const name = formatUserName(user);
                    // Divider where conversations end and other people begin (only when both groups show).
                    const showDivider = !isConversation && i > 0 && rows[i - 1].isConversation;
                    return (
                        <li key={user.id}>
                            {showDivider && (
                                <div
                                    className="mx-3 my-1.5 border-t border-sidebar-border"
                                    role="separator"
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => onSelectDm(user.id)}
                                className={`mm-channel-item ${isActive ? 'mm-channel-item-active' : ''}`}
                            >
                                <UserAvatar user={user} sizeClass="w-4 h-4" textClass="text-[8px]" />
                                <span
                                    className={`truncate flex-1 ${hasUnread && !isActive ? 'font-semibold text-foreground' : ''}`}
                                >
                                    {name}
                                </span>
                                {!isActive && <UnreadBadge count={unreadCount} hasMention={false} />}
                            </button>
                        </li>
                    );
                })}
            </ul>
        );
    } else if (isLoading) {
        listContent = null; // hold the empty message until candidates resolve
    } else {
        listContent = (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">
                {isSearching ? 'No people found' : 'No people to show'}
            </p>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="px-3 mb-3 flex-shrink-0">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search people…"
                        className="pl-8 h-8"
                        aria-label="Search people"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">{listContent}</div>
        </div>
    );
}
