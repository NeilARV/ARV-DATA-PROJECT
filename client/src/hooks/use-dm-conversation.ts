import { useQuery } from '@tanstack/react-query';

import { queryClient } from '@/lib/queryClient';
import { fetchDmContext } from '@/api/dms.api';
import { messagesQueryKey, mergeMessages } from '@/lib/mastermind-messages';

import type { DmUserWire, MastermindMessageWire } from '@shared/mastermind/events';

type DmConversation = {
    channelId: string | null;
    otherUser: DmUserWire;
};

/**
 * Resolves a DM by counterparty id. Seeds the shared message cache (`messagesQueryKey`) from the
 * returned history so `MessageList` — which reads that same key and receives live socket updates —
 * renders without a second fetch.
 * @returns the channel (null = never-messaged draft) and the counterparty's profile.
 */
export function useDmConversation(otherUserId: string) {
    return useQuery<DmConversation>({
        queryKey: ['/api/dms', otherUserId, 'resolve'],
        enabled: !!otherUserId,
        staleTime: Infinity,
        queryFn: async () => {
            const data = await fetchDmContext(otherUserId);
            if (data.channelId) {
                queryClient.setQueryData<MastermindMessageWire[]>(
                    messagesQueryKey(data.channelId),
                    (old) => mergeMessages(old ?? [], data.messages),
                );
            }
            return { channelId: data.channelId, otherUser: data.otherUser };
        },
    });
}
