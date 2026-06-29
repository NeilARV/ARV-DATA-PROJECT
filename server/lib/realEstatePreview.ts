// Synthetic link previews for real-estate listing sites (Redfin, Zillow). These sites bot-block
// metadata scrapers — Redfin returns 405 to Microlink — so the provider never yields a usable
// og: card. Instead we derive a basic card straight from the listing URL, whose path encodes the
// street/city/state/zip. No network call happens, and for these domains Microlink is skipped
// entirely (see linkPreviews.services): both to avoid the guaranteed-junk result and to spare the
// provider quota.

import type { LinkMetadata } from 'server/lib/microlink';

// Street-type tokens used to split Zillow's single address slug into street vs. city, since Zillow
// (unlike Redfin) merges them with no delimiter. The split is taken at the LAST such token.
const STREET_SUFFIXES = new Set([
    'ave',
    'avenue',
    'st',
    'street',
    'rd',
    'road',
    'dr',
    'drive',
    'blvd',
    'boulevard',
    'ln',
    'lane',
    'ct',
    'court',
    'way',
    'pl',
    'place',
    'cir',
    'circle',
    'ter',
    'terrace',
    'pkwy',
    'parkway',
    'hwy',
    'highway',
    'trl',
    'trail',
    'loop',
    'run',
    'row',
    'sq',
    'square',
    'cv',
    'cove',
    'pt',
    'point',
    'xing',
    'crossing',
    'aly',
    'alley',
    'walk',
    'path',
]);

interface ParsedListing {
    street: string;
    city: string;
    state: string;
    zip: string;
}

// Host matcher that accepts the bare apex and any subdomain (www., m., etc.) but not a domain that
// merely ends with the string (e.g. "notredfin.com").
function hostMatches(host: string, domain: string): boolean {
    return host === domain || host.endsWith(`.${domain}`);
}

// True for any URL on a real-estate domain we handle ourselves. The caller uses this to decide
// whether to skip Microlink — note it is true even for non-listing pages on these domains, where
// buildRealEstatePreview returns null and the link simply gets no card.
export function isRealEstateUrl(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return hostMatches(host, 'redfin.com') || hostMatches(host, 'zillow.com');
    } catch {
        return false;
    }
}

// Pops a trailing 5-digit ZIP off the token list, mutating it, and returns the ZIP (or '').
function takeZip(tokens: string[]): string {
    if (/^\d{5}$/.test(tokens[tokens.length - 1] ?? '')) return tokens.pop()!;
    return '';
}

// /CA/San-Diego/7079-Enders-Ave-92122/home/4898288 → state / city / (street + zip) / home / id.
// Unit listings add a segment before "home": .../801-Ash-St-92101/unit-1401/home/12163211. State,
// city, and the street segment are each their own path part, so parsing is unambiguous.
function parseRedfin(u: URL): ParsedListing | null {
    const segs = u.pathname.split('/').filter(Boolean);
    // The listing shape is state/city/address[/unit]/home/id; the address is always at index 2 and
    // "home" at index 3 or 4. Anything else (city pages, building pages, search) gets no card.
    const homeIdx = segs.indexOf('home');
    if (homeIdx !== 3 && homeIdx !== 4) return null;
    if (!/^[A-Za-z]{2}$/.test(segs[0])) return null;

    const state = segs[0].toUpperCase();
    const city = segs[1].replace(/-/g, ' ').trim();
    const addrTokens = segs[2].split('-');
    const zip = takeZip(addrTokens);
    let street = addrTokens.join(' ').trim();
    if (!street) return null;

    // Segments between the address and "home" are unit designators (e.g. "unit-1401"); the URL
    // lower-cases them, so title-case to match Redfin's already-cased street tokens.
    const unit = segs
        .slice(3, homeIdx)
        .map((seg) => seg.replace(/-/g, ' '))
        .join(' ')
        .replace(/\b[a-z]/g, (c) => c.toUpperCase())
        .trim();
    if (unit) street = `${street} ${unit}`;

    return { street, city, state, zip };
}

// /homedetails/7079-Enders-Ave-San-Diego-CA-92122/16767246_zpid → one slug holding everything.
// ZIP and state pop cleanly off the end; street vs. city is split at the last street-type token,
// which handles the common cases and fails soft (city empty) when no suffix is present.
function parseZillow(u: URL): ParsedListing | null {
    const segs = u.pathname.split('/').filter(Boolean);
    const idx = segs.indexOf('homedetails');
    if (idx === -1) return null;
    const slug = segs[idx + 1];
    if (!slug) return null;

    const tokens = slug.split('-');
    const zip = takeZip(tokens);
    let state = '';
    const lastToken = tokens[tokens.length - 1] ?? '';
    if (/^[A-Za-z]{2}$/.test(lastToken)) {
        state = lastToken.toUpperCase();
        tokens.pop();
    }

    let cut = -1;
    tokens.forEach((token, i) => {
        if (STREET_SUFFIXES.has(token.toLowerCase())) cut = i;
    });

    let street: string;
    let city: string;
    if (cut >= 0 && cut < tokens.length - 1) {
        street = tokens.slice(0, cut + 1).join(' ');
        city = tokens.slice(cut + 1).join(' ');
    } else {
        street = tokens.join(' ');
        city = '';
    }
    street = street.trim();
    if (!street) return null;

    return { street, city: city.trim(), state, zip };
}

// Builds the card body: street is the title, "City, ST 12345" the description (gaps drop out).
function toMetadata(parsed: ParsedListing, publisher: string): LinkMetadata {
    const stateZip = [parsed.state, parsed.zip].filter(Boolean).join(' ');
    const description = [parsed.city, stateZip].filter(Boolean).join(', ');
    return {
        title: parsed.street,
        description: description || null,
        image: null,
        logo: null,
        publisher,
    };
}

// Returns synthetic metadata for a Redfin/Zillow listing URL, or null when the URL is on one of
// those domains but isn't a parseable single listing (callers still skip Microlink — see
// isRealEstateUrl). Returns null for any other domain.
export function buildRealEstatePreview(url: string): LinkMetadata | null {
    let u: URL;
    try {
        u = new URL(url);
    } catch {
        return null;
    }

    const host = u.hostname.toLowerCase();
    if (hostMatches(host, 'redfin.com')) {
        const parsed = parseRedfin(u);
        return parsed ? toMetadata(parsed, 'Redfin') : null;
    }
    if (hostMatches(host, 'zillow.com')) {
        const parsed = parseZillow(u);
        return parsed ? toMetadata(parsed, 'Zillow') : null;
    }
    return null;
}
