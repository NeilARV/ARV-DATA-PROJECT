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

import { MapProvider } from '@/hooks/useMap';
import { FiltersProvider } from '@/hooks/useFilters';
import { CompaniesProvider } from '@/hooks/useCompanies';
import { PropertiesProvider } from '@/hooks/useProperties';
import { PropertyProvider } from '@/hooks/useProperty';
import { useAuth } from '@/hooks/use-auth';
import { useDialogs } from '@/hooks/useDialogs';
import { useMastermindSocket } from '@/hooks/use-mastermind-socket';

import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';

import type { ChannelSummary } from '@/types/mastermind';

type ChannelsResponse = { channels: ChannelSummary[] };

type UnreadEntry = { count: number; hasMention: boolean };

function MastermindContent() {
    const { isLoading, isAdminStatusLoading, isAuthenticated, canAccessApp, user } = useAuth();
    const { openDialog } = useDialogs();
    const { lastCreatedMessage } = useMastermindSocket();

    const search = useSearch();
    const [locationPath, setLocation] = useLocation();
    const [, routeParams] = useRoute('/mastermind/:channelName');
    const channelNameParam = routeParams?.channelName
        ? decodeURIComponent(routeParams.channelName)
        : null;

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
        enabled: canAccessApp,
    });
    const channels = data?.channels ?? [];

    // The open channel is derived from the URL (/mastermind/<name>), not local state, so links
    // are shareable and browser back/forward works. Resolve the name to the loaded channel.
    const activeChannel = channelNameParam
        ? channels.find((c) => c.name === channelNameParam) ?? null
        : null;
    const activeChannelId = activeChannel?.id ?? null;

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

    // Resolve the URL to a channel. A bare /mastermind or an unknown/archived channel name
    // redirects to the first channel, so the view is never empty and the URL always names the
    // open channel (this also self-heals stale deep-links).
    useEffect(() => {
        if (channels.length === 0) return;
        if (activeChannel) return;
        setLocation(`/mastermind/${encodeURIComponent(channels[0].name)}`, { replace: true });
    }, [channels, activeChannel, setLocation]);

    // Opening a channel (via URL change) clears its unread badge and advances read state.
    useEffect(() => {
        if (!activeChannelId) return;
        clearUnread(activeChannelId);
        scheduleMarkRead(activeChannelId);
    }, [activeChannelId, clearUnread, scheduleMarkRead]);

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

    // React to incoming WS messages: skip badge for the active channel; increment for others.
    // NOTE: The client currently subscribes to one channel at a time, so lastCreatedMessage
    // will always be for the active channel. Cross-channel badge updates will become live
    // in Part 8 when broadcastToUser delivers notification events across all subscriptions.
    useEffect(() => {
        if (!lastCreatedMessage) return;
        // Never count the user's own messages as unread.
        if (lastCreatedMessage.senderId === user?.id) return;
        if (lastCreatedMessage.channelId === activeChannelId) {
            // User is already viewing this channel — advance read state immediately.
            scheduleMarkRead(activeChannelId);
            return;
        }
        const isMentioned =
            (lastCreatedMessage.mentionedEveryone ?? false) ||
            (lastCreatedMessage.mentionedUserIds ?? []).includes(user?.id ?? '');
        setUnreadState((prev) => {
            const current = prev.get(lastCreatedMessage.channelId) ?? {
                count: 0,
                hasMention: false,
            };
            return new Map(prev).set(lastCreatedMessage.channelId, {
                count: current.count + 1,
                hasMention: current.hasMention || isMentioned,
            });
        });
    }, [lastCreatedMessage, activeChannelId, user?.id, scheduleMarkRead]);

    function handleSelectChannel(id: string) {
        const channel = channels.find((c) => c.id === id);
        if (!channel) return;
        setMobileTab('chat');
        setLocation(`/mastermind/${encodeURIComponent(channel.name)}`);
    }

    // Merge live unread state into the channels list for the sidebar.
    const channelsWithUnread = channels.map((c) => {
        const live = unreadState.get(c.id);
        return live ? { ...c, unreadCount: live.count, hasMention: live.hasMention } : c;
    });

    // ── Gate states ────────────────────────────────────────────────────────────

    if (isLoading || isAdminStatusLoading) {
        return (
            <div className="min-h-dvh flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
                <Brain className="w-10 h-10 text-muted-foreground" />
                <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">
                        Sign in to access Mastermind
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Join the ARV community and connect with other investors.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog({ type: 'login' })}
                    >
                        Log In
                    </Button>
                    <Button size="sm" onClick={() => openDialog({ type: 'signup' })}>
                        Sign Up
                    </Button>
                </div>
            </div>
        );
    }

    if (!canAccessApp) {
        return (
            <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
                <Brain className="w-10 h-10 text-muted-foreground" />
                <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">Subscription required</p>
                    <p className="text-sm text-muted-foreground">
                        Mastermind is available to ARV subscribers and team members.
                    </p>
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
                    {activeChannel ? `# ${activeChannel.name}` : 'Chat'}
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
                        />
                    )}
                </div>

                {/* Main chat area — full-screen on mobile (tab-controlled), fills remaining space on md+ */}
                <div
                    className={`h-full flex-col flex-1 overflow-hidden bg-background ${
                        mobileTab === 'chat' ? 'flex' : 'hidden'
                    } md:flex`}
                >
                    {activeChannel ? (
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
        <MapProvider>
            <FiltersProvider>
                <CompaniesProvider>
                    <PropertiesProvider>
                        <PropertyProvider>
                            <MastermindContent />
                        </PropertyProvider>
                    </PropertiesProvider>
                </CompaniesProvider>
            </FiltersProvider>
        </MapProvider>
    );
}
