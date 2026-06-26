// Address normalization shared by BOTH sides of the match: the messy CSV address
// STRING (parseAddress) and our stored address COMPONENTS (streetKeyFromComponents).
// Keeping one canonicalizer here is what makes the two comparable — change it once and
// both sides move together. Intentionally separate from server/utils/normalization.ts
// (which only abbreviates the last word and feeds the SFR pipeline).

/** Canonical street tokens — maps suffix + direction synonyms to one form per concept.
 * More complete than the shared SFR map (adds `bl`, directions) so "Foothill Bl" and
 * "Foothill Blvd" collapse to the same key. */
const STREET_TOKEN_MAP: Record<string, string> = {
    // suffixes
    street: 'st',
    st: 'st',
    str: 'st',
    avenue: 'ave',
    ave: 'ave',
    av: 'ave',
    boulevard: 'blvd',
    blvd: 'blvd',
    bl: 'blvd',
    drive: 'dr',
    dr: 'dr',
    lane: 'ln',
    ln: 'ln',
    place: 'pl',
    pl: 'pl',
    court: 'ct',
    ct: 'ct',
    road: 'rd',
    rd: 'rd',
    circle: 'cir',
    cir: 'cir',
    parkway: 'pkwy',
    pkwy: 'pkwy',
    terrace: 'ter',
    ter: 'ter',
    point: 'pt',
    pt: 'pt',
    plaza: 'plz',
    plz: 'plz',
    square: 'sq',
    sq: 'sq',
    trail: 'trl',
    trl: 'trl',
    highway: 'hwy',
    hwy: 'hwy',
    way: 'way',
    wy: 'way',
    row: 'row',
    walk: 'walk',
    loop: 'loop',
    path: 'path',
    // directions
    north: 'n',
    n: 'n',
    south: 's',
    s: 's',
    east: 'e',
    e: 'e',
    west: 'w',
    w: 'w',
    northeast: 'ne',
    ne: 'ne',
    northwest: 'nw',
    nw: 'nw',
    southeast: 'se',
    se: 'se',
    southwest: 'sw',
    sw: 'sw',
};

// Word ordinals → numeric ("Second" → "2nd") so they align with the CSV's "02nd".
const WORD_ORDINALS: Record<string, string> = {
    first: '1st',
    second: '2nd',
    third: '3rd',
    fourth: '4th',
    fifth: '5th',
    sixth: '6th',
    seventh: '7th',
    eighth: '8th',
    ninth: '9th',
    tenth: '10th',
};

function normalizeToken(token: string): string {
    // Numeric ordinal: strip leading zeros ("02nd" → "2nd", "06th" → "6th").
    const ordinal = token.match(/^0*(\d+)(st|nd|rd|th)$/);
    if (ordinal) return `${ordinal[1]}${ordinal[2]}`;
    if (WORD_ORDINALS[token]) return WORD_ORDINALS[token];
    if (STREET_TOKEN_MAP[token]) return STREET_TOKEN_MAP[token];
    return token;
}

/**
 * Reduce a street string to a canonical, space-joined token sequence for matching.
 * Lowercases, strips parenthetical noise ("(Sb)"), drops punctuation, then canonicalizes
 * each token (suffix/direction synonyms + ordinals). Returns '' for empty input.
 */
export function normalizeStreetForMatch(input: string | null | undefined): string {
    if (!input) return '';
    const cleaned = input
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ') // strip "(sb)" style noise
        .replace(/[^a-z0-9\s]/g, ' ') // drop punctuation (periods, #, etc.)
        .replace(/\s+/g, ' ')
        .trim();
    if (cleaned.length === 0) return '';
    return cleaned.split(' ').map(normalizeToken).join(' ');
}

/** Build the canonical street key from our stored address components. */
export function streetKeyFromComponents(parts: {
    streetPreDirection?: string | null;
    streetName?: string | null;
    streetSuffix?: string | null;
    streetPostDirection?: string | null;
}): string {
    return normalizeStreetForMatch(
        [parts.streetPreDirection, parts.streetName, parts.streetSuffix, parts.streetPostDirection]
            .filter((p) => p != null && p.trim().length > 0)
            .join(' '),
    );
}

/** Components extracted from a raw CSV address string. `streetName` is canonicalized. */
export interface ParsedAddress {
    streetNumber: string | null;
    streetName: string | null;
    unit: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    normalized: string | null;
}

const EMPTY_ADDRESS: ParsedAddress = {
    streetNumber: null,
    streetName: null,
    unit: null,
    city: null,
    state: null,
    zip: null,
    normalized: null,
};

/**
 * Parse a raw Accela address string into components.
 * Handles: a trailing " United States", a "City ST ZIP" (or "City ST") tail, an optional
 * middle unit segment ("Apt 101"), and a bare trailing unit ("299 16th St, 109").
 * The returned `streetName` is canonicalized via normalizeStreetForMatch so it can key
 * directly against streetKeyFromComponents. `unit` is parsed for storage but is NOT part
 * of the match key.
 */
export function parseAddress(rawAddress: string | null | undefined): ParsedAddress {
    if (!rawAddress || rawAddress.trim().length === 0) return { ...EMPTY_ADDRESS };

    const withoutCountry = rawAddress
        .trim()
        .replace(/[\s,]*united states\.?\s*$/i, '')
        .trim();

    const segments = withoutCountry
        .split(',')
        .map((seg) => seg.trim())
        .filter((seg) => seg.length > 0);
    if (segments.length === 0) return { ...EMPTY_ADDRESS };

    // The last segment is "City ST" / "City ST ZIP" only if it has something before a
    // trailing 2-letter state — and only when there's a street segment ahead of it (so a
    // bare "892 27th St" alone, or "…, 109", is never mistaken for a locality).
    let city: string | null = null;
    let state: string | null = null;
    let zip: string | null = null;
    let streetSegEnd = segments.length;

    if (segments.length >= 2) {
        const locality = segments[segments.length - 1].match(
            /^(.+?)\s+([A-Za-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?$/,
        );
        if (locality) {
            city = locality[1].trim() || null;
            state = locality[2].toUpperCase();
            zip = locality[3] ?? null;
            streetSegEnd = segments.length - 1;
        }
    }

    const streetSegment = segments[0] ?? '';
    const unitSegments = segments.slice(1, streetSegEnd);

    let streetNumber: string | null = null;
    let streetRest = streetSegment;
    const numMatch = streetSegment.match(/^(\d+[a-z]?)\s+(.*)$/i);
    if (numMatch) {
        streetNumber = numMatch[1];
        streetRest = numMatch[2];
    }

    const streetName = normalizeStreetForMatch(streetRest) || null;
    const unit = unitSegments.length > 0 ? unitSegments.join(' ').trim() : null;
    const normalized = [streetNumber, streetName].filter(Boolean).join(' ') || null;

    return { streetNumber, streetName, unit, city, state, zip, normalized };
}
