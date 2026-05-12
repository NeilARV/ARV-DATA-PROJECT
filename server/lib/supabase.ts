import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
export const storageBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "post-images-dev";

/** Extract the storage path from a full Supabase public URL. */
export function storagePathFromUrl(imageUrl: string): string | null {
    const marker = `/storage/v1/object/public/${storageBucket}/`;
    const idx = imageUrl.indexOf(marker);
    return idx !== -1 ? imageUrl.slice(idx + marker.length) : null;
}
