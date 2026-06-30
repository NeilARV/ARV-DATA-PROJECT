import {
    STREET_TYPE_ABBREVIATIONS,
    DIRECTIONAL_ABBREVIATIONS,
    ORDINAL_WORDS,
    UNIT_DESIGNATORS,
} from '../constants/street-types';

// Normalize address to standard format based on specific rules
/**
 * Rules:
 * 1. Capitalize first letter of each word in street name
 * 2. Use standard abbreviations for street types (Ave, Dr, St, etc.) without periods
 * 3. Preserve street numbers
 */
export function formatAddress(address: string | null | undefined): string | null {
    if (!address || typeof address !== 'string') return null;

    const trimmed = address.trim();
    if (trimmed.length === 0) return null;

    // Split address into parts (number and street)
    // Pattern: optional number, then street name
    const parts = trimmed.split(/\s+/);

    if (parts.length === 0) return null;

    // First part is usually the street number
    const normalizedParts: string[] = [];
    let i = 0;

    // Keep the street number as-is (first token that looks like a number)
    if (parts.length > 0 && /^\d+/.test(parts[0])) {
        normalizedParts.push(parts[0]);
        i = 1;
    }
    const hasStreetNumber = normalizedParts.length > 0;

    // Process the rest as street name
    const streetParts: string[] = [];
    for (; i < parts.length; i++) {
        streetParts.push(parts[i]);
    }

    // Normalize each word in the street name
    const normalizedStreet = streetParts
        .map((word, index) => {
            const lowerWord = word.toLowerCase();
            const isLastWord = index === streetParts.length - 1;

            // Only abbreviate a trailing suffix on something that looks like a street address (it has
            // a leading house number). A bare locality like a city name ("Grand Terrace") has no
            // number, so its last word must not be abbreviated to a street suffix ("Grand Ter").
            if (isLastWord && hasStreetNumber && STREET_TYPE_ABBREVIATIONS[lowerWord]) {
                return STREET_TYPE_ABBREVIATIONS[lowerWord];
            }

            // Capitalize first letter, lowercase the rest
            if (word.length === 0) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');

    // Combine number and normalized street
    if (normalizedParts.length > 0) {
        return `${normalizedParts[0]} ${normalizedStreet}`.trim();
    }

    return normalizedStreet.trim();
}

/**
 * Shared cleaning preamble for an address string: uppercase, drop periods, strip a trailing
 * `UNITED STATES` / `USA`, and collapse whitespace. Commas are deliberately left intact so a caller
 * that splits a full address on the street↔locality comma (see `parseCsvAddress`) still can; callers
 * that want commas gone replace them afterwards. Defined once so the country-suffix rule — which
 * BOTH sides of a match must apply identically — lives in a single place.
 *
 * @param input a raw address or address fragment
 * @returns the cleaned, upper-cased string (no periods, no trailing country, single-spaced)
 */
export function cleanAddressString(input: string): string {
    return input
        .toUpperCase()
        .replace(/\./g, '')
        .replace(/\s+(UNITED STATES|USA)\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** True when `token` looks like a unit value following a designator (`APT 4`, `STE 200`, `UNIT B`, `#5`). */
function isUnitValue(token: string): boolean {
    return /^\d/.test(token) || /^[A-Z]$/.test(token) || token.startsWith('#');
}

/**
 * Drop unit designators together with their value, plus any standalone `#…` token, so a unit present
 * on one side of a match but not the other can't block a street match. A designator is removed **only
 * when actually followed by a unit value** — so a designator word that is part of the street name
 * (`SPACE` in `SPACE PARK WAY`, `ROOM` in `SCHOOL ROOM RD`) is kept, because the next token isn't a
 * value. See {@link UNIT_DESIGNATORS}.
 */
function stripUnitTokens(tokens: string[]): string[] {
    const kept: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (UNIT_DESIGNATORS.has(token) && i + 1 < tokens.length && isUnitValue(tokens[i + 1])) {
            i++; // also skip the unit value (APT *4*, STE *200*)
            continue;
        }
        if (token.startsWith('#')) continue;
        kept.push(token);
    }
    return kept;
}

/**
 * Canonicalize the street body (everything after an optional leading house number) by POSITION rather
 * than by mapping every token. The positional restriction is what keeps a lettered street (`E ST`)
 * from collapsing into its compass-word homonym (`EAST ST`), and a mid-name word (`POINT` in
 * `POINT LOMA BLVD`) from being abbreviated as if it were the trailing suffix. Only the slots a real
 * address actually has are canonicalized:
 *  - a **trailing** street suffix (`AVENUE` → `AVE`);
 *  - a **trailing** post-directional and a **leading** pre-directional, but only while a name token
 *    still sits beside them — so a directional that IS the whole street name (`N ST`) is left as-is;
 *  - spelled-out ordinals anywhere in the remaining name (`FIRST` → `1ST`).
 *
 * Token order is preserved, so a pre-directional and a post-directional stay distinct (`N MAIN ST`
 * is NOT merged with `MAIN ST N`), matching how the stored `addresses` table keeps
 * `streetPreDirection` and `streetPostDirection` in separate columns.
 */
function canonicalizeStreetBody(body: string[]): string[] {
    const out = [...body];
    let lo = 0;
    let hi = out.length - 1;

    // Trailing post-directional — only when a name token precedes it (lo < hi).
    if (hi > lo && DIRECTIONAL_ABBREVIATIONS[out[hi].toLowerCase()]) {
        out[hi] = DIRECTIONAL_ABBREVIATIONS[out[hi].toLowerCase()];
        hi--;
    }
    // Trailing suffix — only when a name token precedes it.
    if (hi > lo && STREET_TYPE_ABBREVIATIONS[out[hi].toLowerCase()]) {
        out[hi] = STREET_TYPE_ABBREVIATIONS[out[hi].toLowerCase()].toUpperCase();
        hi--;
    }
    // Leading pre-directional — only when a name token follows it.
    if (hi > lo && DIRECTIONAL_ABBREVIATIONS[out[lo].toLowerCase()]) {
        out[lo] = DIRECTIONAL_ABBREVIATIONS[out[lo].toLowerCase()];
        lo++;
    }
    // Remaining name tokens: collapse spelled-out ordinals only.
    for (let i = lo; i <= hi; i++) {
        const ordinal = ORDINAL_WORDS[out[i].toLowerCase()];
        if (ordinal) out[i] = ordinal;
    }
    return out;
}

/**
 * Canonicalize a street address into a single uppercase token string for **exact-equality matching**
 * (the code-violation pipeline, §4.3). The point is that the same physical street, written any of the
 * inconsistent ways the Accela export and our stored `addresses` use it, collapses to one identical
 * string — so matching is a string `===`, with normalization (not fuzzy logic) doing the work.
 *
 * Pass a street fragment only (number + name + suffix); city/state/zip are matched separately and
 * should not be included. Steps:
 *  1. Clean: uppercase, strip `.`, drop a trailing `UNITED STATES` / `USA`, treat `,` as a separator
 *     ({@link cleanAddressString}).
 *  2. Drop unit designators and their value (`APT 4`, `STE 200`, `#5`) — see {@link stripUnitTokens}.
 *  3. Preserve a leading house number verbatim and canonicalize the street body **positionally** —
 *     suffix, directionals, and ordinals only in the slots where they belong ({@link canonicalizeStreetBody}).
 *
 * Run identically on both sides of a comparison; never assume the stored side is already clean.
 *
 * @param input the raw street fragment (CSV address street part, or a stored `formatted_street_address`)
 * @returns the canonical uppercase match key (e.g. `"3421 ADAMS AVE"`), or `""` when there's nothing usable
 */
export function normalizeAddressForMatch(input: string | null | undefined): string {
    if (!input || typeof input !== 'string') return '';

    const cleaned = cleanAddressString(input).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) return '';

    const tokens = stripUnitTokens(cleaned.split(' ').filter(Boolean));
    if (tokens.length === 0) return '';

    // A leading house number is reduced to its digit prefix so a unit-suffixed or ranged number
    // ('123B', '123-125') collapses to the bare numeric form our `addresses.street_number` stores —
    // otherwise the exact-equality match (and the street_number prefilter) would never find it. An
    // ordinal like '1ST' (two trailing letters) is NOT a house number, so it stays in the body.
    // Positional canonicalization applies only to the street body that follows the number.
    const houseNumberMatch = tokens[0].match(/^(\d+)(?:-\d+)?[A-Za-z]?$/);
    const number = houseNumberMatch ? [houseNumberMatch[1]] : [];
    const body = houseNumberMatch ? tokens.slice(1) : tokens;

    return [...number, ...canonicalizeStreetBody(body)].join(' ').trim();
}
