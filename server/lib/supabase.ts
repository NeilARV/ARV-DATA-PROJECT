import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

export const storageBucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'post-images-dev';

export const vendorStorageBucket =
    process.env.SUPABASE_VENDOR_STORAGE_BUCKET ?? 'vendor-images-dev';

export const userStorageBucket = process.env.SUPABASE_USER_STORAGE_BUCKET ?? 'user-images-dev';

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
