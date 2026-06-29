import { db } from 'server/storage';
import { categories, vendors, vendorCategories } from '@database/schemas/vendors.schema';
import { eq, inArray, sql } from 'drizzle-orm';
import type { CategoryInput } from '@database/validation/vendors.validation';

export async function getAll() {
    return db
        .select({
            id: categories.id,
            name: categories.name,
            slug: categories.slug,
            description: categories.description,
            iconName: categories.iconName,
            vendorCount: sql<number>`cast(count(${vendorCategories.vendorId}) as int)`,
        })
        .from(categories)
        .leftJoin(vendorCategories, eq(vendorCategories.categoryId, categories.id))
        .groupBy(
            categories.id,
            categories.name,
            categories.slug,
            categories.description,
            categories.iconName,
        )
        .orderBy(categories.name);
}

export async function create(input: CategoryInput) {
    const slug = input.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!slug) {
        throw Object.assign(new Error('Category name must contain at least one letter or number'), {
            statusCode: 400,
        });
    }

    const [created] = await db
        .insert(categories)
        .values({
            name: input.name.trim(),
            slug,
            description: input.description?.trim() || null,
            iconName: 'tag',
        })
        .returning();

    console.log(`[categoriesService.create] Category created: id=${created.id} slug=${slug}`);
    return created;
}

export async function update(id: number, input: CategoryInput) {
    const [existing] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);

    if (!existing) throw Object.assign(new Error('Category not found'), { statusCode: 404 });

    const slug = input.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!slug) {
        throw Object.assign(new Error('Category name must contain at least one letter or number'), {
            statusCode: 400,
        });
    }

    const [updated] = await db
        .update(categories)
        .set({
            name: input.name.trim(),
            slug,
            description: input.description?.trim() || null,
            updatedAt: new Date(),
        })
        .where(eq(categories.id, id))
        .returning();

    console.log(`[categoriesService.update] Category updated: id=${id}`);
    return updated;
}

export async function remove(id: number) {
    const [existing] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);

    if (!existing) throw Object.assign(new Error('Category not found'), { statusCode: 404 });

    await db.delete(categories).where(eq(categories.id, id));
    console.log(`[categoriesService.remove] Category deleted: id=${id}`);
    return { id };
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
        const list = categoryMap.get(row.vendorId) ?? [];
        list.push(row);
        categoryMap.set(row.vendorId, list);
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
