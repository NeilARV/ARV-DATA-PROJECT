import crypto from "crypto";
import { db } from "server/storage";
import { vendors, vendorCategories, categories } from "@database/schemas/vendors.schema";
import { eq, inArray } from "drizzle-orm";
import type { VendorInput, UpdateVendorInput } from "@database/validation/vendors.validation";
import { getSupabase, vendorStorageBucket, storagePathFromUrl } from "server/lib/supabase";

async function fetchCategoriesForVendors(vendorIds: string[]) {
    if (vendorIds.length === 0) return new Map<string, { id: number; name: string; slug: string; iconName: string }[]>();

    const rows = await db
        .select({
            vendorId: vendorCategories.vendorId,
            categoryId: categories.id,
            name: categories.name,
            slug: categories.slug,
            iconName: categories.iconName,
        })
        .from(vendorCategories)
        .innerJoin(categories, eq(categories.id, vendorCategories.categoryId))
        .where(inArray(vendorCategories.vendorId, vendorIds));

    const map = new Map<string, { id: number; name: string; slug: string; iconName: string }[]>();
    for (const row of rows) {
        if (!map.has(row.vendorId)) map.set(row.vendorId, []);
        map.get(row.vendorId)!.push({ id: row.categoryId, name: row.name, slug: row.slug, iconName: row.iconName });
    }
    return map;
}

const VENDOR_COLUMNS = {
    id: vendors.id,
    name: vendors.name,
    description: vendors.description,
    address: vendors.address,
    city: vendors.city,
    state: vendors.state,
    zipCode: vendors.zipCode,
    phone: vendors.phone,
    website: vendors.website,
    logoUrl: vendors.logoUrl,
    headerUrl: vendors.headerUrl,
    isRecommended: vendors.isRecommended,
};

export async function getAll(categoryIds?: number[]) {
    let rows;

    if (categoryIds && categoryIds.length > 0) {
        const raw = await db
            .select(VENDOR_COLUMNS)
            .from(vendors)
            .innerJoin(vendorCategories, eq(vendorCategories.vendorId, vendors.id))
            .where(inArray(vendorCategories.categoryId, categoryIds))
            .orderBy(vendors.name);
        // A vendor belonging to multiple matching categories appears once per match — deduplicate
        const seen = new Set<string>();
        rows = raw.filter((v) => { if (seen.has(v.id)) return false; seen.add(v.id); return true; });
    } else {
        rows = await db.select(VENDOR_COLUMNS).from(vendors).orderBy(vendors.name);
    }

    if (rows.length === 0) return [];

    const categoryMap = await fetchCategoriesForVendors(rows.map((v) => v.id));
    return rows.map((vendor) => ({
        ...vendor,
        categories: categoryMap.get(vendor.id) ?? [],
    }));
}

export async function getById(id: string) {
    const rows = await db
        .select({
            id: vendors.id,
            name: vendors.name,
            description: vendors.description,
            address: vendors.address,
            city: vendors.city,
            state: vendors.state,
            zipCode: vendors.zipCode,
            phone: vendors.phone,
            website: vendors.website,
            logoUrl: vendors.logoUrl,
            headerUrl: vendors.headerUrl,
        })
        .from(vendors)
        .where(eq(vendors.id, id))
        .limit(1);

    if (rows.length === 0) return null;

    const categoryMap = await fetchCategoriesForVendors([rows[0].id]);
    return {
        ...rows[0],
        categories: categoryMap.get(rows[0].id) ?? [],
    };
}

// ── Create vendor ──────────────────────────────────────────────────────────────

export async function create(input: VendorInput) {
    const { categoryIds, ...fields } = input;

    const [vendor] = await db
        .insert(vendors)
        .values({
            name:        fields.name.trim(),
            description: fields.description?.trim() || null,
            address:     fields.address?.trim()     || null,
            city:        fields.city?.trim()         || null,
            state:       fields.state?.trim().toUpperCase() || null,
            zipCode:     fields.zipCode?.trim()      || null,
            phone:       fields.phone?.trim()        || null,
            website:     fields.website?.trim()      || null,
        })
        .returning();

    await db.insert(vendorCategories).values(
        categoryIds.map((categoryId) => ({ vendorId: vendor.id, categoryId }))
    );

    const categoryMap = await fetchCategoriesForVendors([vendor.id]);
    console.log(`[vendorsService.create] Vendor created: id=${vendor.id}`);
    return { ...vendor, categories: categoryMap.get(vendor.id) ?? [] };
}

// ── Update vendor ──────────────────────────────────────────────────────────────

export async function update(id: string, input: UpdateVendorInput) {
    const { categoryIds, ...fields } = input;

    const [existing] = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(eq(vendors.id, id))
        .limit(1);

    if (!existing) throw Object.assign(new Error("Vendor not found"), { statusCode: 404 });

    const [updated] = await db
        .update(vendors)
        .set({
            updatedAt: new Date(),
            ...(fields.name        !== undefined ? { name:        fields.name.trim() }                       : {}),
            ...(fields.description !== undefined ? { description: fields.description?.trim() || null }       : {}),
            ...(fields.address     !== undefined ? { address:     fields.address?.trim()     || null }       : {}),
            ...(fields.city        !== undefined ? { city:        fields.city?.trim()         || null }       : {}),
            ...(fields.state       !== undefined ? { state:       fields.state?.trim().toUpperCase() || null }: {}),
            ...(fields.zipCode     !== undefined ? { zipCode:     fields.zipCode?.trim()      || null }       : {}),
            ...(fields.phone       !== undefined ? { phone:       fields.phone?.trim()        || null }       : {}),
            ...(fields.website     !== undefined ? { website:     fields.website?.trim()      || null }       : {}),
        })
        .where(eq(vendors.id, id))
        .returning();

    await db.delete(vendorCategories).where(eq(vendorCategories.vendorId, id));
    await db.insert(vendorCategories).values(
        categoryIds.map((categoryId) => ({ vendorId: id, categoryId }))
    );

    const categoryMap = await fetchCategoriesForVendors([updated.id]);
    console.log(`[vendorsService.update] Vendor updated: id=${id}`);
    return { ...updated, categories: categoryMap.get(updated.id) ?? [] };
}

// ── Recommended vendors ────────────────────────────────────────────────────────

export async function getRecommended() {
    const rows = await db
        .select(VENDOR_COLUMNS)
        .from(vendors)
        .where(eq(vendors.isRecommended, true))
        .orderBy(vendors.name);

    if (rows.length === 0) return [];

    const categoryMap = await fetchCategoriesForVendors(rows.map((v) => v.id));
    return rows.map((vendor) => ({
        ...vendor,
        categories: categoryMap.get(vendor.id) ?? [],
    }));
}

export async function toggleRecommend(id: string) {
    const [existing] = await db
        .select({ id: vendors.id, isRecommended: vendors.isRecommended })
        .from(vendors)
        .where(eq(vendors.id, id))
        .limit(1);

    if (!existing) throw Object.assign(new Error("Vendor not found"), { statusCode: 404 });

    const [updated] = await db
        .update(vendors)
        .set({ isRecommended: !existing.isRecommended, updatedAt: new Date() })
        .where(eq(vendors.id, id))
        .returning();

    console.log(`[vendorsService.toggleRecommend] Vendor ${id} isRecommended=${updated.isRecommended}`);
    return { id: updated.id, isRecommended: updated.isRecommended };
}

// ── Delete vendor ──────────────────────────────────────────────────────────────

export async function remove(id: string) {
    const [existing] = await db
        .select({ id: vendors.id, logoUrl: vendors.logoUrl, headerUrl: vendors.headerUrl })
        .from(vendors)
        .where(eq(vendors.id, id))
        .limit(1);

    if (!existing) throw Object.assign(new Error("Vendor not found"), { statusCode: 404 });

    const pathsToDelete: string[] = [];
    if (existing.logoUrl) {
        const p = storagePathFromUrl(existing.logoUrl, vendorStorageBucket);
        if (p) pathsToDelete.push(p);
    }
    if (existing.headerUrl) {
        const p = storagePathFromUrl(existing.headerUrl, vendorStorageBucket);
        if (p) pathsToDelete.push(p);
    }
    if (pathsToDelete.length > 0) {
        await getSupabase().storage.from(vendorStorageBucket).remove(pathsToDelete);
    }

    await db.delete(vendors).where(eq(vendors.id, id));
    console.log(`[vendorsService.remove] Vendor deleted: id=${id}`);
    return { id };
}

// ── Vendor image helpers ───────────────────────────────────────────────────────

async function requireVendorExists(id: string) {
    const [existing] = await db
        .select({ id: vendors.id, logoUrl: vendors.logoUrl, headerUrl: vendors.headerUrl })
        .from(vendors)
        .where(eq(vendors.id, id))
        .limit(1);
    if (!existing) throw Object.assign(new Error("Vendor not found"), { statusCode: 404 });
    return existing;
}

export async function uploadImage(
    id: string,
    imageType: "logo" | "header",
    buffer: Buffer,
    mimetype: string,
) {
    const existing = await requireVendorExists(id);

    const ext = mimetype === "image/png" ? "png" : "jpg";
    const storagePath = `${imageType}s/${id}/${imageType}.${ext}`;

    // Remove old image from storage if it exists
    const oldUrl = imageType === "logo" ? existing.logoUrl : existing.headerUrl;
    if (oldUrl) {
        const oldPath = storagePathFromUrl(oldUrl, vendorStorageBucket);
        if (oldPath) await getSupabase().storage.from(vendorStorageBucket).remove([oldPath]);
    }

    console.log(`[vendorsService.uploadImage] bucket=${vendorStorageBucket} path=${storagePath} mime=${mimetype}`);

    const { error } = await getSupabase().storage
        .from(vendorStorageBucket)
        .upload(storagePath, buffer, { contentType: mimetype, upsert: false });

    if (error) {
        console.error(`[vendorsService.uploadImage] Supabase error:`, JSON.stringify(error));
        throw new Error(`Storage upload failed: ${error.message}`);
    }

    const { data: { publicUrl } } = getSupabase().storage
        .from(vendorStorageBucket)
        .getPublicUrl(storagePath);

    // Bust cache by appending a timestamp query param
    const urlWithBust = `${publicUrl}?t=${crypto.randomUUID()}`;

    const column = imageType === "logo" ? { logoUrl: urlWithBust } : { headerUrl: urlWithBust };
    const [updated] = await db
        .update(vendors)
        .set({ ...column, updatedAt: new Date() })
        .where(eq(vendors.id, id))
        .returning();

    const key = imageType === "logo" ? "logoUrl" : "headerUrl";
    console.log(`[vendorsService.uploadImage] ${imageType} uploaded for vendor id=${id}`);
    return { id: updated.id, [key]: urlWithBust };
}

export async function removeImage(id: string, imageType: "logo" | "header") {
    const existing = await requireVendorExists(id);

    const oldUrl = imageType === "logo" ? existing.logoUrl : existing.headerUrl;
    if (oldUrl) {
        const oldPath = storagePathFromUrl(oldUrl, vendorStorageBucket);
        if (oldPath) await getSupabase().storage.from(vendorStorageBucket).remove([oldPath]);
    }

    const column = imageType === "logo" ? { logoUrl: null } : { headerUrl: null };
    await db.update(vendors).set({ ...column, updatedAt: new Date() }).where(eq(vendors.id, id));

    console.log(`[vendorsService.removeImage] ${imageType} removed for vendor id=${id}`);
    return { id };
}
