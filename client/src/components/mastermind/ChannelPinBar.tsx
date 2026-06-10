import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pin, X } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { apiRequest } from '@/lib/queryClient';
import { pinQueryKey } from '@/lib/mastermind-messages';
import { removeChannelPin } from '@/api/mastermind.api';

import type { PinnedMessageWire } from '@shared/mastermind/events';

type PinResponse = { pinned: PinnedMessageWire | null };

type ChannelPinBarProps = {
    channelId: string;
    onJump: (messageId: string) => void;
};

function stripHtml(html: string): string {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

export function ChannelPinBar({ channelId, onJump }: ChannelPinBarProps) {
    const { isAdmin, isOwner } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const canUnpin = isAdmin || isOwner;

    const { data } = useQuery<PinResponse>({
        queryKey: pinQueryKey(channelId),
        queryFn: () =>
            apiRequest('GET', `/api/channels/${channelId}/pin`).then((r) => r.json()),
        staleTime: 60 * 1000,
    });

    const unpinMutation = useMutation({
        mutationFn: () => removeChannelPin(channelId),
        onSuccess: () => queryClient.setQueryData<PinResponse>(pinQueryKey(channelId), { pinned: null }),
        onError: () =>
            toast({ title: 'Unpin failed', description: 'Please try again.', variant: 'destructive' }),
    });

    const pinned = data?.pinned;
    if (!pinned) return null;

    const pinnerName =
        pinned.pinnedByFirstName || pinned.pinnedByLastName
            ? `${pinned.pinnedByFirstName ?? ''} ${pinned.pinnedByLastName ?? ''}`.trim()
            : 'Someone';
    const excerpt = stripHtml(pinned.message.content);

    return (
        <div className="flex items-start gap-2 px-4 py-2 border-b border-border bg-muted/40 flex-shrink-0">
            <button
                type="button"
                onClick={() => onJump(pinned.message.id)}
                className="flex-1 min-w-0 text-left group"
            >
                {/* Pin icon stays inline with the pinner name on every screen size */}
                <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                    <Pin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs truncate">Pinned by {pinnerName}</span>
                </div>
                <p className="text-sm text-foreground group-hover:underline line-clamp-3 mt-0.5">
                    {excerpt || 'Attachment'}
                </p>
            </button>
            {canUnpin && (
                <button
                    type="button"
                    onClick={() => unpinMutation.mutate()}
                    disabled={unpinMutation.isPending}
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    title="Unpin message"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
