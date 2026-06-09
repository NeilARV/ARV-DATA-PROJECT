import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import {
    useMastermindSocket,
    messagesQueryKey,
    mergeMessages,
} from '@/hooks/use-mastermind-socket';

import { apiRequest } from '@/lib/queryClient';
import type { MastermindMessageWire } from '@shared/mastermind/events';

// TEMPORARY Part-4 test harness — intentionally bare. Part 5 replaces this with the real shell.
// It exists to verify the WebSocket layer end-to-end before any polished UI exists.

type ChannelSummary = { id: string; name: string };

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export default function Mastermind() {
    const { canAccessApp, isLoading } = useAuth();
    const { status, subscribeToChannel, unsubscribeFromChannel } = useMastermindSocket();

    const [channelId, setChannelId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');

    const { data: channelsData } = useQuery<{ channels: ChannelSummary[] }>({
        queryKey: ['/api/channels'],
        enabled: canAccessApp,
    });
    const channels = channelsData?.channels ?? [];

    const { data: messages } = useQuery<MastermindMessageWire[]>({
        queryKey: channelId ? messagesQueryKey(channelId) : ['mastermind-no-channel'],
        enabled: !!channelId,
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
        if (!channelId) return;
        subscribeToChannel(channelId);
        return () => unsubscribeFromChannel(channelId);
    }, [channelId, subscribeToChannel, unsubscribeFromChannel]);

    async function handleSend() {
        const text = draft.trim();
        if (!channelId || !text) return;
        setDraft('');
        await apiRequest('POST', `/api/channels/${channelId}/messages`, {
            content: `<p>${escapeHtml(text)}</p>`,
        });
    }

    if (isLoading) return <div className="p-8">Loading…</div>;
    if (!canAccessApp) {
        return <div className="p-8">You need a subscription or team role to access Mastermind.</div>;
    }

    return (
        <div className="mx-auto max-w-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold">Mastermind (WS test harness)</h1>
                <span className="text-sm text-muted-foreground">socket: {status}</span>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
                {channels.map((c) => (
                    <button
                        key={c.id}
                        onClick={() => setChannelId(c.id)}
                        className={`rounded border px-3 py-1 text-sm ${
                            channelId === c.id ? 'bg-primary text-primary-foreground' : ''
                        }`}
                    >
                        #{c.name}
                    </button>
                ))}
            </div>

            {channelId && (
                <>
                    <div className="mb-3 h-96 space-y-2 overflow-y-auto rounded border p-3">
                        {(messages ?? []).map((m) => (
                            <div key={m.id} className="text-sm">
                                <span className="font-medium">
                                    {m.senderFirstName} {m.senderLastName}
                                </span>{' '}
                                {m.isDeleted ? (
                                    <em className="text-muted-foreground">message deleted</em>
                                ) : (
                                    <span dangerouslySetInnerHTML={{ __html: m.content }} />
                                )}
                                {m.isEdited && !m.isDeleted && (
                                    <span className="text-muted-foreground"> (edited)</span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSend();
                            }}
                            placeholder="Type a message and press Enter"
                            className="flex-1 rounded border px-3 py-2 text-sm"
                        />
                        <button
                            onClick={() => void handleSend()}
                            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
                        >
                            Send
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
