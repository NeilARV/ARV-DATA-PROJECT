import { apiRequest } from '@/lib/queryClient';

import type {
    DirectMessageSummaryWire,
    DmUserWire,
    MastermindMessageWire,
} from '@shared/mastermind/events';

export type DmListResponse = { conversations: DirectMessageSummaryWire[] };

export type DmCandidate = DmUserWire;

// Resolve-by-counterparty: the channel (null for a never-messaged draft), the counterparty's
// profile, and the initial history page (empty for a draft).
export type DmContextResponse = {
    messages: MastermindMessageWire[];
    nextCursor: string | null;
    channelId: string | null;
    otherUser: DmUserWire;
};

/** Lists Mastermind-eligible users the caller can start a DM with (for the "New message" picker). */
export async function fetchDmCandidates(): Promise<DmCandidate[]> {
    const res = await apiRequest('GET', '/api/dms/candidates');
    const json = (await res.json()) as { users: DmCandidate[] };
    return json.users;
}

/** Resolves the caller↔`otherUserId` conversation: channel (or null draft), counterparty, history. */
export async function fetchDmContext(otherUserId: string): Promise<DmContextResponse> {
    const res = await apiRequest('GET', `/api/dms/${otherUserId}/messages`);
    return (await res.json()) as DmContextResponse;
}
