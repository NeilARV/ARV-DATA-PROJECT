import type { Deal, DealType } from '@shared/types/deals';
import type { DealCaps } from '@/types/deals';

// ── Deal-type metadata ──────────────────────────────────────────────────────
// Type color is owned by the Badge component (its purple/orange/indigo/red variants map to the
// sanctioned deal-type palette). We only carry the label + which badge variant to render, so the
// palette hexes live in exactly one place and this file stays token-clean.

type DealBadgeVariant = 'purple' | 'orange' | 'indigo' | 'red';

export const DEAL_TYPE_META: Record<DealType, { label: string; badge: DealBadgeVariant }> = {
    wholesale: { label: 'Wholesale', badge: 'purple' },
    agent: { label: 'Agent', badge: 'orange' },
    reo: { label: 'REO', badge: 'indigo' },
    sold: { label: 'Sold', badge: 'red' },
};

/** Display metadata (label + badge variant) for a deal's type; falls back to Agent. */
export function dealTypeMeta(type: DealType) {
    return DEAL_TYPE_META[type] ?? DEAL_TYPE_META.agent;
}

/** A sold deal is a comp: reference-only, never actionable (no offers / info requests). */
export function isSold(deal: Pick<Deal, 'dealType'>): boolean {
    return deal.dealType === 'sold';
}

// ── Capabilities ────────────────────────────────────────────────────────────

/** The viewer's identity plus ARV team-role flags, as `dealCaps` consumes them. */
// isArvOwner is the ARV "owner" role (useAuth's isOwner) — deliberately not named isOwner,
// because DealCaps.isOwner means "viewer posted this deal" and conflating the two is how the
// preview's matrix went wrong.
export type DealCapsViewer = {
    userId: string;
    isAdmin: boolean;
    isArvOwner: boolean;
    isRelationshipManager: boolean;
};

/**
 * What the viewer may do with a deal.
 * Must match the ownership/role checks in `server/services/deals/deals.services.ts` — except
 * `isOwner`, which deliberately keeps offers/top-buyers poster-only in the UI even though the
 * server also permits privileged staff.
 */
export function dealCaps(deal: Pick<Deal, 'userId' | 'dealType'>, viewer: DealCapsViewer): DealCaps {
    const isPoster = deal.userId === viewer.userId;
    const isAdminOrArvOwner = viewer.isAdmin || viewer.isArvOwner;
    const isPrivileged = isAdminOrArvOwner || viewer.isRelationshipManager;
    const isActionable = !isSold(deal) && !isPoster;
    return {
        canEdit: isPoster || isAdminOrArvOwner,
        canDelete: isPoster || isPrivileged,
        canRequestContact: isActionable,
        canSubmitOffer: isActionable,
        isOwner: isPoster,
        canViewPoster: isPrivileged,
    };
}

// ── Number coercion ─────────────────────────────────────────────────────────
// price / potentialARV arrive as number | string | null from the API; normalize to a positive
// number or null so callers never re-implement the guard.

/** Coerces a nullable number|string money field to a positive number, or null when absent/≤0. */
export function toMoney(value: number | string | null | undefined): number | null {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Money formatting ────────────────────────────────────────────────────────

/** Compact USD for dense rows: `$420K`, `$1.15M`, `$985K`. */
export function formatCompactUsd(n: number): string {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
    return `${sign}$${Math.round(abs)}`;
}

/** Full USD for the detail panel: `$420,000`. */
export function formatUsd(n: number): string {
    return `$${Math.round(n).toLocaleString('en-US')}`;
}

// ── Date & time formatting ──────────────────────────────────────────────────

/**
 * Feed-friendly posted date: `Today`, `Yesterday`, `3d ago` within a week, then `Jul 3`, and
 * `Jul 3, 2024` once it crosses a calendar year — so a scanning eye reads recency at a glance.
 */
export function formatPostedDate(dateStr: string): string {
    const posted = new Date(dateStr);
    if (Number.isNaN(posted.getTime())) return '';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfPosted = new Date(posted.getFullYear(), posted.getMonth(), posted.getDate());
    const dayDiff = Math.round(
        (startOfToday.getTime() - startOfPosted.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (dayDiff <= 0) return 'Today';
    if (dayDiff === 1) return 'Yesterday';
    if (dayDiff < 7) return `${dayDiff}d ago`;

    const sameYear = posted.getFullYear() === now.getFullYear();
    return posted.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a stored showing timestamp (`YYYY-MM-DDThh:mm`) compactly as `Jul 16, 2:00 PM` so it fits
 * a fact tile on one line. Parsed by hand (not `new Date`) since the stored time carries no zone.
 */
export function formatShowingTime(isoStr: string): string {
    const normalized = isoStr.replace(' ', 'T');
    const [datePart, timePart] = normalized.split('T');
    const [, m, d] = datePart.split('-').map(Number);
    const date = `${MONTHS[m - 1] ?? ''} ${d}`;
    if (!timePart) return date.trim();
    const [hhStr, mmStr] = timePart.split(':');
    let hh = parseInt(hhStr, 10);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    if (hh > 12) hh -= 12;
    if (hh === 0) hh = 12;
    return `${date}, ${hh}:${mmStr ?? '00'} ${ampm}`;
}

// ── Specs ───────────────────────────────────────────────────────────────────

/** Beds / baths / sqft as normalized numbers (null when absent), for the specs row. */
export function dealSpecs(deal: Pick<Deal, 'beds' | 'baths' | 'sqft'>) {
    return {
        beds: deal.beds ? Number(deal.beds) : null,
        baths: deal.baths ? Number(deal.baths) : null,
        sqft: deal.sqft ? Number(deal.sqft) : null,
    };
}
