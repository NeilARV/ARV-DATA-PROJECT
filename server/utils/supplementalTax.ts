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
