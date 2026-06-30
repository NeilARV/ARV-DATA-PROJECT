import { db } from 'server/storage';
import { inArray } from 'drizzle-orm';
import { addresses } from '@database/schemas/properties.schema';
import { cleanAddressString, normalizeAddressForMatch } from '@shared/utils/formatAddress';
import type { CvViolation } from '@database/types/code-violations';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** The Accela raw address split into its matchable parts (§4.3). All fields uppercase. */
export interface ParsedCsvAddress {
    /** Leading street number, used to prefilter candidate properties. Null when the row has none. */
    streetNumber: string | null;
    /** Canonical street key for exact-equality comparison + storage as `normalized_address`. */
    normalizedStreet: string;
    /** City, when the row carries one (nearly always "SAN DIEGO"). */
    city: string | null;
    /** Two-letter state, when present. */
    state: string | null;
    /** Five-digit zip — a tiebreaker only, frequently missing. */
    zip: string | null;
}

/** A property's stored address as loaded from the DB, the right-hand side of a match. */
export interface CandidateAddress {
    propertyId: string;
    formattedStreetAddress: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    streetNumber: string | null;
}

/**
 * A candidate whose street key has already been normalized — computed once per candidate when the
 * batch's candidates are grouped, so {@link matchParsedAddress} never re-normalizes the same stored
 * address across the complaints that share its street number.
 */
export interface MatchCandidate {
    propertyId: string;
    /** `normalizeAddressForMatch(formattedStreetAddress)`, precomputed. */
    normalizedStreet: string;
    city: string | null;
    state: string | null;
    zipCode: string | null;
}

/** Outcome of matching one complaint against the candidate set. */
export type MatchOutcome =
    | { kind: 'matched'; propertyId: string }
    | { kind: 'ambiguous'; propertyIds: string[] }
    | { kind: 'unmatched' };

/** One complaint paired with its parsed address and match outcome (what the consumer iterates). */
export interface MatchedViolation {
    violation: CvViolation;
    parsed: ParsedCsvAddress;
    outcome: MatchOutcome;
}

// ─── Parse ──────────────────────────────────────────────────────────────────────

/**
 * Split an Accela raw address (`"3421 Adams Av, San Diego CA 92116 United States"`) into street,
 * city, state, and zip. Deterministic, not fuzzy: the comma separates the street from the locality,
 * and the locality's trailing tokens are peeled off as zip then state. Survives the real-data quirks
 * (missing zip, missing state, missing country, no comma) by leaving those fields null rather than
 * guessing. A bare-junk row (e.g. `"United States"`) yields an empty street, which never matches.
 *
 * @param raw the original CSV address cell
 * @returns the parsed parts; `normalizedStreet` is `""` when there's no usable street
 */
export function parseCsvAddress(raw: string): ParsedCsvAddress {
    // Same cleaning preamble the matcher uses, so the street halves of both sides stay byte-identical
    // (commas are preserved here — they separate the street from the locality below).
    const cleaned = cleanAddressString(raw);

    const commaIdx = cleaned.indexOf(',');
    const streetPart = commaIdx === -1 ? cleaned : cleaned.slice(0, commaIdx);
    const localityPart = commaIdx === -1 ? '' : cleaned.slice(commaIdx + 1);

    let city: string | null = null;
    let state: string | null = null;
    let zip: string | null = null;

    if (localityPart.trim().length > 0) {
        const tokens = localityPart.replace(/,/g, ' ').split(/\s+/).filter(Boolean);

        const maybeZip = tokens[tokens.length - 1];
        if (maybeZip && /^\d{5}(-\d{4})?$/.test(maybeZip)) {
            zip = maybeZip.slice(0, 5);
            tokens.pop();
        }
        const maybeState = tokens[tokens.length - 1];
        if (maybeState && /^[A-Z]{2}$/.test(maybeState)) {
            state = maybeState;
            tokens.pop();
        }
        city = tokens.length > 0 ? tokens.join(' ') : null;
    }

    const normalizedStreet = normalizeAddressForMatch(streetPart);
    const firstToken = normalizedStreet.split(' ')[0] ?? '';
    // Accept ranged/suffixed house numbers ("123-125", "123B") — `addresses.street_number` is free
    // text, not just integers. Ordinal street names ("1ST", "12TH") stay excluded: two trailing
    // letters fail the single optional suffix, so they're correctly treated as having no house number.
    const streetNumber = /^\d+(-\d+)?[A-Za-z]?$/.test(firstToken) ? firstToken : null;

    return { streetNumber, normalizedStreet, city, state, zip };
}

// ─── Match (pure) ─────────────────────────────────────────────────────────────────

/**
 * Decide whether a parsed complaint address matches exactly one property in `candidates`.
 *
 * The street (number + name + suffix) must match exactly after normalization; city and state must
 * match **when the CSV carries them**; zip is only a tiebreaker among multiple street hits. Returns
 * `ambiguous` rather than guessing when more than one distinct property survives.
 *
 * @param parsed the complaint address
 * @param candidates properties prefiltered to the same street number, street key precomputed (see {@link matchViolationBatch})
 * @returns the match outcome
 */
export function matchParsedAddress(
    parsed: ParsedCsvAddress,
    candidates: MatchCandidate[],
): MatchOutcome {
    if (!parsed.normalizedStreet || !parsed.streetNumber) return { kind: 'unmatched' };

    let hits = candidates.filter((c) => c.normalizedStreet === parsed.normalizedStreet);
    if (parsed.city) {
        hits = hits.filter((c) => (c.city ?? '').toUpperCase().trim() === parsed.city);
    }
    if (parsed.state) {
        hits = hits.filter((c) => (c.state ?? '').toUpperCase().trim() === parsed.state);
    }

    const propertyIds = Array.from(new Set(hits.map((h) => h.propertyId)));
    if (propertyIds.length === 1) return { kind: 'matched', propertyId: propertyIds[0] };
    if (propertyIds.length === 0) return { kind: 'unmatched' };

    // Multiple distinct properties on the same normalized street — use zip as a tiebreaker if present.
    if (parsed.zip) {
        const zipHits = Array.from(
            new Set(
                hits
                    .filter((c) => (c.zipCode ?? '').slice(0, 5) === parsed.zip)
                    .map((c) => c.propertyId),
            ),
        );
        if (zipHits.length === 1) return { kind: 'matched', propertyId: zipHits[0] };
    }

    return { kind: 'ambiguous', propertyIds };
}

// ─── Candidate load + batch orchestration ──────────────────────────────────────────

/**
 * Load every stored address whose street number is in `streetNumbers` (one query for the whole
 * batch — the prefilter that keeps matching off a full table scan, and N+1-free).
 *
 * @param streetNumbers distinct leading street numbers parsed from the batch's complaints
 * @returns candidate property addresses to match against
 */
export async function loadCandidateAddresses(streetNumbers: string[]): Promise<CandidateAddress[]> {
    if (streetNumbers.length === 0) return [];
    return db
        .select({
            propertyId: addresses.propertyId,
            formattedStreetAddress: addresses.formattedStreetAddress,
            city: addresses.city,
            state: addresses.state,
            zipCode: addresses.zipCode,
            streetNumber: addresses.streetNumber,
        })
        .from(addresses)
        .where(inArray(addresses.streetNumber, streetNumbers));
}

/**
 * Match a whole batch of complaints to properties with a single candidate query.
 *
 * Parses each complaint, collects the distinct street numbers, loads all candidates at once, then
 * matches each complaint against the candidates sharing its street number. Keeps the per-complaint
 * work pure and the DB access to one round-trip (DB.NO-NPLUS1).
 *
 * @param violations the `pending` complaints to match
 * @returns each complaint paired with its parsed address and outcome
 */
export async function matchViolationBatch(violations: CvViolation[]): Promise<MatchedViolation[]> {
    const parsedList = violations.map((violation) => ({
        violation,
        parsed: parseCsvAddress(violation.rawAddress),
    }));

    const streetNumbers = Array.from(
        new Set(
            parsedList
                .map((p) => p.parsed.streetNumber)
                .filter((n): n is string => n !== null),
        ),
    );

    const candidates = await loadCandidateAddresses(streetNumbers);

    // Group candidates by street number, normalizing each stored address exactly once here rather than
    // re-normalizing it inside matchParsedAddress for every complaint that shares the number.
    const byNumber = new Map<string, MatchCandidate[]>();
    for (const candidate of candidates) {
        const key = (candidate.streetNumber ?? '').trim();
        if (!key) continue;
        const matchCandidate: MatchCandidate = {
            propertyId: candidate.propertyId,
            normalizedStreet: normalizeAddressForMatch(candidate.formattedStreetAddress),
            city: candidate.city,
            state: candidate.state,
            zipCode: candidate.zipCode,
        };
        const pool = byNumber.get(key);
        if (pool) pool.push(matchCandidate);
        else byNumber.set(key, [matchCandidate]);
    }

    return parsedList.map(({ violation, parsed }) => {
        const pool = parsed.streetNumber ? byNumber.get(parsed.streetNumber) ?? [] : [];
        return { violation, parsed, outcome: matchParsedAddress(parsed, pool) };
    });
}
