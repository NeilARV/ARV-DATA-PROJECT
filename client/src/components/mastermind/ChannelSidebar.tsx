import { Brain, Hash } from 'lucide-react';

import type { ChannelSummary } from '@/types/mastermind';

type ChannelSidebarProps = {
    channels: ChannelSummary[];
    activeChannelId: string | null;
    onSelectChannel: (id: string) => void;
};

export function ChannelSidebar({ channels, activeChannelId, onSelectChannel }: ChannelSidebarProps) {
    return (
        <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border w-full md:w-60 lg:w-64 flex-shrink-0">
            {/* Community header */}
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border flex-shrink-0">
                <Brain className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground truncate">ARV Mastermind</span>
            </div>

            {/* Scrollable channel list */}
            <div className="flex-1 overflow-y-auto py-2 min-h-0">
                <div className="px-3 mb-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Channels
                    </span>
                </div>

                <ul>
                    {channels.map((c) => (
                        <li key={c.id}>
                            <button
                                onClick={() => onSelectChannel(c.id)}
                                className={`mm-channel-item ${activeChannelId === c.id ? 'mm-channel-item-active' : ''}`}
                            >
                                <Hash className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                                <span className="truncate">{c.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>

                {/* Direct Messages — Phase 2 stub */}
                <div className="px-3 mt-5 mb-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Direct Messages
                    </span>
                </div>
                <p className="px-3 text-xs text-muted-foreground italic">Coming soon</p>
            </div>
        </div>
    );
}
