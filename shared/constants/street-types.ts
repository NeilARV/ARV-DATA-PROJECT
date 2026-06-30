// Canonical street-suffix abbreviations, keyed by every lowercase variant we've seen.
// Two consumers, one source of truth:
//   1. formatAddress() — title-cases a street and standardizes its *trailing* suffix for display.
//   2. normalizeAddressForMatch() — uppercases the canonical form of *every* token for the
//      code-violation address matcher (shared/utils/formatAddress.ts).
// Values are stored Title-Case for display; the matcher uppercases them. Keep variants pointing at
// ONE canonical token per real suffix so both directions collapse (AV/AV./AVE/AVENUE → "Ave").
export const STREET_TYPE_ABBREVIATIONS: Record<string, string> = {
    avenue: 'Ave',
    av: 'Ave',
    ave: 'Ave',
    avn: 'Ave',
    avnue: 'Ave',
    boulevard: 'Blvd',
    blvd: 'Blvd',
    boul: 'Blvd',
    boulv: 'Blvd',
    circle: 'Cir',
    cir: 'Cir',
    circ: 'Cir',
    crcl: 'Cir',
    court: 'Ct',
    ct: 'Ct',
    crt: 'Ct',
    crossing: 'Xing',
    xing: 'Xing',
    drive: 'Dr',
    dr: 'Dr',
    drv: 'Dr',
    highway: 'Hwy',
    hwy: 'Hwy',
    lane: 'Ln',
    ln: 'Ln',
    loop: 'Loop',
    manor: 'Mnr',
    mnr: 'Mnr',
    parkway: 'Pkwy',
    pkwy: 'Pkwy',
    parkwy: 'Pkwy',
    pass: 'Pass',
    path: 'Path',
    place: 'Pl',
    pl: 'Pl',
    // NOTE: PLZ is Plaza, not Place — the previous `plz: 'Pl'` conflated two distinct suffixes,
    // which would let "X Plaza" falsely match "X Place". Plaza now collapses to its own token.
    plaza: 'Plaza',
    plz: 'Plaza',
    point: 'Pt',
    pt: 'Pt',
    road: 'Rd',
    rd: 'Rd',
    row: 'Row',
    square: 'Sq',
    sq: 'Sq',
    street: 'St',
    st: 'St',
    str: 'St',
    strt: 'St',
    suite: 'Ste',
    ste: 'Ste',
    terrace: 'Ter',
    ter: 'Ter',
    terr: 'Ter',
    trail: 'Trl',
    trl: 'Trl',
    unit: 'Unit',
    walk: 'Walk',
    way: 'Way',
    wy: 'Way',
};

// Compass directionals, keyed by every lowercase variant. Used only by the matcher (not display).
// The matcher canonicalizes the SPELLING (NORTH → N) wherever a directional sits, but preserves its
// POSITION: a leading pre-directional and a trailing post-directional are kept distinct (N MAIN ST is
// not merged with MAIN ST N), matching how the stored `addresses` table separates `streetPreDirection`
// from `streetPostDirection`. The matcher also only treats a token as a directional when a street-name
// token still sits beside it, so a lettered street whose name IS a single letter (E ST, N ST) is left
// alone instead of colliding with EAST ST / NORTH ST. Values are already uppercase canonical.
export const DIRECTIONAL_ABBREVIATIONS: Record<string, string> = {
    north: 'N',
    n: 'N',
    south: 'S',
    s: 'S',
    east: 'E',
    e: 'E',
    west: 'W',
    w: 'W',
    northeast: 'NE',
    ne: 'NE',
    northwest: 'NW',
    nw: 'NW',
    southeast: 'SE',
    se: 'SE',
    southwest: 'SW',
    sw: 'SW',
};

// Spelled-out ordinals → numeric ordinal form, so "First St" ≡ "1st St" after normalization.
// Numeric ordinals (43RD) already canonicalize to themselves; this only rewrites the word form.
export const ORDINAL_WORDS: Record<string, string> = {
    first: '1ST',
    second: '2ND',
    third: '3RD',
    fourth: '4TH',
    fifth: '5TH',
    sixth: '6TH',
    seventh: '7TH',
    eighth: '8TH',
    ninth: '9TH',
    tenth: '10TH',
    eleventh: '11TH',
    twelfth: '12TH',
    thirteenth: '13TH',
    fourteenth: '14TH',
    fifteenth: '15TH',
    sixteenth: '16TH',
    seventeenth: '17TH',
    eighteenth: '18TH',
    nineteenth: '19TH',
    twentieth: '20TH',
};

// Unit/secondary-address designators. The matcher drops the designator AND its following value
// (APT 4, UNIT B, STE 200) so a unit present on one side but not the other can't block a street
// match — the Accela export rarely carries units, but our stored addresses sometimes do.
// The drop is value-gated: a designator is only removed when the next token actually looks like a
// unit value, so a designator word that is part of a street name (SPACE in SPACE PARK WAY, ROOM in
// SCHOOL ROOM RD) is left intact. This also defuses the `FL` (floor) / Florida collision — a trailing
// state `FL` has no unit value after it, so it is never dropped.
export const UNIT_DESIGNATORS: ReadonlySet<string> = new Set([
    'APT',
    'UNIT',
    'STE',
    'SUITE',
    'RM',
    'ROOM',
    'FL',
    'FLOOR',
    'BLDG',
    'BUILDING',
    'DEPT',
    'TRLR',
    'LOT',
    'SPACE',
    'SPC',
]);
