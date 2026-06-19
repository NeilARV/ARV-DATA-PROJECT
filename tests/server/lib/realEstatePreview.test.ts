import { describe, it, expect } from 'vitest';
import {
    isRealEstateUrl,
    buildRealEstatePreview,
} from '../../../server/lib/realEstatePreview';

describe('isRealEstateUrl', () => {
    it('matches Redfin and Zillow apex and subdomains', () => {
        expect(isRealEstateUrl('https://www.redfin.com/CA/San-Diego/x/home/1')).toBe(true);
        expect(isRealEstateUrl('https://redfin.com/anything')).toBe(true);
        expect(isRealEstateUrl('https://www.zillow.com/homedetails/x/1_zpid/')).toBe(true);
        expect(isRealEstateUrl('https://m.zillow.com/x')).toBe(true);
    });

    it('does not match look-alike or unrelated domains', () => {
        expect(isRealEstateUrl('https://notredfin.com/x')).toBe(false);
        expect(isRealEstateUrl('https://example.com/redfin.com')).toBe(false);
        expect(isRealEstateUrl('https://www.realtor.com/x')).toBe(false);
        expect(isRealEstateUrl('not a url')).toBe(false);
    });
});

describe('buildRealEstatePreview — Redfin', () => {
    it('parses a standard single-family listing', () => {
        const meta = buildRealEstatePreview(
            'https://www.redfin.com/CA/San-Diego/7079-Enders-Ave-92122/home/4898288',
        );
        expect(meta).toEqual({
            title: '7079 Enders Ave',
            description: 'San Diego, CA 92122',
            image: null,
            logo: null,
            publisher: 'Redfin',
        });
    });

    it('keeps unit designators in the street and de-slugs multi-word cities', () => {
        const meta = buildRealEstatePreview(
            'https://www.redfin.com/CA/San-Diego/123-Main-St-Unit-4-92101/home/55512345',
        );
        expect(meta?.title).toBe('123 Main St Unit 4');
        expect(meta?.description).toBe('San Diego, CA 92101');
    });

    it('folds a separate unit segment into the street, title-cased', () => {
        const meta = buildRealEstatePreview(
            'https://www.redfin.com/CA/San-Diego/801-Ash-St-92101/unit-1401/home/12163211',
        );
        expect(meta?.title).toBe('801 Ash St Unit 1401');
        expect(meta?.description).toBe('San Diego, CA 92101');
    });

    it('handles a listing with no trailing ZIP segment', () => {
        const meta = buildRealEstatePreview(
            'https://www.redfin.com/TX/Austin/100-Congress-Ave/home/12345',
        );
        expect(meta?.title).toBe('100 Congress Ave');
        expect(meta?.description).toBe('Austin, TX');
    });

    it('returns null for non-listing Redfin pages', () => {
        expect(buildRealEstatePreview('https://www.redfin.com/city/30772/CA/San-Diego')).toBeNull();
        expect(buildRealEstatePreview('https://www.redfin.com/')).toBeNull();
    });
});

describe('buildRealEstatePreview — Zillow', () => {
    it('splits street from a single-word city at the street suffix', () => {
        const meta = buildRealEstatePreview(
            'https://www.zillow.com/homedetails/7079-Enders-Ave-San-Diego-CA-92122/16767246_zpid/',
        );
        expect(meta).toEqual({
            title: '7079 Enders Ave',
            description: 'San Diego, CA 92122',
            image: null,
            logo: null,
            publisher: 'Zillow',
        });
    });

    it('splits street from a multi-word city', () => {
        const meta = buildRealEstatePreview(
            'https://www.zillow.com/homedetails/24-Foxhollow-Dr-Lake-Forest-CA-92630/25612345_zpid/',
        );
        expect(meta?.title).toBe('24 Foxhollow Dr');
        expect(meta?.description).toBe('Lake Forest, CA 92630');
    });

    it('fails soft (city empty) when the street has no recognizable suffix', () => {
        const meta = buildRealEstatePreview(
            'https://www.zillow.com/homedetails/100-Broadway-New-York-NY-10005/12345_zpid/',
        );
        expect(meta?.title).toBe('100 Broadway New York');
        expect(meta?.description).toBe('NY 10005');
    });

    it('returns null for non-homedetails Zillow pages', () => {
        expect(
            buildRealEstatePreview('https://www.zillow.com/homes/for_sale/San-Diego-CA/'),
        ).toBeNull();
        expect(buildRealEstatePreview('https://www.zillow.com/san-diego-ca/')).toBeNull();
    });
});

describe('buildRealEstatePreview — other domains', () => {
    it('returns null so the caller falls back to the metadata provider', () => {
        expect(buildRealEstatePreview('https://www.realtor.com/x')).toBeNull();
        expect(buildRealEstatePreview('https://example.com/anything')).toBeNull();
    });
});
