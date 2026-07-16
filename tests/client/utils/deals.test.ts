import { describe, it, expect } from 'vitest';
import { dealCaps, type DealCapsViewer } from '../../../client/src/utils/deals';

import type { DealCaps } from '../../../client/src/types/deals';
import type { DealType } from '../../../shared/types/deals';

const VIEWER_ID = 'viewer-user-id';
const POSTER_ID = 'poster-user-id';

function viewer(flags: Partial<Omit<DealCapsViewer, 'userId'>> = {}): DealCapsViewer {
    return {
        userId: VIEWER_ID,
        isAdmin: false,
        isArvOwner: false,
        isRelationshipManager: false,
        ...flags,
    };
}

const subscriber = viewer();
const relationshipManager = viewer({ isRelationshipManager: true });
const admin = viewer({ isAdmin: true });
const arvOwner = viewer({ isArvOwner: true });

function deal(posterUserId: string, dealType: DealType = 'wholesale') {
    return { userId: posterUserId, dealType };
}

// Exhaustive matrix: every viewer archetype × deal ownership × live/sold, asserting the full
// expected capability object per cell. Expected values are transcribed from the server's deal
// authorization (see dealCaps's JSDoc pointer), not derived from the implementation.
const MATRIX: {
    who: string;
    viewer: DealCapsViewer;
    scenario: string;
    posterUserId: string;
    dealType: DealType;
    expected: DealCaps;
}[] = [
    // ── Plain subscriber (no team role) ──────────────────────────────────────
    {
        who: 'subscriber',
        viewer: subscriber,
        scenario: 'own live deal',
        posterUserId: VIEWER_ID,
        dealType: 'wholesale',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: true,
            canViewPoster: false,
        },
    },
    {
        who: 'subscriber',
        viewer: subscriber,
        scenario: 'own sold deal',
        posterUserId: VIEWER_ID,
        dealType: 'sold',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: true,
            canViewPoster: false,
        },
    },
    {
        who: 'subscriber',
        viewer: subscriber,
        scenario: "another user's live deal",
        posterUserId: POSTER_ID,
        dealType: 'agent',
        expected: {
            canEdit: false,
            canDelete: false,
            canRequestContact: true,
            canSubmitOffer: true,
            isOwner: false,
            canViewPoster: false,
        },
    },
    {
        who: 'subscriber',
        viewer: subscriber,
        scenario: "another user's sold deal",
        posterUserId: POSTER_ID,
        dealType: 'sold',
        expected: {
            canEdit: false,
            canDelete: false,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: false,
            canViewPoster: false,
        },
    },

    // ── Relationship manager: may delete others' deals but never edit them ───
    {
        who: 'relationship manager',
        viewer: relationshipManager,
        scenario: 'own live deal',
        posterUserId: VIEWER_ID,
        dealType: 'reo',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: true,
            canViewPoster: true,
        },
    },
    {
        who: 'relationship manager',
        viewer: relationshipManager,
        scenario: 'own sold deal',
        posterUserId: VIEWER_ID,
        dealType: 'sold',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: true,
            canViewPoster: true,
        },
    },
    {
        who: 'relationship manager',
        viewer: relationshipManager,
        scenario: "another user's live deal",
        posterUserId: POSTER_ID,
        dealType: 'wholesale',
        expected: {
            canEdit: false,
            canDelete: true,
            canRequestContact: true,
            canSubmitOffer: true,
            isOwner: false,
            canViewPoster: true,
        },
    },
    {
        who: 'relationship manager',
        viewer: relationshipManager,
        scenario: "another user's sold deal",
        posterUserId: POSTER_ID,
        dealType: 'sold',
        expected: {
            canEdit: false,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: false,
            canViewPoster: true,
        },
    },

    // ── Admin: full edit/delete on any deal ──────────────────────────────────
    {
        who: 'admin',
        viewer: admin,
        scenario: 'own live deal',
        posterUserId: VIEWER_ID,
        dealType: 'agent',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: true,
            canViewPoster: true,
        },
    },
    {
        who: 'admin',
        viewer: admin,
        scenario: 'own sold deal',
        posterUserId: VIEWER_ID,
        dealType: 'sold',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: true,
            canViewPoster: true,
        },
    },
    {
        who: 'admin',
        viewer: admin,
        scenario: "another user's live deal",
        posterUserId: POSTER_ID,
        dealType: 'reo',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: true,
            canSubmitOffer: true,
            isOwner: false,
            canViewPoster: true,
        },
    },
    {
        who: 'admin',
        viewer: admin,
        scenario: "another user's sold deal",
        posterUserId: POSTER_ID,
        dealType: 'sold',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: false,
            canViewPoster: true,
        },
    },

    // ── ARV owner role: same reach as admin (distinct from deal ownership) ───
    {
        who: 'ARV owner',
        viewer: arvOwner,
        scenario: 'own live deal',
        posterUserId: VIEWER_ID,
        dealType: 'wholesale',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: true,
            canViewPoster: true,
        },
    },
    {
        who: 'ARV owner',
        viewer: arvOwner,
        scenario: 'own sold deal',
        posterUserId: VIEWER_ID,
        dealType: 'sold',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: true,
            canViewPoster: true,
        },
    },
    {
        who: 'ARV owner',
        viewer: arvOwner,
        scenario: "another user's live deal",
        posterUserId: POSTER_ID,
        dealType: 'agent',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: true,
            canSubmitOffer: true,
            isOwner: false,
            canViewPoster: true,
        },
    },
    {
        who: 'ARV owner',
        viewer: arvOwner,
        scenario: "another user's sold deal",
        posterUserId: POSTER_ID,
        dealType: 'sold',
        expected: {
            canEdit: true,
            canDelete: true,
            canRequestContact: false,
            canSubmitOffer: false,
            isOwner: false,
            canViewPoster: true,
        },
    },
];

describe('dealCaps', () => {
    it.each(MATRIX)(
        '$who — $scenario — caps match the server matrix',
        ({ viewer: v, posterUserId, dealType, expected }) => {
            expect(dealCaps(deal(posterUserId, dealType), v)).toEqual(expected);
        },
    );

    it('relationship manager — can delete but not edit another user’s deal', () => {
        const caps = dealCaps(deal(POSTER_ID), relationshipManager);
        expect(caps.canDelete).toBe(true);
        expect(caps.canEdit).toBe(false);
    });

    it('ARV owner role does not grant deal ownership — no offers/top-buyers on others’ deals', () => {
        expect(dealCaps(deal(POSTER_ID), arvOwner).isOwner).toBe(false);
    });
});
