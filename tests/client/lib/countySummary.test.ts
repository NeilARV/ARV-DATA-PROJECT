import { describe, it, expect } from 'vitest';
import { summarizeCountiesByMsa } from '@/lib/countySummary';

const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA';
const LA_MSA = 'Los Angeles-Long Beach-Anaheim, CA';
const DENVER_MSA = 'Denver-Aurora-Centennial, CO';

describe('summarizeCountiesByMsa', () => {
    it('renders "(all)" when every county of an MSA is selected', () => {
        expect(
            summarizeCountiesByMsa([
                { county: 'Los Angeles', msaName: LA_MSA },
                { county: 'Orange', msaName: LA_MSA },
            ]),
        ).toEqual(['Los Angeles (all)']);
    });

    it('renders the county names when only some counties of an MSA are selected', () => {
        expect(summarizeCountiesByMsa([{ county: 'Orange', msaName: LA_MSA }])).toEqual([
            'Los Angeles: Orange',
        ]);
    });

    it('a single-county MSA with its one county selected is "(all)"', () => {
        expect(summarizeCountiesByMsa([{ county: 'San Diego', msaName: SD_MSA }])).toEqual([
            'San Diego (all)',
        ]);
    });

    it('summarizes multiple MSAs in tracked order, one entry each', () => {
        expect(
            summarizeCountiesByMsa([
                { county: 'Adams', msaName: DENVER_MSA },
                { county: 'Denver', msaName: DENVER_MSA },
                { county: 'San Diego', msaName: SD_MSA },
            ]),
        ).toEqual(['San Diego (all)', 'Denver: Denver, Adams']);
    });

    it('returns an empty list for no counties', () => {
        expect(summarizeCountiesByMsa([])).toEqual([]);
    });
});
