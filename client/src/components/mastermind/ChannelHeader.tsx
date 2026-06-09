import { Hash } from 'lucide-react';

import type { ChannelSummary } from '@/types/mastermind';

type ChannelHeaderProps = {
    channel: ChannelSummary;
};

export function ChannelHeader({ channel }: ChannelHeaderProps) {
    return (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0 bg-background min-h-[52px]">
            <Hash className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-semibold text-foreground text-base">{channel.name}</span>
            {channel.description && (
                <>
                    <span className="w-px h-4 bg-border mx-1 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground truncate">{channel.description}</span>
                </>
            )}
        </div>
    );
}
