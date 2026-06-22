import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useRoute, useSearch } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Brain, Loader2 } from 'lucide-react';

import Header from '@/components/Header';
import { ChannelSidebar } from '@/components/mastermind/ChannelSidebar';
import { ChannelHeader } from '@/components/mastermind/ChannelHeader';
import { ChannelPinBar } from '@/components/mastermind/ChannelPinBar';
import { MessageList } from '@/components/mastermind/MessageList';
import { MessageComposer } from '@/components/mastermind/MessageComposer';
import { DmConversationView } from '@/components/mastermind/DmConversationView';
import { DataProviders } from '@/components/DataProviders';
import { AppAccessLocked } from '@/components/auth/AppAccessGate';

import { useAuth } from '@/hooks/use-auth';
import { useMastermindSocket } from '@/hooks/use-mastermind-socket';

import { apiRequest, queryClient } from '@/lib/queryClient';

import type { ChannelSummary } from '@/types/mastermind';
import type { DmListResponse } from '@/api/dms.api';

type ChannelsResponse = { channels: ChannelSummary[] };

type UnreadEntry = { count: number; hasMention: boolean };

function MastermindContent() {
    const { isLoading, isAdminStatusLoading, canAccessMastermind, isOwner, isAdmin, user } =
        useAuth();
    const { lastChannelActivity } = useMastermindSocket();

    const search = useSearch();
    const [locationPath, setLocation] = useLocation();
    const [, routeParams] = useRoute('/mastermind/:channelName');
    const channelNameParam = routeParams?.channelName
        ? decodeURIComponent(routeParams.channelName)
        : null;
    // The DM route (/mastermind/dm/:userId) has two path segments, so it never matches the
    // single-segment channel route above — the two are mutually exclusive.
    const [, dmRouteParams] = useRoute('/mastermind/dm/:userId');
    const dmUserId = dmRouteParams?.userId ?? null;

    const [mobileTab, setMobileTab] = useState<'channels' | 'chat'>('channels');
    const [unreadState, setUnreadState] = useState<Map<string, UnreadEntry>>(new Map());
    const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);

    // Prevents re-seeding unread state when TanStack refetches /api/channels (e.g. on window
    // refocus). Live state is owned by WS events after the first seed — don't remove this ref.
    const unreadSeeded = useRef(false);
    // Tracks the pending debounced mark-read so we can flush it on channel switch.
    const markReadTimerRef = useRef<{ timer: ReturnType<typeof setTimeout>; channelId: string } | null>(null);

    const { data, isLoading: channelsLoading } = useQuery<ChannelsResponse>({
        queryKey: ['/api/channels'],
        enabled: canAccessMastermind,
    });
    const channels = data?.channels ?? [];

    const { data: dmsData } = useQuery<DmListResponse>({
        queryKey: ['/api/dms'],
        enabled: canAccessMastermind,
    });
    const dms = dmsData?.conversations ?? [];

    // The open channel is derived from the URL (/mastermind/<name>), not local state, so links
    // are shareable and browser back/forward works. Resolve the name to the loaded channel.
    const activeChannel = channelNameParam
        ? channels.find((c) => c.name === channelNameParam) ?? null
        : null;
    const activeChannelId = activeChannel?.id ?? null;

    // A DM is identified in the URL by the counterparty; resolve its channel id from the list
    // (null for a brand-new draft that has no channel yet).
    const activeDmChannelId = dmUserId
        ? dms.find((d) => d.otherUser.id === dmUserId)?.channelId ?? null
        : null;
    // The conversation currently open — channel or DM — keyed by channel id for unread/read-state.
    const activeConversationId = activeChannelId ?? activeDmChannelId;

    const markReadMutation = useMutation({
        mutationFn: (channelId: string) =>
            apiRequest('PATCH', `/api/channels/${channelId}/read`),
    });

    // Debounced mark-read — fires 1s after the last call. On channel switch, the previous
    // channel's pending mark-read is flushed immediately so it is never skipped.
    const scheduleMarkRead = useCallback(
        (channelId: string) => {
            if (markReadTimerRef.current !== null) {
                clearTimeout(markReadTimerRef.current.timer);
                if (markReadTimerRef.current.channelId !== channelId) {
                    markReadMutation.mutate(markReadTimerRef.current.channelId);
                }
                markReadTimerRef.current = null;
            }
            markReadTimerRef.current = {
                channelId,
                timer: setTimeout(() => {
                    markReadMutation.mutate(channelId);
                    markReadTimerRef.current = null;
                }, 1000),
            };
        },
        [markReadMutation.mutate],
    );

    // Flush pending mark-read on unmount so a quick navigation never drops it.
    useEffect(() => {
        return () => {
            if (markReadTimerRef.current !== null) {
                clearTimeout(markReadTimerRef.current.timer);
                markReadMutation.mutate(markReadTimerRef.current.channelId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clearUnread = useCallback((channelId: string) => {
        setUnreadState((prev) => new Map(prev).set(channelId, { count: 0, hasMention: false }));
    }, []);

    // Seed unread state once from the API response on initial load.
    useEffect(() => {
        if (unreadSeeded.current || channels.length === 0) return;
        unreadSeeded.current = true;
        setUnreadState(
            new Map(channels.map((c) => [c.id, { count: c.unreadCount, hasMention: c.hasMention }])),
        );
    }, [channels]);

    // Merge DM unread into the same channel-id-keyed map. Unlike channels (seeded once), a DM
    // conversation can appear later (a brand-new DM), so add any channel id not already tracked —
    // without clobbering live state that WS events already advanced.
    useEffect(() => {
        if (dms.length === 0) return;
        setUnreadState((prev) => {
            let changed = false;
            const next = new Map(prev);
            for (const dm of dms) {
                if (!next.has(dm.channelId)) {
                    next.set(dm.channelId, { count: dm.unreadCount, hasMention: false });
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [dms]);

    // Resolve the URL to a channel. A bare /mastermind or an unknown/archived channel name
    // redirects to the first channel, so the view is never empty and the URL always names the
    // open channel (this also self-heals stale deep-links).
    useEffect(() => {
        if (dmUserId) return; // a DM route is a valid destination — don't bounce it to a channel
        if (channels.length === 0) return;
        if (activeChannel) return;
        setLocation(`/mastermind/${encodeURIComponent(channels[0].name)}`, { replace: true });
    }, [channels, activeChannel, setLocation, dmUserId]);

    // Opening a conversation (channel or DM, via URL change) clears its unread badge and advances
    // read state. A brand-new draft DM has no channel id yet, so there is nothing to clear.
    useEffect(() => {
        if (!activeConversationId) return;
        clearUnread(activeConversationId);
        scheduleMarkRead(activeConversationId);
    }, [activeConversationId, clearUnread, scheduleMarkRead]);

    // Notification deep-link: /mastermind/<name>?m=<messageId>. The channel comes from the path;
    // only the highlight target rides as a query param. Capture it, switch to the chat pane on
    // mobile, then strip the query so a refresh or history-back doesn't re-fire the jump.
    useEffect(() => {
        const messageId = new URLSearchParams(search).get('m');
        if (!messageId) return;
        setHighlightMessageId(messageId);
        setMobileTab('chat');
        setLocation(locationPath, { replace: true });
    }, [search, locationPath, setLocation]);

    // Fallback release: a highlight whose target isn't in the loaded page (older message)
    // would otherwise linger and glow unexpectedly if backfill later loads that message.
    useEffect(() => {
        if (!highlightMessageId) return;
        const timer = setTimeout(() => setHighlightMessageId(null), 5000);
        return () => clearTimeout(timer);
    }, [highlightMessageId]);

    // React to cross-channel activity: a new message landed somewhere. The server doorbell
    // (broadcastToOtherUsers) already excludes the sender's own tabs and scopes admin-only
    // channels to admins/owners, so any event here is for a channel this user can see. Skip the
    // badge for the channel being viewed (advance its read state instead); bump unread for others.
    useEffect(() => {
        if (!lastChannelActivity) return;
        const { channelId } = lastChannelActivity;
        if (channelId === activeConversationId) {
            // User is already viewing this conversation — advance read state immediately.
            scheduleMarkRead(activeConversationId);
            return;
        }
        // Activity in a channel id we don't track yet is most likely a brand-new DM — refetch the
        // DM list so the conversation surfaces in the sidebar (its server unread is authoritative).
        const isKnownChannel = channels.some((c) => c.id === channelId);
        if (!isKnownChannel) {
            void queryClient.invalidateQueries({ queryKey: ['/api/dms'], exact: true });
        }
        const isMentioned =
            lastChannelActivity.mentionedEveryone ||
            lastChannelActivity.mentionedUserIds.includes(user?.id ?? '');
        setUnreadState((prev) => {
            const current = prev.get(channelId) ?? { count: 0, hasMention: false };
            return new Map(prev).set(channelId, {
                count: current.count + 1,
                hasMention: current.hasMention || isMentioned,
            });
        });
    }, [lastChannelActivity, activeConversationId, channels, user?.id, scheduleMarkRead]);

    function handleSelectChannel(id: string) {
        const channel = channels.find((c) => c.id === id);
        if (!channel) return;
        setMobileTab('chat');
        setLocation(`/mastermind/${encodeURIComponent(channel.name)}`);
    }

    function handleSelectDm(userId: string) {
        setMobileTab('chat');
        setLocation(`/mastermind/dm/${userId}`);
    }

    // The open channel is derived from the URL by name, so when the active channel is renamed or
    // deleted we must move the URL off the stale name (otherwise the user is stranded / bounced).
    function handleChannelRenamed(channelId: string, newName: string) {
        if (channelId !== activeChannelId) return;
        setLocation(`/mastermind/${encodeURIComponent(newName)}`, { replace: true });
    }

    function handleChannelDeleted(channelId: string) {
        if (channelId !== activeChannelId) return;
        setLocation('/mastermind', { replace: true });
    }

    // Merge live unread state into the channels list for the sidebar.
    const channelsWithUnread = channels.map((c) => {
        const live = unreadState.get(c.id);
        return live ? { ...c, unreadCount: live.count, hasMention: live.hasMention } : c;
    });

    // Same live-unread merge for the DM list.
    const dmsWithUnread = dms.map((dm) => {
        const live = unreadState.get(dm.channelId);
        return live ? { ...dm, unreadCount: live.count } : dm;
    });

    // Mobile chat-tab label: channel name, the DM counterparty's name, or a generic fallback.
    const activeDm = dmUserId ? dms.find((d) => d.otherUser.id === dmUserId) : null;
    const chatTabLabel = activeChannel
        ? `# ${activeChannel.name}`
        : activeDm
          ? `${activeDm.otherUser.firstName} ${activeDm.otherUser.lastName}`.trim()
          : dmUserId
            ? 'Message'
            : 'Chat';

    // ── Gate states ────────────────────────────────────────────────────────────

    if (isLoading || isAdminStatusLoading) {
        return (
            <div className="min-h-dvh flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Unauthenticated and authenticated-no-access both land here (canAccessMastermind covers both).
    // The shared panel branches internally: Log In / Sign Up for guests, Back + Contact Us for
    // signed-in users without a subscription or team role.
    if (!canAccessMastermind) {
        return (
            <div className="h-dvh flex flex-col">
                <Header />
                <div className="flex-1 overflow-hidden min-h-0">
                    <AppAccessLocked icon={Brain} redirect="/mastermind" />
                </div>
            </div>
        );
    }

    // ── Full layout ────────────────────────────────────────────────────────────

    return (
        <div className="h-dvh flex flex-col">
            <Header />

            {/* Mobile tab bar — hidden on md+ */}
            <div className="md:hidden flex-shrink-0 flex border-b border-border bg-background">
                <button
                    onClick={() => setMobileTab('channels')}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        mobileTab === 'channels'
                            ? 'text-primary border-b-2 border-primary -mb-px'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Channels
                </button>
                <button
                    onClick={() => setMobileTab('chat')}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        mobileTab === 'chat'
                            ? 'text-primary border-b-2 border-primary -mb-px'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {chatTabLabel}
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Channel sidebar — full-screen on mobile (tab-controlled), fixed width on md+ */}
                <div
                    className={`h-full flex-col overflow-hidden ${
                        mobileTab === 'channels' ? 'flex flex-1' : 'hidden'
                    } md:flex md:flex-none`}
                >
                    {channelsLoading ? (
                        <div className="flex items-center justify-center h-full bg-sidebar w-full md:w-60 lg:w-64">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <ChannelSidebar
                            channels={channelsWithUnread}
                            activeChannelId={activeChannelId}
                            onSelectChannel={handleSelectChannel}
                            canManageChannels={isOwner || isAdmin}
                            onChannelRenamed={handleChannelRenamed}
                            onChannelDeleted={handleChannelDeleted}
                            dms={dmsWithUnread}
                            activeDmUserId={dmUserId}
                            onSelectDm={handleSelectDm}
                        />
                    )}
                </div>

                {/* Main chat area — full-screen on mobile (tab-controlled), fills remaining space on md+ */}
                <div
                    className={`h-full flex-col flex-1 overflow-hidden bg-background ${
                        mobileTab === 'chat' ? 'flex' : 'hidden'
                    } md:flex`}
                >
                    {dmUserId ? (
                        <DmConversationView
                            key={`dm-${dmUserId}`}
                            otherUserId={dmUserId}
                            highlightMessageId={highlightMessageId}
                            onHighlightDone={() => setHighlightMessageId(null)}
                        />
                    ) : activeChannel ? (
                        <>
                            <ChannelHeader channel={activeChannel} />
                            <ChannelPinBar
                                channelId={activeChannel.id}
                                onJump={(messageId) => setHighlightMessageId(messageId)}
                            />
                            <MessageList
                                channelId={activeChannel.id}
                                highlightMessageId={highlightMessageId}
                                onHighlightDone={() => setHighlightMessageId(null)}
                            />
                            <MessageComposer
                                key={activeChannel.id}
                                mode="channel"
                                channelId={activeChannel.id}
                                channelName={activeChannel.name}
                            />
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                            Select a channel to get started
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function Mastermind() {
    return (
        <DataProviders>
            <MastermindContent />
        </DataProviders>
    );
}
