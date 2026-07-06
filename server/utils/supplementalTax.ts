/**
 * Supplemental tax bill calculation (pure — no I/O).
 *
 * California-only: supplemental bills are a Prop-13 construct. On an arm's-length
 * change of ownership the property is reassessed to its sale price, and the county
 * bills (or refunds) the difference against the prior roll value. Per R&T §75.41(b)
 * the event is PRESUMED to have occurred on the first day of the month FOLLOWING the
 * actual date, and §75.41(c) prorates by the fraction of the fiscal year
 * (Jul 1 – Jun 30) remaining from that presumed date — so a July event gets the
 * Aug-1 factor (0.92), not 1.00. Events Jan–May additionally produce a second
 * full-year bill because the next FY's roll (lien date Jan 1) was already set at the
 * old value; a June event (presumed Jul 1) produces NO current-roll supplemental and
 * instead a single full-year bill against the next fiscal year (§75.41(c)(6)).
 * Other states have no equivalent; a future state-specific model slots in as a
 * sibling branch here, gated by SUPPLEMENTAL_TAX_STATES so callers don't change.
 */

import type { supplementalBillTypeEnum } from '@database/schemas/properties.schema';
import type { TransactionSupplementalTax } from '@shared/types/properties';

/**
 * States with a supplemental-assessment regime. Single source of truth for every
 * gate — the consumer's MSA gate, the pipeline step's address filter, and the
 * backfill's WHERE clause all derive from this set, so enabling a state is a
 * one-line change here.
 */
export const SUPPLEMENTAL_TAX_STATES: ReadonlySet<string> = new Set(['CA']);

/**
 * Whether `state` has a supplemental tax model.
 * Tolerant of case/whitespace — addresses.state is stored verbatim from SFR.
 */
export function isSupplementalTaxState(state: string | null | undefined): boolean {
    return state != null && SUPPLEMENTAL_TAX_STATES.has(state.trim().toUpperCase());
}

/** Flat statewide CA supplemental rate for v1 (1% Prop-13 base + typical local add-ons). */
export const CA_SUPPLEMENTAL_TAX_RATE = 0.0125;

// Derived from the pg enum so the union can't drift from the column. The import is
// type-only, so this pure calculator gains no runtime Drizzle coupling.
export type SupplementalBillType = (typeof supplementalBillTypeEnum.enumValues)[number];

/**
 * §75.41(c) proration factors indexed by EVENT month (0 = January): the factor of
 * the first (or only) bill that month produces. The statute prorates from the
 * PRESUMED date — the 1st of the following month — so each event month carries the
 * next month's fraction (July → Aug 1 → 11/12 ≈ 0.92). June's entry is 1.00: its
 * presumed date (Jul 1) leaves nothing of the current roll to prorate, and its
 * single bill is the NEXT fiscal year in full (§75.41(c)(6)).
 */
const PRORATION_FACTOR_BY_EVENT_MONTH: readonly number[] = [
    0.42, // January   (presumed Feb 1)
    0.33, // February  (presumed Mar 1)
    0.25, // March     (presumed Apr 1)
    0.17, // April     (presumed May 1)
    0.08, // May       (presumed Jun 1)
    1.0, // June      (presumed Jul 1 — full-year bill on the next fiscal year)
    0.92, // July      (presumed Aug 1)
    0.83, // August    (presumed Sep 1)
    0.75, // September (presumed Oct 1)
    0.67, // October   (presumed Nov 1)
    0.58, // November  (presumed Dec 1)
    0.5, // December  (presumed Jan 1)
];

/** One (fiscal year, proration factor) slot an event owes a supplemental for. */
export interface SupplementalScheduleEntry {
    /** Starting calendar year of the fiscal year (2026 = FY 2026-27). */
    fiscalYear: number;
    /** 0..1 — 1.00 for a full-year bill. */
    prorationFactor: number;
}

/**
 * Parse a YYYY-MM-DD-leading string into { year, monthIndex }. Deliberately regex-only
 * — never `new Date(string)` — so the result cannot shift a day across timezones.
 */
function parseEventDate(saleDate: string): { year: number; monthIndex: number } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(saleDate.trim());
    if (!match) return null;
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) return null;
    return { year: Number(match[1]), monthIndex };
}

/**
 * The statutory bill schedule for a change-of-ownership event (R&T §75.41): which
 * fiscal year(s) receive a supplemental and at what proration factor. The caller
 * resolves each slot's own prior value — the two fiscal years of a Jan–May event
 * have different rolls, so one shared prior value would misstate the first bill.
 *
 * @param state two-letter state code (any case) — non-supplemental states yield []
 * @param saleDate event date as a YYYY-MM-DD-leading string; unparseable yields []
 * @returns 1 entry for a Jun–Dec event, 2 for a Jan–May event (current FY prorated
 * + next FY at factor 1.00). A June event's single entry is the NEXT fiscal year at
 * 1.00 — its presumed date (Jul 1) leaves no current-roll share to bill.
 */
export function getSupplementalTaxSchedule(
    state: string | null | undefined,
    saleDate: string,
): SupplementalScheduleEntry[] {
    if (!isSupplementalTaxState(state)) return [];
    const eventDate = parseEventDate(saleDate);
    if (!eventDate) return [];
    const { year, monthIndex } = eventDate;

    // Jun–Dec events land in the FY starting that year (June via its presumed Jul 1
    // date); Jan–May events land in the FY that started the prior calendar year.
    const fiscalYear = monthIndex >= 5 ? year : year - 1;
    const schedule: SupplementalScheduleEntry[] = [
        { fiscalYear, prorationFactor: PRORATION_FACTOR_BY_EVENT_MONTH[monthIndex] },
    ];

    // Jan–May: the next FY's roll (lien date Jan 1) was already set at the old
    // value, so the county issues a second, full-year supplemental for it.
    if (monthIndex <= 4) schedule.push({ fiscalYear: year, prorationFactor: 1 });

    return schedule;
}

/** One computed supplemental bill/refund; amounts are positive magnitudes. */
export interface CalculatedSupplementalBill {
    /** Starting calendar year of the fiscal year (2026 = FY 2026-27). */
    fiscalYear: number;
    /** 'bill' when the reassessed value rose, 'refund' when it fell. */
    billType: SupplementalBillType;
    /** |newBaseValue − priorAssessedValue| — positive magnitude. */
    netSupplementalValue: number;
    taxRate: number;
    /** 0..1 — 1.00 for a full-year bill. */
    prorationFactor: number;
    /** netSupplementalValue × taxRate × prorationFactor, rounded to cents — positive. */
    amount: number;
}

export interface SupplementalBillInput {
    /** Prior roll value for THIS bill's fiscal year (assessment or traced acquisition). */
    priorAssessedValue: number;
    /** New base value — the sale price the property is reassessed to. */
    newBaseValue: number;
    taxRate: number;
    fiscalYear: number;
    prorationFactor: number;
}

/** Round to cents — bills are money, and the BOE factors are already coarse. */
function roundToCents(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Calculate one supplemental bill/refund for one schedule slot.
 *
 * @returns the bill, or null when there is nothing to issue: non-finite values, a
 * value difference of exactly 0, or an amount that rounds to $0.00 (counties don't
 * issue zero-dollar bills, so persisting one would only skew counts).
 */
export function calculateSupplementalBill(
    input: SupplementalBillInput,
): CalculatedSupplementalBill | null {
    const { priorAssessedValue, newBaseValue, taxRate, fiscalYear, prorationFactor } = input;

    if (!Number.isFinite(priorAssessedValue) || !Number.isFinite(newBaseValue)) return null;

    const difference = newBaseValue - priorAssessedValue;
    if (difference === 0) return null;

    const netSupplementalValue = Math.abs(difference);
    const amount = roundToCents(netSupplementalValue * taxRate * prorationFactor);
    if (amount <= 0) return null;

    return {
        fiscalYear,
        billType: difference > 0 ? 'bill' : 'refund',
        netSupplementalValue,
        taxRate,
        prorationFactor,
        amount,
    };
}

// ─── Ownership-window accrual (v2 display math) ─────────────────────────────────

/** July's month index — fiscal years run Jul 1 – Jun 30, so it bounds every billed window. */
const JULY_INDEX = 6;

/** One stored bill row, as the accrual needs it (amounts are positive magnitudes). */
export interface SupplementalWindowRow {
    /** Starting calendar year of the row's fiscal year (2026 = FY 2026-27). */
    fiscalYear: number;
    billType: SupplementalBillType;
    /** Stored positive magnitude — the direction lives in billType. */
    amount: number;
}

export interface SupplementalWindowInput {
    /** The stored statutory rows of the acquisition transaction (1 or 2 fiscal years). */
    rows: SupplementalWindowRow[];
    /** Sale date of the acquisition transaction the rows belong to (YYYY-MM-DD-leading). */
    acquisitionDate: string;
    /** Resale date when the window is closed (flip); null while still held. */
    resaleDate: string | null;
    /** Evaluation date — "today" from the caller (pure function; no clock access here). */
    asOf: string;
    state: string | null | undefined;
}

/**
 * Accrue an owner's supplemental tax over their actual ownership window.
 *
 * The stored rows are the STATUTORY bills — what a buyer who holds through the fiscal
 * year owes. When the property resells within a billed window, CA prorates successive
 * owners to their actual hold period (BOE supplemental-assessment guidance), so each
 * row is scaled by ownedMonths / billedMonths of its fiscal-year slot. Both window
 * ends use the §75.41(b) presumed-date convention (1st of the month following the
 * event), so successive owners' windows tile exactly at month boundaries — a
 * same-calendar-month flip owes $0.
 *
 * @returns the signed accrued total (bill = −, refund = +, matching the stored-row
 * display convention), or null when there is nothing to show: no rows, a
 * non-supplemental state, unparseable dates, or a $0 window (same-month flip /
 * current-month purchase).
 */
export function accrueSupplementalOverWindow(
    input: SupplementalWindowInput,
): TransactionSupplementalTax | null {
    const { rows, acquisitionDate, resaleDate, asOf, state } = input;
    if (rows.length === 0) return null;

    // Recomputing the schedule both gates (state, parseable acquisition date) and
    // yields each fiscal year's slot to match stored rows against.
    const schedule = getSupplementalTaxSchedule(state, acquisitionDate);
    if (schedule.length === 0) return null;

    const acquisition = parseEventDate(acquisitionDate);
    if (!acquisition) return null;
    const windowEndEvent = parseEventDate(resaleDate ?? asOf);
    if (!windowEndEvent) return null;

    // Absolute month arithmetic (year × 12 + monthIndex); both window ends are the
    // presumed date — the 1st of the month FOLLOWING the event (§75.41(b)).
    const windowStart = acquisition.year * 12 + acquisition.monthIndex + 1;
    const windowEnd = windowEndEvent.year * 12 + windowEndEvent.monthIndex + 1;
    const monthsOwned = Math.max(0, windowEnd - windowStart);

    let signedSum = 0;
    let lastBilledMonth = windowStart;
    for (const row of rows) {
        const slot = schedule.find((s) => s.fiscalYear === row.fiscalYear);
        // A row with no matching slot (stale data) has no derivable billed window.
        if (!slot || !Number.isFinite(row.amount)) continue;

        // The slot's billed window: its fiscal-year months the proration factor
        // covers — the presumed month through Jun 30 for the event's own FY, the
        // full Jul–Jun year for a factor-1.00 slot.
        const slotStart = Math.max(windowStart, slot.fiscalYear * 12 + JULY_INDEX);
        const slotEnd = (slot.fiscalYear + 1) * 12 + JULY_INDEX;
        const billedMonths = slotEnd - slotStart;
        if (billedMonths <= 0) continue;
        lastBilledMonth = Math.max(lastBilledMonth, slotEnd);

        const ownedMonths = Math.max(0, Math.min(windowEnd, slotEnd) - slotStart);
        if (ownedMonths === 0) continue;

        // Scale the STORED amount (not net × rate × months) so rounding stays
        // consistent with what the pipeline persisted; ownedMonths ≤ billedMonths
        // by construction, so the share is at most 1.
        const sign = row.billType === 'refund' ? 1 : -1;
        signedSum += sign * row.amount * (ownedMonths / billedMonths);
    }

    const amount = roundToCents(signedSum);
    if (amount === 0) return null;

    const status = resaleDate !== null || windowEnd >= lastBilledMonth ? 'final' : 'accruing';
    return { amount, monthsOwned, status };
}
