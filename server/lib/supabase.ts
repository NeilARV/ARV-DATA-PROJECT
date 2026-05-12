import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const storageBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "post-images-dev";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
    if (_client) return _client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    _client = createClient(url, key);
    return _client;
}

/** Extract the storage path from a full Supabase public URL. */
export function storagePathFromUrl(imageUrl: string): string | null {
    const marker = `/storage/v1/object/public/${storageBucket}/`;
    const idx = imageUrl.indexOf(marker);
    return idx !== -1 ? imageUrl.slice(idx + marker.length) : null;
}
