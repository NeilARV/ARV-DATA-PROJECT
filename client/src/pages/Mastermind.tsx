import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, Loader2 } from 'lucide-react';

import Header from '@/components/Header';
import { ChannelSidebar } from '@/components/mastermind/ChannelSidebar';
import { ChannelHeader } from '@/components/mastermind/ChannelHeader';
import { MessageList } from '@/components/mastermind/MessageList';
import { MessageComposer } from '@/components/mastermind/MessageComposer';

import { MapProvider } from '@/hooks/useMap';
import { FiltersProvider } from '@/hooks/useFilters';
import { CompaniesProvider } from '@/hooks/useCompanies';
import { PropertiesProvider } from '@/hooks/useProperties';
import { PropertyProvider } from '@/hooks/useProperty';
import { useAuth } from '@/hooks/use-auth';
import { useDialogs } from '@/hooks/useDialogs';

import { Button } from '@/components/ui/button';

import type { ChannelSummary } from '@/types/mastermind';

type ChannelsResponse = { channels: ChannelSummary[] };

function MastermindContent() {
    const { isLoading, isAdminStatusLoading, isAuthenticated, canAccessApp } = useAuth();
    const { openDialog } = useDialogs();
    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const [mobileTab, setMobileTab] = useState<'channels' | 'chat'>('channels');

    const { data, isLoading: channelsLoading } = useQuery<ChannelsResponse>({
        queryKey: ['/api/channels'],
        enabled: canAccessApp,
    });
    const channels = data?.channels ?? [];

    // Auto-select the first channel once the list loads
    useEffect(() => {
        if (!activeChannelId && channels.length > 0) {
            setActiveChannelId(channels[0].id);
        }
    }, [channels, activeChannelId]);

    const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

    function handleSelectChannel(id: string) {
        setActiveChannelId(id);
        setMobileTab('chat');
    }

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
                            channels={channels}
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
                            <MessageList channelId={activeChannel.id} />
                            <MessageComposer
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
