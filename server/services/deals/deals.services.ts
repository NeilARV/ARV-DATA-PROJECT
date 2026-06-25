import { db } from 'server/storage';
import type {
    TopBuyer,
    DealType,
    DealLocations,
    CreateDealInput,
    UpdateDealInput,
} from '@shared/types/deals';
import { deals, dealLinks, dealBids } from '@database/schemas/deals.schema';
import {
    users,
    userRoles,
    roles,
    userNotificationPreferences,
} from '@database/schemas/users.schema';
import { msas, userMsaSubscriptions } from '@database/schemas/msas.schema';
import { resolveCountyFromZip } from 'server/utils/resolveCounty';
import { resolveMsaId } from 'server/utils/resolveMsa';
import { normalizePropertyType } from 'server/utils/normalization';
import { ADMIN_ROLES, PRIVILEGED_ROLES } from 'server/constants/roles.constants';
import {
    sendEmailWithTemplate,
    getDefaultFromEmail,
    getConfirmedSenders,
    getRmEmailsByUserIds,
    resolveFromAddress,
    sendTemplateToUsers,
    getWhitelistRecipientsForMsa,
} from 'server/services/postmark/email.services';
import { eq, ne, desc, and, inArray, gte, isNotNull, ilike, sql, SQL } from 'drizzle-orm';
import { companies, companyContacts } from '@database/schemas/companies.schema';
import { properties, propertyTransactions, addresses } from '@database/schemas/properties.schema';
import { getStreetviewImage } from 'server/services/properties/streetview.services';
import { lookupPropertyByAddress } from 'server/services/properties/property.services';
import { normalizeToTitleCase } from 'server/utils/normalization';

export class DealServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'DealServiceError';
    }
}

// ── Deal type display helpers ──────────────────────────────────────────────────
function getDealTypeMeta(type: 'wholesale' | 'agent' | 'sold' | 'reo'): {
    label: string;
    color: string;
} {
    switch (type) {
        case 'wholesale':
            return { label: 'Wholesale', color: '#9333EA' };
        case 'sold':
            return { label: 'Sold', color: '#FF0000' };
        case 'reo':
            return { label: 'REO', color: '#6366F1' };
        default:
            return { label: 'Agent', color: '#F97316' };
    }
}

// ── Shared: build a relative streetview URL for a deal ────────────────────────
function buildDealStreetViewUrl(
    address: string | null,
    city: string | null,
    state: string | null,
    sfrPropertyId: number | null,
): string | null {
    if (!address || !city || !state) return null;
    const params = new URLSearchParams({ address, city, state, size: '200x200' });
    if (sfrPropertyId != null) params.set('sfrPropertyId', String(sfrPropertyId));
    return `/api/properties/streetview?${params}`;
}

function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function extractDomain(url: string): string {
    try {
        const hostname = new URL(url).hostname; // e.g. "www.redfin.com" or "maps.google.com"
        const parts = hostname.replace(/^www\./, '').split('.');
        // Take the segment just before the TLD: ["redfin","com"] → "redfin", ["google","com"] → "google"
        return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    } catch {
        return url;
    }
}

function formatShowingTime(isoStr: string): string {
    const normalized = isoStr.replace(' ', 'T');
    const [datePart, timePart] = normalized.split('T');
    const [y, m, d] = datePart.split('-');
    if (!timePart) return `${m}/${d}/${y}`;
    const [hhStr, mmStr] = timePart.split(':');
    let hh = parseInt(hhStr, 10);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    if (hh > 12) hh -= 12;
    if (hh === 0) hh = 12;
    return `${m}/${d}/${y} at ${hh}:${mmStr} ${ampm}`;
}

function filterValidLinks(links: string[] | undefined): { url: string; domain: string }[] {
    return (links ?? [])
        .filter((u) => typeof u === 'string' && isValidUrl(u.trim()))
        .map((u) => ({ url: u.trim(), domain: extractDomain(u.trim()) }))
        .slice(0, 3);
}

async function getTopBuyersByZipCode(zipCode: string): Promise<TopBuyer[]> {
    const label = '[dealsService.getTopBuyersByZipCode]';
    if (!zipCode) return [];

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoff = threeMonthsAgo.toISOString().split('T')[0];

    const rows = await db
        .selectDistinctOn([propertyTransactions.buyerId], {
            buyerId: propertyTransactions.buyerId,
            buyerName: propertyTransactions.buyerName,
        })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .innerJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(
            and(
                eq(addresses.zipCode, zipCode),
                eq(propertyTransactions.transactionType, 'Arms Length'),
                gte(propertyTransactions.recordingDate, cutoff),
                isNotNull(propertyTransactions.buyerId),
            ),
        )
        .limit(3);

    console.log(`${label} ${rows.length} top buyers for zip=${zipCode}`);

    const buyerIds = rows.map((r) => r.buyerId).filter(Boolean) as string[];
    const contactRows =
        buyerIds.length > 0
            ? await db
                  .select()
                  .from(companyContacts)
                  .where(inArray(companyContacts.companyId, buyerIds))
                  .orderBy(companyContacts.companyId, companyContacts.sortOrder, companyContacts.id)
            : [];
    const primaryContactMap = new Map<string, typeof companyContacts.$inferSelect>();
    for (const c of contactRows) {
        if (!primaryContactMap.has(c.companyId)) primaryContactMap.set(c.companyId, c);
    }

    return rows.map((row) => {
        const primary = row.buyerId ? (primaryContactMap.get(row.buyerId) ?? null) : null;
        const contactName = primary
            ? [primary.firstName, primary.lastName].filter(Boolean).join(' ') || null
            : null;
        return {
            companyId: row.buyerId ?? null,
            companyName: normalizeToTitleCase(row.buyerName ?? '') ?? row.buyerName ?? 'Unknown',
            contactName,
        };
    });
}

// ── GET deals ──────────────────────────────────────────────────────────────────
type GetDealsFilters = {
    id?: number;
    userId?: string;
    msaName?: string;
    county?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    // Column selector: 'new' = every non-sold type, 'sold' = sold only. Omit for all types.
    status?: 'new' | 'sold';
    // 1-based page + page size (offset pagination). Defaults: page 1, limit 10.
    page?: number;
    limit?: number;
    // When set, offer counts are attached only to deals this user owns (offers are poster-private).
    callerId?: string;
};

const DEFAULT_DEALS_LIMIT = 10;

/**
 * Lists one page of deals for a column (new or sold), newest first.
 * Enriches each deal with comparable-sale links, a relative street-view URL, and — for the
 * caller's own deals — an offer count. Top buyers and the street-view image itself are fetched
 * lazily by their own endpoints, not here.
 * @param filters location/status filters plus page/limit; `callerId` scopes offer counts.
 * @returns one page: `{ deals, total, hasMore, page, limit }` for the matching column.
 */
export async function getDeals(filters: GetDealsFilters) {
    const {
        id: filterId,
        userId: filterUserId,
        msaName: filterMsaName,
        county: filterCounty,
        city: filterCity,
        state: filterState,
        zipCode: filterZipCode,
        status: filterStatus,
        callerId: filterCallerId,
    } = filters;

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : DEFAULT_DEALS_LIMIT;
    const offset = (page - 1) * limit;

    let filterMsaId: number | undefined;
    if (filterMsaName) {
        const [msaRow] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.name, filterMsaName))
            .limit(1);

        if (!msaRow) {
            console.log(
                `[dealsService.getDeals] MSA not found: "${filterMsaName}" — returning empty`,
            );
            return { deals: [], total: 0, hasMore: false, page, limit };
        }
        filterMsaId = msaRow.id;
    }

    const conditions: SQL[] = [];
    if (filterId !== undefined) conditions.push(eq(deals.id, filterId));
    if (filterUserId) conditions.push(eq(deals.userId, filterUserId));
    if (filterMsaId !== undefined) conditions.push(eq(deals.msaId, filterMsaId));
    if (filterCounty) conditions.push(ilike(deals.county, filterCounty));
    if (filterCity) conditions.push(ilike(deals.city, filterCity));
    if (filterState) conditions.push(eq(deals.state, filterState.toUpperCase()));
    if (filterZipCode) conditions.push(eq(deals.zipCode, filterZipCode));
    if (filterStatus === 'sold') conditions.push(eq(deals.type, 'sold'));
    else if (filterStatus === 'new') conditions.push(ne(deals.type, 'sold'));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total matching rows for the column header (cheap COUNT, all filters on `deals`). A single-deal
    // lookup by id renders no column, so skip the COUNT on that path.
    let total = 0;
    if (filterId === undefined) {
        const [countRow] = await db
            .select({ total: sql<number>`count(*)::int` })
            .from(deals)
            .where(whereClause);
        total = countRow.total;
    }

    // Fetch one extra row to derive hasMore without a second query.
    const rows = await db
        .select({
            id: deals.id,
            createdAt: deals.createdAt,
            sfrPropertyId: deals.sfrPropertyId,
            address: deals.address,
            city: deals.city,
            state: deals.state,
            zipCode: deals.zipCode,
            price: deals.price,
            potentialARV: deals.potentialARV,
            showingTime: deals.showingTime,
            estimatedBudget: deals.estimatedBudget,
            beds: deals.beds,
            baths: deals.baths,
            sqft: deals.sqft,
            propertyType: deals.propertyType,
            notes: deals.notes,
            adminNotes: deals.adminNotes,
            photosUrl: deals.photosUrl,
            isArvExclusive: deals.isArvExclusive,
            onBehalfOfEmail: deals.onBehalfOfEmail,
            msaId: deals.msaId,
            msaName: msas.name,
            county: deals.county,
            dealType: deals.type,
            userId: deals.userId,
            userEmail: users.email,
            userFirstName: users.firstName,
            userLastName: users.lastName,
            userPhone: users.phone,
        })
        .from(deals)
        .leftJoin(msas, eq(deals.msaId, msas.id))
        .leftJoin(users, eq(deals.userId, users.id))
        .where(whereClause)
        .orderBy(desc(deals.id))
        .limit(limit + 1)
        .offset(offset);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    console.log(
        `[dealsService.getDeals] ${pageRows.length}/${total} deals (page ${page})` +
            `${filterStatus ? ` (status=${filterStatus})` : ''}` +
            `${filterUserId ? ` (userId=${filterUserId})` : ''}` +
            `${filterMsaName ? ` (msaName=${filterMsaName})` : ''}` +
            `${filterCity ? ` (city=${filterCity})` : ''}` +
            `${filterZipCode ? ` (zipCode=${filterZipCode})` : ''}`,
    );

    // Batch-fetch links for the page's deals.
    const dealIds = pageRows.map((d) => d.id);
    const allLinks =
        dealIds.length > 0
            ? await db
                  .select({
                      dealId: dealLinks.dealId,
                      url: dealLinks.url,
                      domain: dealLinks.domain,
                  })
                  .from(dealLinks)
                  .where(inArray(dealLinks.dealId, dealIds))
                  .orderBy(dealLinks.dealId, dealLinks.sortOrder)
            : [];
    const linksByDealId = new Map<number, { url: string; domain: string }[]>();
    for (const row of allLinks) {
        const arr = linksByDealId.get(row.dealId) ?? [];
        arr.push({ url: row.url, domain: row.domain });
        linksByDealId.set(row.dealId, arr);
    }

    // Offer counts are poster-private — only fetch them for deals the caller owns.
    const ownDealIds = filterCallerId
        ? pageRows.filter((d) => d.userId === filterCallerId).map((d) => d.id)
        : [];
    const bidCountByDealId = await getBidCountsForDealIds(ownDealIds);

    // Street view resolves to a relative URL only. The card's <img> request drives the actual
    // fetch + re-cache (cache → Google → satellite → negative) in the streetview endpoint, so a
    // cleaned-up/expired entry is refreshed on next view. We no longer probe the image here —
    // that read the full blob per deal on every list fetch just to null-check it.
    const dealsForPage = pageRows.map((deal) => {
        const links = linksByDealId.get(deal.id) ?? [];
        const bidCount =
            filterCallerId && deal.userId === filterCallerId
                ? (bidCountByDealId.get(deal.id) ?? 0)
                : undefined;
        const streetViewUrl = buildDealStreetViewUrl(
            deal.address,
            deal.city,
            deal.state,
            deal.sfrPropertyId,
        );
        return { ...deal, streetViewUrl, links, bidCount };
    });

    return { deals: dealsForPage, total, hasMore, page, limit };
}

// ── GET single deal by id ──────────────────────────────────────────────────────
export async function getDealById(id: number) {
    const { deals: rows } = await getDeals({ id, limit: 1 });
    return rows[0] ?? null;
}

/**
 * Top buyers for a deal's zip — owner-only (or a privileged team member). Fetched on demand so
 * the deal list doesn't pay for buyer lookups every viewer never sees.
 * @param dealId deal whose zip is used for the buyer search.
 * @param callerId must be the deal owner or hold a privileged role.
 * @returns up to 3 top buyers, or `[]` when the deal has no zip or no recent arms-length buyers.
 */
export async function getTopBuyersForDeal(dealId: number, callerId: string): Promise<TopBuyer[]> {
    const [deal] = await db
        .select({ id: deals.id, userId: deals.userId, zipCode: deals.zipCode })
        .from(deals)
        .where(eq(deals.id, dealId))
        .limit(1);

    if (!deal) throw new DealServiceError(404, 'Deal not found');

    if (deal.userId !== callerId) {
        const callerIsPrivileged = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(and(eq(userRoles.userId, callerId), inArray(roles.name, [...PRIVILEGED_ROLES])))
            .limit(1);

        if (callerIsPrivileged.length === 0) {
            throw new DealServiceError(403, 'You can only view top buyers on your own deals');
        }
    }

    if (!deal.zipCode) return [];
    return getTopBuyersByZipCode(deal.zipCode);
}

/**
 * Distinct cities (with state) and zips across all deals — powers the location-search
 * autocomplete independently of the paginated list.
 * @returns sorted unique `{ city, state }` pairs and zip codes.
 */
export async function getDealLocations(): Promise<DealLocations> {
    const cityRows = await db
        .selectDistinct({ city: deals.city, state: deals.state })
        .from(deals)
        .orderBy(deals.city);
    const zipRows = await db
        .selectDistinct({ zipCode: deals.zipCode })
        .from(deals)
        .orderBy(deals.zipCode);

    const cities = cityRows.flatMap((r) =>
        r.city ? [{ city: r.city, state: r.state ?? '' }] : [],
    );
    const zips = zipRows.map((r) => r.zipCode).filter((z): z is string => Boolean(z));
    return { cities, zips };
}

// ── POST deal ──────────────────────────────────────────────────────────────────
export async function createDeal(input: CreateDealInput) {
    const label = '[dealsService.createDeal]';
    const {
        address,
        city,
        state,
        zipCode,
        userId,
        dealType,
        price,
        potentialARV,
        showingTime,
        estimatedBudget,
        beds,
        baths,
        sqft,
        propertyType,
        notes,
        adminNotes,
        photosUrl,
        links,
        isArvExclusive,
        onBehalfOfEmail,
    } = input;

    const hasAddress = typeof address === 'string' && address.trim().length > 0;

    // Structural details come from SFR when an address is provided; for an undisclosed address
    // they fall back to the values the poster entered manually.
    let structBeds: number | null = beds != null ? Number(beds) : null;
    let structBaths: number | null = baths != null ? Number(baths) : null;
    let structSqft: number | null = sqft != null ? Number(sqft) : null;
    let structPropertyType: string | null = normalizePropertyType(propertyType ?? null);
    let structSfrPropertyId: number | null = null;

    if (hasAddress) {
        const lookup = await lookupPropertyByAddress({
            address: (address as string).trim(),
            city,
            state,
            zipCode: String(zipCode),
        });
        if (lookup.status === 'found') {
            structBeds = lookup.beds;
            structBaths = lookup.baths;
            structSqft = lookup.sqft;
            structPropertyType = lookup.propertyType;
            structSfrPropertyId = lookup.sfrPropertyId;
        } else {
            structBeds = null;
            structBaths = null;
            structSqft = null;
            structPropertyType = null;
            console.warn(
                `${label} SFR lookup returned '${lookup.status}' for "${address}" — storing null structural details`,
            );
        }
    }

    const validDealTypes = ['wholesale', 'agent', 'sold', 'reo'] as const;
    const resolvedDealType = (validDealTypes as readonly string[]).includes(dealType ?? '')
        ? (dealType as 'wholesale' | 'agent' | 'sold' | 'reo')
        : ('agent' as const);

    // MSA is derived from the location; the client-provided msaId is only a fallback for
    // addresses that don't resolve to a tracked market.
    const resolvedMsaId = await resolveMsaId(city, state, zipCode);
    const msaId = resolvedMsaId ?? input.msaId;
    if (msaId == null) {
        throw new DealServiceError(
            422,
            'Could not determine the market for this address — please select one.',
        );
    }
    // resolveMsaId already returns an id that exists in `msas`; only the client fallback needs checking.
    if (resolvedMsaId == null) {
        const [msaExists] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.id, msaId))
            .limit(1);
        if (!msaExists) {
            throw new DealServiceError(422, 'Invalid market — please select a valid market.');
        }
    }

    const county = await resolveCountyFromZip(zipCode, city, state);

    const [deal] = await db
        .insert(deals)
        .values({
            userId,
            msaId,
            type: resolvedDealType,
            sfrPropertyId: structSfrPropertyId,
            address: hasAddress ? (address as string).trim() : null,
            city: city.trim(),
            state: state.toUpperCase().trim(),
            zipCode: String(zipCode).trim(),
            county: county,
            price: price != null ? String(price) : null,
            potentialARV: potentialARV != null ? String(potentialARV) : null,
            showingTime: showingTime ?? null,
            estimatedBudget: estimatedBudget != null ? Number(estimatedBudget) : null,
            beds: structBeds,
            baths: structBaths != null ? String(structBaths) : null,
            sqft: structSqft,
            propertyType: structPropertyType,
            notes: notes ?? null,
            adminNotes: adminNotes ?? null,
            photosUrl: photosUrl ?? null,
            isArvExclusive: isArvExclusive ?? false,
            onBehalfOfEmail: onBehalfOfEmail ?? null,
        })
        .returning();

    console.log(
        `${label} Deal posted: id=${deal.id}, city=${city}, state=${state}, msaId=${msaId}`,
    );

    const validLinks = filterValidLinks(links);
    if (validLinks.length > 0) {
        await db.insert(dealLinks).values(
            validLinks.map((link, i) => ({
                dealId: deal.id,
                sortOrder: i + 1,
                url: link.url,
                domain: link.domain,
            })),
        );
    }

    return { deal, msaId, links: validLinks };
}

// Cities that cross MSA boundaries but belong to a companion MSA's notification audience.
// Key: "city|state" (lowercase). Values: additional MSA names to notify.
const COMPANION_NOTIFICATION_MSAS: Record<string, string[]> = {
    'temecula|ca': ['San Diego-Chula Vista-Carlsbad, CA'],
    'murrieta|ca': ['San Diego-Chula Vista-Carlsbad, CA'],
};

// ── POST deal — background notification (fire and forget) ──────────────────────
type DealNotificationData = {
    id: number;
    createdAt: Date;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    county: string | null;
    beds: number | null;
    baths: string | null;
    sqft: number | null;
    price: string | null;
    potentialARV: string | null;
    showingTime: string | null;
    estimatedBudget: number | null;
    propertyType: string | null;
    type: DealType;
    sfrPropertyId: number | null;
    notes: string | null;
    isArvExclusive: boolean;
};

export async function sendDealNotification(
    deal: DealNotificationData,
    msaId: number,
    posterUserId: string,
    sendNotifications: boolean,
    notificationType: 'new' | 'sold' | 'price_update' = 'new',
    previousPrice?: string | null,
): Promise<void> {
    const label = '[dealsService.sendDealNotification]';
    try {
        const subscribedUsers = await db
            .select({
                id: users.id,
                email: users.email,
                dealTypeFilter: userNotificationPreferences.dealTypeFilter,
            })
            .from(users)
            .innerJoin(userMsaSubscriptions, eq(users.id, userMsaSubscriptions.userId))
            .innerJoin(
                userNotificationPreferences,
                eq(users.id, userNotificationPreferences.userId),
            )
            .where(
                and(
                    eq(userMsaSubscriptions.msaId, msaId),
                    eq(users.notifications, true),
                    eq(userNotificationPreferences.dealNotificationsEnabled, true),
                ),
            );

        // ── Companion MSA fan-out ─────────────────────────────────────────────────
        // Some cities straddle MSA boundaries. Merge subscribers from companion MSAs
        // so they receive the same notification as the primary MSA subscribers.
        const allSubscribers = [...subscribedUsers];
        const companionMsaIds: number[] = [];
        const companionKey = `${deal.city?.toLowerCase().trim()}|${deal.state?.toLowerCase().trim()}`;
        for (const companionName of COMPANION_NOTIFICATION_MSAS[companionKey] ?? []) {
            const [companionMsaRow] = await db
                .select({ id: msas.id })
                .from(msas)
                .where(eq(msas.name, companionName))
                .limit(1);
            if (!companionMsaRow) continue;
            companionMsaIds.push(companionMsaRow.id);
            const companionSubs = await db
                .select({
                    id: users.id,
                    email: users.email,
                    dealTypeFilter: userNotificationPreferences.dealTypeFilter,
                })
                .from(users)
                .innerJoin(userMsaSubscriptions, eq(users.id, userMsaSubscriptions.userId))
                .innerJoin(
                    userNotificationPreferences,
                    eq(users.id, userNotificationPreferences.userId),
                )
                .where(
                    and(
                        eq(userMsaSubscriptions.msaId, companionMsaRow.id),
                        eq(users.notifications, true),
                        eq(userNotificationPreferences.dealNotificationsEnabled, true),
                    ),
                );
            allSubscribers.push(...companionSubs);
        }
        // ─────────────────────────────────────────────────────────────────────────

        if (allSubscribers.length === 0) {
            console.log(`${label} No MSA subscribers to notify`);
            return;
        }

        // neil@arvfinance.com receives notifications for his own postings; all other posters do not
        const posterInSubscribers = allSubscribers.find((u) => u.id === posterUserId);
        const posterIsNeil = posterInSubscribers?.email?.toLowerCase() === 'neil@arvfinance.com';
        const seen = new Set<string>(posterIsNeil ? [] : [posterUserId]);
        const uniqueUsers = allSubscribers.filter((u) => {
            if (seen.has(u.id)) return false;
            seen.add(u.id);
            // Deal type filter: empty = all types; non-empty = must include this deal's type
            const typeFilter = (u.dealTypeFilter ?? []) as string[];
            if (typeFilter.length > 0 && !typeFilter.includes(deal.type)) return false;
            return true;
        });

        const template =
            notificationType === 'sold'
                ? process.env.POSTMARK_DEAL_SOLD_TEMPLATE_ALIAS
                : notificationType === 'price_update'
                  ? process.env.POSTMARK_DEAL_UPDATED_TEMPLATE_ALIAS
                  : process.env.POSTMARK_DEAL_TEMPLATE_ALIAS;
        // TEMP OVERRIDE — notifications disabled until ready to enable
        const shouldNotify = sendNotifications === true && !!template;

        if (template && shouldNotify) {
            // Look up MSA name for the county field
            const [msaRow] = await db
                .select({ name: msas.name })
                .from(msas)
                .where(eq(msas.id, msaId))
                .limit(1);
            // Use the MSA the poster selected as the area label, not the physical county.
            // e.g. a Temecula deal posted under San Diego MSA shows "San Diego", not "Riverside".
            const county = msaRow?.name
                ? msaRow.name.split('-')[0].split(',')[0].trim()
                : (deal.county ?? 'your area');

            const { label: dealTypeLabel, color: dealTypeColor } = getDealTypeMeta(deal.type);

            const beds = deal.beds != null ? deal.beds : null;
            const baths = deal.baths != null ? parseFloat(deal.baths) : null;
            const sqft = deal.sqft != null ? deal.sqft.toLocaleString('en-US') : null;
            const price = deal.price ? Number(deal.price).toLocaleString('en-US') : null;
            const potentialARV = deal.potentialARV
                ? Number(deal.potentialARV).toLocaleString('en-US')
                : null;
            const showingTime = deal.showingTime ? formatShowingTime(deal.showingTime) : null;
            const estimatedBudget =
                deal.estimatedBudget != null ? deal.estimatedBudget.toLocaleString('en-US') : null;

            const specsParts: string[] = [];
            if (beds != null) specsParts.push(`${beds} bd`);
            if (baths != null) specsParts.push(`${baths} ba`);
            if (sqft != null) specsParts.push(`${sqft} sqft`);
            const specsLine = specsParts.length > 0 ? specsParts.join('  ·  ') : null;

            // Resolve absolute street view URL (email clients cannot follow relative paths)
            let streetViewUrl: string | null = null;
            if (deal.address && deal.city && deal.state) {
                const APP_BASE_URL = (() => {
                    const u = process.env.APP_URL || 'https://data.arvfinance.com';
                    return /^https?:\/\//i.test(u) ? u : `http://${u}`;
                })();
                const params = new URLSearchParams({
                    address: deal.address,
                    city: deal.city,
                    state: deal.state,
                    size: '200x200',
                });
                if (deal.sfrPropertyId != null)
                    params.set('sfrPropertyId', String(deal.sfrPropertyId));
                try {
                    const result = await getStreetviewImage({
                        address: deal.address,
                        city: deal.city,
                        state: deal.state,
                        size: '200x200',
                        sfrPropertyId: deal.sfrPropertyId ?? undefined,
                    });
                    if ('imageData' in result) {
                        streetViewUrl = `${APP_BASE_URL}/api/properties/streetview?${params}`;
                    }
                } catch {
                    // No image available — placeholder will render via {{#no_image}}
                }
            }

            // ── Whitelist recipients (primary + companion MSAs, deduplicated by email) ──
            const primaryWhitelist = await getWhitelistRecipientsForMsa(msaId);
            const companionWhitelists = await Promise.all(
                companionMsaIds.map((id) => getWhitelistRecipientsForMsa(id)),
            );
            const seenWhitelistEmails = new Set<string>();
            const whitelistRecipients = [...primaryWhitelist, ...companionWhitelists.flat()].filter(
                (r) => {
                    const key = r.email.toLowerCase();
                    if (seenWhitelistEmails.has(key)) return false;
                    seenWhitelistEmails.add(key);
                    return true;
                },
            );
            // ─────────────────────────────────────────────────────────────────────

            const APP_BASE_URL_DEALS = (() => {
                const u = process.env.APP_URL || 'https://data.arvfinance.com';
                return /^https?:\/\//i.test(u) ? u : `http://${u}`;
            })();
            const dealUrlParams = new URLSearchParams({ dealId: String(deal.id) });
            if (deal.county && deal.state) {
                dealUrlParams.set('filterType', 'county');
                dealUrlParams.set('filterValue', deal.county);
                dealUrlParams.set('filterState', deal.state);
            } else if (msaRow?.name) {
                dealUrlParams.set('filterType', 'msa');
                dealUrlParams.set('filterValue', msaRow.name);
            }
            const dealUrl = `${APP_BASE_URL_DEALS}/deals?${dealUrlParams.toString()}`;

            const { sent, failed } = await sendTemplateToUsers({
                recipients: [
                    ...uniqueUsers.map((u) => ({ email: u.email, userId: u.id })),
                    ...whitelistRecipients,
                ],
                templateAlias: template,
                templateModelForRecipient: () => ({
                    // Each block is an object so badge vars are in direct context (no scope chain needed)
                    // is_arv_exclusive must live inside each block object — Postmark resolves
                    // {{#is_arv_exclusive}} from the current block context, not the top level.
                    image_block: streetViewUrl
                        ? {
                              url: streetViewUrl,
                              deal_type_label: dealTypeLabel,
                              deal_type_color: dealTypeColor,
                              is_arv_exclusive: deal.isArvExclusive || null,
                          }
                        : null,
                    no_image_block: !streetViewUrl
                        ? {
                              deal_type_label: dealTypeLabel,
                              deal_type_color: dealTypeColor,
                              is_arv_exclusive: deal.isArvExclusive || null,
                          }
                        : null,
                    address: deal.address || 'Undisclosed Address',
                    city: deal.city ?? '',
                    state: deal.state ?? '',
                    zipcode: deal.zipCode ?? '',
                    specs_line: specsLine,
                    price: price,
                    previous_price: previousPrice
                        ? Number(previousPrice).toLocaleString('en-US')
                        : null,
                    potential_arv: potentialARV,
                    showing_time: showingTime,
                    estimated_budget: estimatedBudget,
                    property_type: deal.propertyType ?? null,
                    notes: deal.notes ?? null,
                    county: county,
                    deal_url: dealUrl,
                    cta_url: `${APP_BASE_URL_DEALS}/deals`,
                    year: new Date().getFullYear(),
                    company_name: 'ARV Finance',
                }),
                logPrefix: label,
            });

            console.log(
                `${label} New-deal emails sent: ${sent}/${uniqueUsers.length + whitelistRecipients.length}` +
                    `${failed.length > 0 ? ` (failed: ${failed.join(', ')})` : ''}`,
            );
        }
    } catch (err) {
        console.error(`${label} Error sending new-deal notification emails:`, err);
    }
}

// ── PATCH deal ─────────────────────────────────────────────────────────────────
export async function updateDeal(id: number, callerId: string, input: UpdateDealInput) {
    const label = '[dealsService.updateDeal]';

    const [existing] = await db
        .select({ id: deals.id, userId: deals.userId })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1);

    if (!existing) throw new DealServiceError(404, 'Deal not found');

    if (existing.userId !== callerId) {
        const callerIsPrivileged = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(and(eq(userRoles.userId, callerId), inArray(roles.name, [...ADMIN_ROLES])))
            .limit(1);

        if (callerIsPrivileged.length === 0) {
            throw new DealServiceError(403, 'You can only edit your own deals');
        }
    }

    const [current] = await db
        .select({
            address: deals.address,
            city: deals.city,
            state: deals.state,
            zipCode: deals.zipCode,
            type: deals.type,
            price: deals.price,
            msaId: deals.msaId,
        })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1);

    const {
        address,
        city,
        state,
        zipCode,
        msaId,
        dealType,
        price,
        potentialARV,
        showingTime,
        estimatedBudget,
        beds,
        baths,
        sqft,
        propertyType,
        notes,
        adminNotes,
        photosUrl,
        links,
        isArvExclusive,
        onBehalfOfEmail,
    } = input;

    const mergedCity = (city !== undefined ? String(city).trim() : current.city) ?? '';
    const mergedState =
        (state !== undefined ? String(state).toUpperCase().trim() : current.state) ?? '';
    const mergedZip = (zipCode !== undefined ? String(zipCode).trim() : current.zipCode) ?? '';

    // Re-derive the MSA from the (possibly updated) location; fall back to a client-provided
    // msaId, then the deal's existing market.
    const resolvedMsaId = await resolveMsaId(mergedCity, mergedState, mergedZip);
    const newMsaId = resolvedMsaId ?? msaId ?? current.msaId;

    const updatedCounty = await resolveCountyFromZip(mergedZip, mergedCity, mergedState);

    const incomingAddress =
        address !== undefined && address !== null ? String(address).trim() : null;

    // Resolve structural details + sfrPropertyId from the address state:
    //  • disclosed + address changed → re-fetch from SFR (or null on miss)
    //  • disclosed + address unchanged → leave the stored values untouched
    //  • undisclosed → use the manually-entered values, drop the SFR link
    const finalAddress = address !== undefined ? incomingAddress : (current.address ?? null);
    const addressChanged =
        address !== undefined && (incomingAddress ?? null) !== (current.address ?? null);
    const finalDisclosed = !!finalAddress && finalAddress.trim().length > 0;

    let structSet: {
        beds?: number | null;
        baths?: string | null;
        sqft?: number | null;
        propertyType?: string | null;
        sfrPropertyId?: number | null;
    } = {};

    if (finalDisclosed) {
        if (addressChanged) {
            const lookup = await lookupPropertyByAddress({
                address: finalAddress!.trim(),
                city: mergedCity,
                state: mergedState,
                zipCode: mergedZip,
            });
            structSet =
                lookup.status === 'found'
                    ? {
                          beds: lookup.beds,
                          baths: lookup.baths != null ? String(lookup.baths) : null,
                          sqft: lookup.sqft,
                          propertyType: lookup.propertyType,
                          sfrPropertyId: lookup.sfrPropertyId,
                      }
                    : { beds: null, baths: null, sqft: null, propertyType: null, sfrPropertyId: null };
        }
    } else {
        structSet = {
            beds: beds !== undefined ? (beds != null ? Number(beds) : null) : undefined,
            baths: baths !== undefined ? (baths != null ? String(baths) : null) : undefined,
            sqft: sqft !== undefined ? (sqft != null ? Number(sqft) : null) : undefined,
            propertyType:
                propertyType !== undefined ? normalizePropertyType(propertyType ?? null) : undefined,
            sfrPropertyId: null,
        };
    }

    const validDealTypes = ['wholesale', 'agent', 'sold', 'reo'] as const;

    const [updated] = await db
        .update(deals)
        .set({
            updatedAt: new Date(),
            msaId: newMsaId,
            county: updatedCounty,
            ...structSet,
            address: address !== undefined ? incomingAddress || null : undefined,
            city: city !== undefined ? mergedCity : undefined,
            state: state !== undefined ? mergedState : undefined,
            zipCode: zipCode !== undefined ? mergedZip : undefined,
            price: price !== undefined ? (price != null ? String(price) : null) : undefined,
            potentialARV:
                potentialARV !== undefined
                    ? potentialARV != null
                        ? String(potentialARV)
                        : null
                    : undefined,
            showingTime: showingTime !== undefined ? (showingTime ?? null) : undefined,
            estimatedBudget:
                estimatedBudget !== undefined
                    ? estimatedBudget != null
                        ? Number(estimatedBudget)
                        : null
                    : undefined,
            type:
                dealType !== undefined &&
                validDealTypes.includes(dealType as (typeof validDealTypes)[number])
                    ? (dealType as (typeof validDealTypes)[number])
                    : undefined,
            notes: notes !== undefined ? (notes ?? null) : undefined,
            adminNotes: adminNotes !== undefined ? (adminNotes ?? null) : undefined,
            photosUrl: photosUrl !== undefined ? (photosUrl ?? null) : undefined,
            isArvExclusive: isArvExclusive !== undefined ? isArvExclusive : undefined,
            onBehalfOfEmail: onBehalfOfEmail !== undefined ? (onBehalfOfEmail ?? null) : undefined,
        })
        .where(eq(deals.id, id))
        .returning();

    // Replace all links (delete + re-insert)
    await db.delete(dealLinks).where(eq(dealLinks.dealId, id));
    const validLinks = filterValidLinks(links);
    if (validLinks.length > 0) {
        await db.insert(dealLinks).values(
            validLinks.map((link, i) => ({
                dealId: id,
                sortOrder: i + 1,
                url: link.url,
                domain: link.domain,
            })),
        );
    }

    console.log(`${label} Deal updated: id=${id}`);
    return {
        ...updated,
        links: validLinks,
        previousType: current.type,
        previousPrice: current.price,
    };
}

// ── REQUEST deal info — single-click email to RM ──────────────────────────────
type RequestInfoOverrides = {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    message?: string;
};

export async function requestDealInfo(
    dealId: number,
    requesterId: string,
    overrides?: RequestInfoOverrides,
): Promise<void> {
    const label = '[dealsService.requestDealInfo]';

    const [dealRow] = await db
        .select({
            id: deals.id,
            address: deals.address,
            city: deals.city,
            state: deals.state,
            zipCode: deals.zipCode,
            type: deals.type,
            price: deals.price,
            potentialARV: deals.potentialARV,
            showingTime: deals.showingTime,
            estimatedBudget: deals.estimatedBudget,
            beds: deals.beds,
            baths: deals.baths,
            sqft: deals.sqft,
            propertyType: deals.propertyType,
            notes: deals.notes,
            adminNotes: deals.adminNotes,
            photosUrl: deals.photosUrl,
            county: deals.county,
            onBehalfOfEmail: deals.onBehalfOfEmail,
            posterUserId: deals.userId,
            posterEmail: users.email,
            posterFirstName: users.firstName,
            posterLastName: users.lastName,
            posterPhone: users.phone,
        })
        .from(deals)
        .leftJoin(users, eq(deals.userId, users.id))
        .where(eq(deals.id, dealId))
        .limit(1);

    if (!dealRow) throw new DealServiceError(404, 'Deal not found');

    const [requester] = await db
        .select({
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, requesterId))
        .limit(1);

    if (!requester) throw new DealServiceError(401, 'Requester not found');

    const DEFAULT_CONTACT = process.env.DEFAULT_CONTACT_RECIPIENT || 'justin@arvfinance.com';

    // Resolve requester's RM — used for the From address regardless of routing mode
    let fromAddress = getDefaultFromEmail();
    const requesterRmMap = await getRmEmailsByUserIds([requesterId]);
    const requesterRmEmail = requesterRmMap.get(requesterId);
    if (requesterRmEmail) {
        const senders = await getConfirmedSenders();
        fromAddress = resolveFromAddress(senders, requesterRmEmail);
    }

    // ── Routing: on-behalf-of vs. direct poster ────────────────────────────────
    // When the deal was posted on behalf of a client (onBehalfOfEmail set):
    //   To  = client email (the person the deal belongs to)
    //   CC  = poster's RM (they manage that client relationship)
    // Otherwise (normal flow):
    //   To  = poster's email
    //   CC  = requester's RM (or default contact)
    let toAddress: string;
    let ccAddress: string;

    if (dealRow.onBehalfOfEmail) {
        toAddress = dealRow.onBehalfOfEmail;
        // Resolve the poster's RM for CC
        const posterRmMap = await getRmEmailsByUserIds([dealRow.posterUserId]);
        const posterRmEmail = posterRmMap.get(dealRow.posterUserId);
        ccAddress = posterRmEmail ?? DEFAULT_CONTACT;
        console.log(`${label} On-behalf-of routing: to=${toAddress}, cc=${ccAddress}`);
    } else {
        if (!dealRow.posterEmail) {
            console.warn(`${label} Poster has no email — skipping notification: dealId=${dealId}`);
            return;
        }
        toAddress = dealRow.posterEmail;
        ccAddress = requesterRmEmail ?? DEFAULT_CONTACT;
    }
    // ──────────────────────────────────────────────────────────────────────────

    const displayFirstName = overrides?.firstName?.trim() || requester.firstName;
    const displayLastName = overrides?.lastName?.trim() || requester.lastName;
    const displayEmail = overrides?.email?.trim() || requester.email;
    const displayPhone = overrides?.phone?.trim() || requester.phone || null;
    const displayMessage = overrides?.message?.trim() || null;

    const requesterName = [displayFirstName, displayLastName].filter(Boolean).join(' ');

    const APP_BASE_URL = (() => {
        const u = process.env.APP_URL || 'https://data.arvfinance.com';
        return /^https?:\/\//i.test(u) ? u : `http://${u}`;
    })();
    const dealUrlParams = new URLSearchParams({ dealId: String(dealRow.id) });
    if (dealRow.county && dealRow.state) {
        dealUrlParams.set('filterType', 'county');
        dealUrlParams.set('filterValue', dealRow.county);
        dealUrlParams.set('filterState', dealRow.state);
    }
    const dealUrl = `${APP_BASE_URL}/deals?${dealUrlParams.toString()}`;

    const ccCandidates = [ccAddress, displayEmail].filter(
        (addr): addr is string => Boolean(addr) && addr !== toAddress,
    );
    const ccList = Array.from(new Set(ccCandidates));
    const cc = ccList.length > 0 ? ccList.join(', ') : undefined;

    const inquiryTemplateAlias = process.env.POSTMARK_DEAL_INQUIRY_TEMPLATE_ALIAS;
    if (!inquiryTemplateAlias) throw new Error('POSTMARK_DEAL_INQUIRY_TEMPLATE_ALIAS is not set');

    await sendEmailWithTemplate({
        From: fromAddress,
        To: toAddress,
        ReplyTo: displayEmail,
        Cc: cc,
        TemplateAlias: inquiryTemplateAlias,
        TemplateModel: {
            poster_name:
                [dealRow.posterFirstName, dealRow.posterLastName].filter(Boolean).join(' ') || null,
            requester_name: requesterName || null,
            requester_email: displayEmail,
            requester_phone: displayPhone || null,
            message: displayMessage || null,
            address: dealRow.address || 'Undisclosed Address',
            city: dealRow.city ?? '',
            state: dealRow.state ?? '',
            deal_url: dealUrl,
            year: new Date().getFullYear(),
            company_name: 'ARV Finance',
        },
    });

    console.log(
        `${label} Sent request-info: dealId=${dealId}, to=${toAddress}${cc ? `, cc=${cc}` : ''}`,
    );
}

// ── DELETE deal ────────────────────────────────────────────────────────────────
export async function deleteDeal(id: number, callerId: string) {
    const label = '[dealsService.deleteDeal]';

    const [deal] = await db
        .select({ id: deals.id, userId: deals.userId })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1);

    if (!deal) throw new DealServiceError(404, 'Deal not found');

    const callerIsPrivileged = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
            and(
                eq(userRoles.userId, callerId),
                inArray(roles.name, [...PRIVILEGED_ROLES]),
            ),
        )
        .limit(1);

    if (callerIsPrivileged.length === 0 && deal.userId !== callerId) {
        throw new DealServiceError(403, 'You can only delete your own deals');
    }

    await db.delete(deals).where(eq(deals.id, id));

    console.log(`${label} Deal deleted: id=${id}`);
    return { id: deal.id };
}

// ── Deal offers (bids) ───────────────────────────────────────────────────────────
type CreateDealBidInput = {
    amount: number;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
};

// Records a non-binding offer and returns the bid plus the minimal deal context the
// caller needs to notify the poster.
export async function createDealBid(
    dealId: number,
    bidderUserId: string,
    input: CreateDealBidInput,
): Promise<{
    bid: typeof dealBids.$inferSelect;
    deal: { id: number; userId: string; address: string | null; city: string | null; state: string | null };
}> {
    const label = '[dealsService.createDealBid]';

    const [deal] = await db
        .select({
            id: deals.id,
            userId: deals.userId,
            address: deals.address,
            city: deals.city,
            state: deals.state,
        })
        .from(deals)
        .where(eq(deals.id, dealId))
        .limit(1);

    if (!deal) throw new DealServiceError(404, 'Deal not found');

    const [bid] = await db
        .insert(dealBids)
        .values({
            dealId,
            bidderUserId,
            amount: String(input.amount),
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            email: input.email.trim(),
            phone: input.phone?.trim() || null,
        })
        .returning();

    console.log(`${label} Offer submitted: dealId=${dealId}, bidder=${bidderUserId}`);
    return { bid, deal };
}

// Returns every offer on a deal, newest first. Offers are poster-private: only the deal
// owner or a privileged team member may read them.
export async function getBidsForDeal(
    dealId: number,
    callerId: string,
): Promise<(typeof dealBids.$inferSelect)[]> {
    const [deal] = await db
        .select({ id: deals.id, userId: deals.userId })
        .from(deals)
        .where(eq(deals.id, dealId))
        .limit(1);

    if (!deal) throw new DealServiceError(404, 'Deal not found');

    if (deal.userId !== callerId) {
        const callerIsPrivileged = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
                and(
                    eq(userRoles.userId, callerId),
                    inArray(roles.name, [...PRIVILEGED_ROLES]),
                ),
            )
            .limit(1);

        if (callerIsPrivileged.length === 0) {
            throw new DealServiceError(403, 'You can only view offers on your own deals');
        }
    }

    return db
        .select()
        .from(dealBids)
        .where(eq(dealBids.dealId, dealId))
        .orderBy(desc(dealBids.createdAt));
}

// Removes a single offer. Only the deal owner or a privileged team member may delete.
export async function deleteDealBid(
    dealId: number,
    bidId: number,
    callerId: string,
): Promise<{ id: number }> {
    const label = '[dealsService.deleteDealBid]';

    const [bid] = await db
        .select({ id: dealBids.id, dealId: dealBids.dealId })
        .from(dealBids)
        .where(eq(dealBids.id, bidId))
        .limit(1);

    if (!bid || bid.dealId !== dealId) throw new DealServiceError(404, 'Offer not found');

    const [deal] = await db
        .select({ userId: deals.userId })
        .from(deals)
        .where(eq(deals.id, dealId))
        .limit(1);

    if (!deal) throw new DealServiceError(404, 'Deal not found');

    if (deal.userId !== callerId) {
        const callerIsPrivileged = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
                and(
                    eq(userRoles.userId, callerId),
                    inArray(roles.name, [...PRIVILEGED_ROLES]),
                ),
            )
            .limit(1);

        if (callerIsPrivileged.length === 0) {
            throw new DealServiceError(403, 'You can only delete offers on your own deals');
        }
    }

    await db.delete(dealBids).where(eq(dealBids.id, bidId));

    console.log(`${label} Offer deleted: dealId=${dealId}, bidId=${bidId}`);
    return { id: bidId };
}

// ── Offer email notification ───────────────────────────────────────────────────
// Routing mirrors requestDealInfo, with the bidder playing the requester's role:
//   On-behalf deal: To = client email, Cc = poster's RM (or default) + bidder email
//   Normal deal:    To = poster email, Cc = bidder's RM (or default) + bidder email
//   From = bidder's RM (if a confirmed sender), else default. Reply-To = bidder email.
export async function sendDealOfferNotification(
    dealId: number,
    bid: typeof dealBids.$inferSelect,
): Promise<void> {
    const label = '[dealsService.sendDealOfferNotification]';

    const offerTemplateAlias = process.env.POSTMARK_DEAL_OFFER_TEMPLATE_ALIAS;
    if (!offerTemplateAlias) {
        console.warn(`${label} POSTMARK_DEAL_OFFER_TEMPLATE_ALIAS not set — skipping`);
        return;
    }

    const [dealRow] = await db
        .select({
            id: deals.id,
            address: deals.address,
            city: deals.city,
            state: deals.state,
            county: deals.county,
            onBehalfOfEmail: deals.onBehalfOfEmail,
            posterUserId: deals.userId,
            posterEmail: users.email,
            posterFirstName: users.firstName,
            posterLastName: users.lastName,
        })
        .from(deals)
        .leftJoin(users, eq(deals.userId, users.id))
        .where(eq(deals.id, dealId))
        .limit(1);

    if (!dealRow) {
        console.warn(`${label} Deal not found — skipping: dealId=${dealId}`);
        return;
    }

    const DEFAULT_CONTACT = process.env.DEFAULT_CONTACT_RECIPIENT || 'justin@arvfinance.com';

    // From = bidder's RM (when a confirmed sender), else the default address
    let fromAddress = getDefaultFromEmail();
    const bidderRmMap = await getRmEmailsByUserIds([bid.bidderUserId]);
    const bidderRmEmail = bidderRmMap.get(bid.bidderUserId);
    if (bidderRmEmail) {
        const senders = await getConfirmedSenders();
        fromAddress = resolveFromAddress(senders, bidderRmEmail);
    }

    // ── Routing: on-behalf-of vs. direct poster ────────────────────────────────
    let toAddress: string;
    let ccBase: string;

    if (dealRow.onBehalfOfEmail) {
        toAddress = dealRow.onBehalfOfEmail;
        const posterRmMap = await getRmEmailsByUserIds([dealRow.posterUserId]);
        const posterRmEmail = posterRmMap.get(dealRow.posterUserId);
        ccBase = posterRmEmail ?? DEFAULT_CONTACT;
        console.log(`${label} On-behalf-of routing: to=${toAddress}, cc=${ccBase}`);
    } else {
        if (!dealRow.posterEmail) {
            console.warn(`${label} Poster has no email — skipping: dealId=${dealId}`);
            return;
        }
        toAddress = dealRow.posterEmail;
        ccBase = bidderRmEmail ?? DEFAULT_CONTACT;
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Cc = RM/default contact + bidder's email, deduped, never duplicating To
    const ccCandidates = [ccBase, bid.email].filter(
        (addr): addr is string => Boolean(addr) && addr !== toAddress,
    );
    const ccList = Array.from(new Set(ccCandidates));
    const cc = ccList.length > 0 ? ccList.join(', ') : undefined;

    const APP_BASE_URL = (() => {
        const u = process.env.APP_URL || 'https://data.arvfinance.com';
        return /^https?:\/\//i.test(u) ? u : `http://${u}`;
    })();
    const dealUrlParams = new URLSearchParams({ dealId: String(dealRow.id) });
    if (dealRow.county && dealRow.state) {
        dealUrlParams.set('filterType', 'county');
        dealUrlParams.set('filterValue', dealRow.county);
        dealUrlParams.set('filterState', dealRow.state);
    }
    const dealUrl = `${APP_BASE_URL}/deals?${dealUrlParams.toString()}`;

    const bidderName = [bid.firstName, bid.lastName].filter(Boolean).join(' ');

    await sendEmailWithTemplate({
        From: fromAddress,
        To: toAddress,
        ReplyTo: bid.email,
        Cc: cc,
        TemplateAlias: offerTemplateAlias,
        TemplateModel: {
            poster_name:
                [dealRow.posterFirstName, dealRow.posterLastName].filter(Boolean).join(' ') || null,
            bidder_name: bidderName || null,
            bidder_email: bid.email,
            bidder_phone: bid.phone || null,
            offer_amount: Number(bid.amount).toLocaleString('en-US'),
            address: dealRow.address || 'Undisclosed Address',
            city: dealRow.city ?? '',
            state: dealRow.state ?? '',
            deal_url: dealUrl,
            year: new Date().getFullYear(),
            company_name: 'ARV Finance',
        },
    });

    console.log(
        `${label} Sent offer email: dealId=${dealId}, to=${toAddress}${cc ? `, cc=${cc}` : ''}`,
    );
}

// Batch offer counts for a set of deals (used to badge the poster's own deal cards).
export async function getBidCountsForDealIds(dealIds: number[]): Promise<Map<number, number>> {
    if (dealIds.length === 0) return new Map();

    const rows = await db
        .select({ dealId: dealBids.dealId, count: sql<number>`COUNT(*)::int` })
        .from(dealBids)
        .where(inArray(dealBids.dealId, dealIds))
        .groupBy(dealBids.dealId);

    const counts = new Map<number, number>();
    for (const row of rows) counts.set(row.dealId, row.count);
    return counts;
}
