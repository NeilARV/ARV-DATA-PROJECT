import { db } from 'server/storage';
import { categories, vendorCategories } from '@database/schemas/vendors.schema';
import { eq, sql } from 'drizzle-orm';
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

    // Empty returning() means no row matched — avoids a select pre-check that races concurrent deletes
    if (!updated) throw Object.assign(new Error('Category not found'), { statusCode: 404 });

    console.log(`[categoriesService.update] Category updated: id=${id}`);
    return updated;
}

export async function remove(id: number) {
    const [deleted] = await db
        .delete(categories)
        .where(eq(categories.id, id))
        .returning({ id: categories.id });

    if (!deleted) throw Object.assign(new Error('Category not found'), { statusCode: 404 });

    console.log(`[categoriesService.remove] Category deleted: id=${id}`);
    return deleted;
}
