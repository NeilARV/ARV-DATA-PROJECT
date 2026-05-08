import { db } from "server/storage";
import { vendors, vendorCategories, categories } from "@database/schemas/vendors.schema";
import { eq, inArray } from "drizzle-orm";

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

export async function getAll(categoryId?: number) {
    const rows = categoryId !== undefined
        ? await db
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
            })
            .from(vendors)
            .innerJoin(vendorCategories, eq(vendorCategories.vendorId, vendors.id))
            .where(eq(vendorCategories.categoryId, categoryId))
            .orderBy(vendors.name)
        : await db
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
            })
            .from(vendors)
            .orderBy(vendors.name);

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
