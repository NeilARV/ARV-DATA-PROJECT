/**
 * Throwaway coverage probe: parse a real Accela CSV, match every row against our San
 * Diego County addresses, and print how many resolve at each tier. Answers "is the match
 * coverage worth it?" on real data before any UI or notifications exist. Read-only.
 *
 * Usage:
 *   npx tsx scripts/code-violation-coverage.ts [path-to-csv]   (defaults to tmp.csv)
 */
import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { db } from '../server/storage';
import { addresses, properties } from '@database/schemas/properties.schema';
import { parseCsv } from '../server/services/codeViolations/parse.services';
import { parseAddress, streetKeyFromComponents } from '../server/services/codeViolations/address.services';
import {
    buildCandidateIndex,
    matchAddress,
    type AddressCandidate,
    type MatchMethod,
} from '../server/services/codeViolations/match.services';

async function main(): Promise<void> {
    const csvPath = process.argv[2] ?? 'tmp.csv';
    const rawCsv = readFileSync(csvPath, 'utf8');
    const rows = parseCsv(rawCsv);

    const candidateRows = await db
        .select({
            propertyId: addresses.propertyId,
            streetNumber: addresses.streetNumber,
            streetPreDirection: addresses.streetPreDirection,
            streetName: addresses.streetName,
            streetSuffix: addresses.streetSuffix,
            streetPostDirection: addresses.streetPostDirection,
            city: addresses.city,
            zip: addresses.zipCode,
        })
        .from(addresses)
        .innerJoin(properties, eq(properties.id, addresses.propertyId))
        // County lives on properties (addresses.county is unpopulated); scope there.
        .where(sql`lower(trim(${properties.county})) = 'san diego'`);

    const candidates: AddressCandidate[] = candidateRows.map((r) => ({
        propertyId: r.propertyId,
        streetNumber: r.streetNumber,
        canonicalStreet: streetKeyFromComponents(r),
        city: r.city,
        zip: r.zip,
    }));
    const candidateById = new Map(candidateRows.map((r) => [r.propertyId, r]));
    const index = buildCandidateIndex(candidates);

    const tally: Record<MatchMethod | 'none', number> = {
        exact: 0,
        exact_no_zip: 0,
        fuzzy: 0,
        none: 0,
    };
    const examples: string[] = [];

    for (const row of rows) {
        const parsed = parseAddress(row.rawAddress);
        const match = matchAddress(parsed, index);
        tally[match?.method ?? 'none']++;

        if (match && examples.length < 15) {
            const c = candidateById.get(match.propertyId);
            examples.push(
                `  [${match.method}/${match.confidence}] "${row.rawAddress}"  →  ` +
                    `${c?.streetNumber ?? '?'} ${streetKeyFromComponents(c ?? {})} ` +
                    `${c?.city ?? ''} ${c?.zip ?? ''}`.trim(),
            );
        }
    }

    const total = rows.length;
    const matched = total - tally.none;
    const pct = (n: number): string => (total === 0 ? '0' : ((n / total) * 100).toFixed(1));

    console.log(`\n── Code-violation match coverage (${csvPath}) ──`);
    console.log(`CSV rows (usable)      : ${total}`);
    console.log(`SD County candidates    : ${candidates.length}`);
    console.log(`\nMatched                 : ${matched} (${pct(matched)}%)`);
    console.log(`  exact (zip)           : ${tally.exact} (${pct(tally.exact)}%)`);
    console.log(`  exact_no_zip          : ${tally.exact_no_zip} (${pct(tally.exact_no_zip)}%)`);
    console.log(`  fuzzy (review)        : ${tally.fuzzy} (${pct(tally.fuzzy)}%)`);
    console.log(`Unmatched               : ${tally.none} (${pct(tally.none)}%)`);

    if (examples.length > 0) {
        console.log(`\nSample matches:`);
        console.log(examples.join('\n'));
    }
    console.log('');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[code-violation-coverage] Failed:', err);
        process.exit(1);
    });
