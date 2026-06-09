import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { MessageItem } from './MessageItem';
import { useMastermindSocket } from '@/hooks/use-mastermind-socket';
import { messagesQueryKey, mergeMessages } from '@/lib/mastermind-messages';

import type { MastermindMessageWire } from '@shared/mastermind/events';

const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

function shouldShowHeader(messages: MastermindMessageWire[], index: number): boolean {
    if (index === 0) return true;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (prev.senderId !== curr.senderId) return true;
    const diffMs = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
    return diffMs > GROUP_THRESHOLD_MS;
}

type MessageListProps = {
    channelId: string;
};

export function MessageList({ channelId }: MessageListProps) {
    const { subscribeToChannel, unsubscribeFromChannel } = useMastermindSocket();
    const bottomRef = useRef<HTMLDivElement>(null);
    const prevLengthRef = useRef(0);

    const { data: messages, isLoading } = useQuery<MastermindMessageWire[]>({
        queryKey: messagesQueryKey(channelId),
        staleTime: Infinity,
        queryFn: async () => {
            const res = await fetch(`/api/channels/${channelId}/messages`, {
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Failed to load messages');
            const data = (await res.json()) as { messages: MastermindMessageWire[] };
            return mergeMessages([], data.messages);
        },
    });

    useEffect(() => {
        subscribeToChannel(channelId);
        return () => unsubscribeFromChannel(channelId);
    }, [channelId, subscribeToChannel, unsubscribeFromChannel]);

    // Scroll to bottom when new messages arrive (not on every render)
    useEffect(() => {
        const len = messages?.length ?? 0;
        if (len !== prevLengthRef.current) {
            prevLengthRef.current = len;
            bottomRef.current?.scrollIntoView({ behavior: len === 1 ? 'instant' : 'smooth' });
        }
    }, [messages?.length]);

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const messageList = messages ?? [];

    if (messageList.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
                <p className="text-sm font-medium text-foreground">No messages yet</p>
                <p className="text-sm text-muted-foreground">Be the first to say something!</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto py-2 min-h-0">
            {messageList.map((message, i) => (
                <MessageItem
                    key={message.id}
                    message={message}
                    showHeader={shouldShowHeader(messageList, i)}
                />
            ))}
            <div ref={bottomRef} className="h-2" />
        </div>
    );
}
