import { db } from "server/storage";
import { categories, vendors, vendorCategories } from "@database/schemas/vendors.schema";
import { eq, inArray } from "drizzle-orm";

export async function getAll() {
    return db
        .select({
            id: categories.id,
            name: categories.name,
            slug: categories.slug,
            description: categories.description,
            iconName: categories.iconName,
        })
        .from(categories)
        .orderBy(categories.name);
}

export async function getVendorsByCategory(categoryId: number) {
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
        .innerJoin(vendorCategories, eq(vendorCategories.vendorId, vendors.id))
        .where(eq(vendorCategories.categoryId, categoryId))
        .orderBy(vendors.name);

    if (rows.length === 0) return [];

    const vendorIds = rows.map((v) => v.id);
    const categoryRows = await db
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

    const categoryMap = new Map<string, typeof categoryRows>();
    for (const row of categoryRows) {
        if (!categoryMap.has(row.vendorId)) categoryMap.set(row.vendorId, []);
        categoryMap.get(row.vendorId)!.push(row);
    }

    return rows.map((vendor) => ({
        ...vendor,
        categories: (categoryMap.get(vendor.id) ?? []).map((c) => ({
            id: c.categoryId,
            name: c.name,
            slug: c.slug,
            iconName: c.iconName,
        })),
    }));
}
