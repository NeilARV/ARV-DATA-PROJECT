import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp } from '../../../helpers/setup';

// The map endpoints are public (no auth), so no seeded users are needed. Assertions are tolerant of
// an empty test DB — they pin the response contract (status + shape), not specific row data.

let app: Express;

beforeAll(() => {
    app = createTestApp();
});

// ── GET /api/properties/map — viewport pins + bounds validation ───────────────

describe('GET /api/properties/map (integration)', () => {
    it('returns 200 with an array when no viewport box is supplied', async () => {
        const res = await request(app).get('/api/properties/map');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 200 with an array when a complete numeric box is supplied', async () => {
        const res = await request(app)
            .get('/api/properties/map')
            .query({ south: 32.5, west: -117.3, north: 33.1, east: -116.9 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 400 when the box is only partially specified', async () => {
        const res = await request(app).get('/api/properties/map').query({ south: 32.5 });
        expect(res.status).toBe(400);
    });

    it('returns 400 when any box edge is non-numeric', async () => {
        const res = await request(app)
            .get('/api/properties/map')
            .query({ south: 'abc', west: -117.3, north: 33.1, east: -116.9 });
        expect(res.status).toBe(400);
    });
});

// ── GET /api/properties/map/extent — bounding box + count ─────────────────────

describe('GET /api/properties/map/extent (integration)', () => {
    it('returns 200 with null or a numeric extent object', async () => {
        const res = await request(app).get('/api/properties/map/extent');
        expect(res.status).toBe(200);
        if (res.body !== null) {
            expect(typeof res.body.minLat).toBe('number');
            expect(typeof res.body.maxLat).toBe('number');
            expect(typeof res.body.minLng).toBe('number');
            expect(typeof res.body.maxLng).toBe('number');
            expect(typeof res.body.count).toBe('number');
        }
    });
});

// ── GET /api/properties/map/regions — per-county counts ───────────────────────

describe('GET /api/properties/map/regions (integration)', () => {
    it('returns 200 with an array of { county, count } rows', async () => {
        const res = await request(app).get('/api/properties/map/regions');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        for (const row of res.body) {
            expect(typeof row.county).toBe('string');
            expect(typeof row.count).toBe('number');
        }
    });

    it('accepts repeated status params and a dateRange filter', async () => {
        const res = await request(app)
            .get('/api/properties/map/regions')
            .query({ status: ['on-market', 'sold'], dateRange: '90d' });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});
