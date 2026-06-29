import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

const isProduction = process.env.NODE_ENV === 'production';

/** Non-secret Supabase Storage bucket names per environment. Bucket names are public,
 * so they live here as constants rather than env vars to keep new-device setup simple. */
const DEV_BUCKETS = {
    posts: 'post-images-dev',
    vendors: 'vendor-images-dev',
    users: 'user-images-dev',
    mastermind: 'mastermind-dev',
    streetview: 'streetview-dev',
} as const;

const PROD_BUCKETS = {
    posts: 'post-images-prod',
    vendors: 'vendor-images-prod',
    users: 'user-images-prod',
    mastermind: 'mastermind-prod',
    streetview: 'streetview-prod',
} as const;

const buckets = isProduction ? PROD_BUCKETS : DEV_BUCKETS;

export const storageBucket = buckets.posts;

export const vendorStorageBucket = buckets.vendors;

export const userStorageBucket = buckets.users;

export const mastermindStorageBucket = buckets.mastermind;

export const streetviewStorageBucket = buckets.streetview;

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
    if (_client) return _client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    _client = createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        realtime: { transport: ws as any },
    });
    return _client;
}

/** Public URL prefix every Mastermind attachment must start with, used to validate
 * client-supplied attachment URLs point at our own bucket. */
export function mastermindPublicUrlPrefix(): string {
    const url = process.env.SUPABASE_URL;
    if (!url) {
        throw new Error('SUPABASE_URL must be set');
    }
    return `${url}/storage/v1/object/public/${mastermindStorageBucket}/`;
}

/** Extract the storage path from a full Supabase public URL. */
export function storagePathFromUrl(
    imageUrl: string,
    bucket: string = storageBucket,
): string | null {
    const clean = imageUrl.split('?')[0];
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = clean.indexOf(marker);
    return idx !== -1 ? clean.slice(idx + marker.length) : null;
}
