import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

/**
 * Normalize Neon API response so processQueryResult never sees null .rows or .fields
 * (avoids "Cannot read properties of null (reading 'map')" on Replit/serverless).
 */
function normalizeNeonResponse(body: unknown): unknown {
    if (body == null || typeof body !== "object") return body;
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.results)) {
        obj.results = obj.results.map((r: unknown) => normalizeSingleResult(r));
        return obj;
    }
    return normalizeSingleResult(obj);
}

function normalizeSingleResult(r: unknown): Record<string, unknown> {
    if (r == null || typeof r !== "object") return { fields: [], rows: [] };
    const row = r as Record<string, unknown>;
    return {
        ...row,
        fields: Array.isArray(row.fields) ? row.fields : [],
        rows: Array.isArray(row.rows) ? row.rows : [],
    };
}

async function fetchWithNormalizedNeonResponse(
    url: RequestInfo | URL,
    init?: RequestInit
): Promise<Response> {
    const res = await fetch(url, init);
    if (!res.ok) return res;
    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return res;
    }
    const normalized = normalizeNeonResponse(data);
    return new Response(JSON.stringify(normalized), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
    });
}

const sql = neon(process.env.DATABASE_URL!, {
    fetchFunction: fetchWithNormalizedNeonResponse,
});
export const db = drizzle(sql);