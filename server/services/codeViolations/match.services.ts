import type { ParsedAddress } from './address.services';

// Tiered address matcher. The candidate set (our San Diego County addresses) is scoped
// and loaded once by the caller, indexed here, then each violation is matched in memory.
// First hit wins, so a violation resolves to AT MOST ONE property (which is why
// cv_violations carries a single direct property_id rather than a join table).

/** A property's address reduced to the fields the matcher needs. `canonicalStreet` must
 * be produced by address.services.streetKeyFromComponents so both sides align. */
export interface AddressCandidate {
    propertyId: string;
    streetNumber: string | null;
    canonicalStreet: string;
    city: string | null;
    zip: string | null;
}

export type MatchMethod = 'exact' | 'exact_no_zip' | 'fuzzy';

export interface AddressMatch {
    propertyId: string;
    method: MatchMethod;
    confidence: number;
}

export interface CandidateIndex {
    byNumberStreetZip: Map<string, AddressCandidate[]>;
    byNumberStreet: Map<string, AddressCandidate[]>;
    byNumber: Map<string, AddressCandidate[]>;
}

// Fuzzy matches at or above this Dice score are surfaced (held for review, never
// auto-sent). Below it we'd rather report "no match" than guess.
const FUZZY_THRESHOLD = 0.7;

function numberKey(streetNumber: string | null): string | null {
    const trimmed = streetNumber?.trim().toLowerCase();
    return trimmed && trimmed.length > 0 ? trimmed : null;
}

function zip5(zip: string | null): string | null {
    if (!zip) return null;
    const digits = zip.trim().slice(0, 5);
    return /^\d{5}$/.test(digits) ? digits : null;
}

function pushTo(map: Map<string, AddressCandidate[]>, key: string, value: AddressCandidate): void {
    const existing = map.get(key);
    if (existing) existing.push(value);
    else map.set(key, [value]);
}

function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}

// Sørensen–Dice coefficient over character bigrams — cheap, order-tolerant string
// similarity that handles minor spelling/abbreviation drift in street names.
function diceCoefficient(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bigrams = new Map<string, number>();
    for (let i = 0; i < a.length - 1; i++) {
        const bg = a.slice(i, i + 2);
        bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
    }
    let intersection = 0;
    for (let i = 0; i < b.length - 1; i++) {
        const bg = b.slice(i, i + 2);
        const count = bigrams.get(bg) ?? 0;
        if (count > 0) {
            bigrams.set(bg, count - 1);
            intersection++;
        }
    }
    return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

/** Index a scoped candidate set for repeated matching. Candidates missing a street
 * number or canonical street are skipped (they can't key anything). */
export function buildCandidateIndex(candidates: AddressCandidate[]): CandidateIndex {
    const index: CandidateIndex = {
        byNumberStreetZip: new Map(),
        byNumberStreet: new Map(),
        byNumber: new Map(),
    };

    for (const candidate of candidates) {
        const num = numberKey(candidate.streetNumber);
        if (!num || candidate.canonicalStreet.length === 0) continue;

        const nsKey = `${num}|${candidate.canonicalStreet}`;
        pushTo(index.byNumberStreet, nsKey, candidate);
        pushTo(index.byNumber, num, candidate);

        const z = zip5(candidate.zip);
        if (z) pushTo(index.byNumberStreetZip, `${nsKey}|${z}`, candidate);
    }

    return index;
}

/**
 * Match one parsed violation address against the indexed candidates.
 * Tier 1 (zip) → exact; Tier 2 (number+street, unambiguous, city tiebreak) → exact_no_zip;
 * Tier 3 (same number, street-name similarity ≥ threshold) → fuzzy. Returns null if no
 * tier hits.
 */
export function matchAddress(parsed: ParsedAddress, index: CandidateIndex): AddressMatch | null {
    const num = numberKey(parsed.streetNumber);
    const street = parsed.streetName;
    if (!num || !street) return null;

    // Tier 1 — exact with zip.
    const z = zip5(parsed.zip);
    if (z) {
        const hits = index.byNumberStreetZip.get(`${num}|${street}|${z}`);
        if (hits && hits.length > 0) {
            return { propertyId: hits[0].propertyId, method: 'exact', confidence: 1 };
        }
    }

    // Tier 2 — exact street, no/ mismatched zip. Accept only when unambiguous; if the same
    // number+street exists in several county cities, try the CSV city as a tiebreak, else
    // fall through (don't guess).
    const nsHits = index.byNumberStreet.get(`${num}|${street}`);
    if (nsHits && nsHits.length === 1) {
        return { propertyId: nsHits[0].propertyId, method: 'exact_no_zip', confidence: 0.9 };
    }
    if (nsHits && nsHits.length > 1 && parsed.city) {
        const cityNorm = parsed.city.trim().toLowerCase();
        const cityHits = nsHits.filter((c) => (c.city ?? '').trim().toLowerCase() === cityNorm);
        if (cityHits.length === 1) {
            return { propertyId: cityHits[0].propertyId, method: 'exact_no_zip', confidence: 0.85 };
        }
    }

    // Tier 3 — fuzzy on street name within the same street number.
    const numHits = index.byNumber.get(num);
    if (numHits && numHits.length > 0) {
        let best: { candidate: AddressCandidate; score: number } | null = null;
        for (const candidate of numHits) {
            const score = diceCoefficient(street, candidate.canonicalStreet);
            if (!best || score > best.score) best = { candidate, score };
        }
        if (best && best.score >= FUZZY_THRESHOLD) {
            return {
                propertyId: best.candidate.propertyId,
                method: 'fuzzy',
                confidence: round3(best.score),
            };
        }
    }

    return null;
}
