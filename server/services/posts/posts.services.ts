import { db } from 'server/storage';
import {
    posts,
    postCategories,
    postImages,
    postLikes,
    postComments,
    postVendorTags,
    postUserTags,
    categories,
    vendors,
} from '@database/schemas/vendors.schema';
import { users, userRoles, roles } from '@database/schemas/users.schema';
import { eq, desc, and, inArray, count } from 'drizzle-orm';
import { getSupabase, storageBucket, storagePathFromUrl } from 'server/lib/supabase';

export class PostServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'PostServiceError';
    }
}

// ── Batch enrichment helpers ───────────────────────────────────────────────────

async function fetchLikeCounts(postIds: string[]): Promise<Map<string, number>> {
    if (postIds.length === 0) return new Map();
    const rows = await db
        .select({ postId: postLikes.postId, total: count() })
        .from(postLikes)
        .where(inArray(postLikes.postId, postIds))
        .groupBy(postLikes.postId);
    return new Map(rows.map((r) => [r.postId, r.total]));
}

async function fetchCommentCounts(postIds: string[]): Promise<Map<string, number>> {
    if (postIds.length === 0) return new Map();
    const rows = await db
        .select({ postId: postComments.postId, total: count() })
        .from(postComments)
        .where(inArray(postComments.postId, postIds))
        .groupBy(postComments.postId);
    return new Map(rows.map((r) => [r.postId, r.total]));
}

async function fetchCategoriesForPosts(
    postIds: string[],
): Promise<Map<string, { id: number; name: string; slug: string; iconName: string }[]>> {
    if (postIds.length === 0) return new Map();
    const rows = await db
        .select({
            postId: postCategories.postId,
            categoryId: categories.id,
            name: categories.name,
            slug: categories.slug,
            iconName: categories.iconName,
        })
        .from(postCategories)
        .innerJoin(categories, eq(categories.id, postCategories.categoryId))
        .where(inArray(postCategories.postId, postIds));

    const map = new Map<string, { id: number; name: string; slug: string; iconName: string }[]>();
    for (const row of rows) {
        if (!map.has(row.postId)) map.set(row.postId, []);
        map.get(row.postId)!.push({
            id: row.categoryId,
            name: row.name,
            slug: row.slug,
            iconName: row.iconName,
        });
    }
    return map;
}

async function fetchVendorTagsForPosts(
    postIds: string[],
): Promise<Map<string, { id: string; name: string }[]>> {
    if (postIds.length === 0) return new Map();
    const rows = await db
        .select({
            postId: postVendorTags.postId,
            vendorId: vendors.id,
            name: vendors.name,
        })
        .from(postVendorTags)
        .innerJoin(vendors, eq(vendors.id, postVendorTags.vendorId))
        .where(inArray(postVendorTags.postId, postIds));

    const map = new Map<string, { id: string; name: string }[]>();
    for (const row of rows) {
        if (!map.has(row.postId)) map.set(row.postId, []);
        map.get(row.postId)!.push({ id: row.vendorId, name: row.name });
    }
    return map;
}

async function fetchUserTagsForPosts(
    postIds: string[],
): Promise<Map<string, { id: string; firstName: string; lastName: string }[]>> {
    if (postIds.length === 0) return new Map();
    const rows = await db
        .select({
            postId: postUserTags.postId,
            userId: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
        })
        .from(postUserTags)
        .innerJoin(users, eq(users.id, postUserTags.taggedUserId))
        .where(inArray(postUserTags.postId, postIds));

    const map = new Map<string, { id: string; firstName: string; lastName: string }[]>();
    for (const row of rows) {
        if (!map.has(row.postId)) map.set(row.postId, []);
        map.get(row.postId)!.push({
            id: row.userId,
            firstName: row.firstName,
            lastName: row.lastName,
        });
    }
    return map;
}

async function fetchImagesForPosts(
    postIds: string[],
): Promise<Map<string, { id: number; imageUrl: string; displayOrder: number }[]>> {
    if (postIds.length === 0) return new Map();
    const rows = await db
        .select({
            postId: postImages.postId,
            id: postImages.id,
            imageUrl: postImages.imageUrl,
            displayOrder: postImages.displayOrder,
        })
        .from(postImages)
        .where(inArray(postImages.postId, postIds))
        .orderBy(postImages.displayOrder);

    const map = new Map<string, { id: number; imageUrl: string; displayOrder: number }[]>();
    for (const row of rows) {
        if (!map.has(row.postId)) map.set(row.postId, []);
        map.get(row.postId)!.push({
            id: row.id,
            imageUrl: row.imageUrl,
            displayOrder: row.displayOrder,
        });
    }
    return map;
}

// Check whether the caller has admin or owner role
async function callerIsPrivileged(callerId: string): Promise<boolean> {
    const rows = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, callerId), inArray(roles.name, ['admin', 'owner'])))
        .limit(1);
    return rows.length > 0;
}

// ── GET posts ──────────────────────────────────────────────────────────────────

type GetPostsFilters = {
    categoryId?: number;
    vendorId?: string;
    userId?: string;
    page?: number;
    limit?: number;
};

export async function getPosts(filters: GetPostsFilters) {
    const { categoryId, vendorId, userId } = filters;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    // Resolve IDs from junction tables when filtering by category or vendor
    let filteredPostIds: string[] | undefined;

    if (categoryId !== undefined) {
        const rows = await db
            .select({ postId: postCategories.postId })
            .from(postCategories)
            .where(eq(postCategories.categoryId, categoryId));
        filteredPostIds = rows.map((r) => r.postId);
        if (filteredPostIds.length === 0) return [];
    }

    if (vendorId !== undefined) {
        const rows = await db
            .select({ postId: postVendorTags.postId })
            .from(postVendorTags)
            .where(eq(postVendorTags.vendorId, vendorId));
        const vendorPostIds = rows.map((r) => r.postId);
        filteredPostIds =
            filteredPostIds !== undefined
                ? filteredPostIds.filter((id) => vendorPostIds.includes(id))
                : vendorPostIds;
        if (filteredPostIds.length === 0) return [];
    }

    const conditions = [
        ...(userId ? [eq(posts.userId, userId)] : []),
        ...(filteredPostIds !== undefined ? [inArray(posts.id, filteredPostIds)] : []),
    ];

    const rows = await db
        .select({
            id: posts.id,
            title: posts.title,
            content: posts.content,
            address: posts.address,
            city: posts.city,
            state: posts.state,
            createdAt: posts.createdAt,
            updatedAt: posts.updatedAt,
            userId: posts.userId,
            authorFirstName: users.firstName,
            authorLastName: users.lastName,
            authorProfileImageUrl: users.profileImageUrl,
        })
        .from(posts)
        .innerJoin(users, eq(users.id, posts.userId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(posts.createdAt))
        .limit(limit)
        .offset(offset);

    if (rows.length === 0) return [];

    const postIds = rows.map((p) => p.id);
    const [likeCounts, commentCounts, categoryMap, vendorTagMap, imageMap] = await Promise.all([
        fetchLikeCounts(postIds),
        fetchCommentCounts(postIds),
        fetchCategoriesForPosts(postIds),
        fetchVendorTagsForPosts(postIds),
        fetchImagesForPosts(postIds),
    ]);

    return rows.map((post) => ({
        ...post,
        likeCount: likeCounts.get(post.id) ?? 0,
        commentCount: commentCounts.get(post.id) ?? 0,
        categories: categoryMap.get(post.id) ?? [],
        vendorTags: vendorTagMap.get(post.id) ?? [],
        images: imageMap.get(post.id) ?? [],
    }));
}

// ── GET post by ID ─────────────────────────────────────────────────────────────

export async function getPostById(id: string) {
    const rows = await db
        .select({
            id: posts.id,
            title: posts.title,
            content: posts.content,
            address: posts.address,
            city: posts.city,
            state: posts.state,
            createdAt: posts.createdAt,
            updatedAt: posts.updatedAt,
            userId: posts.userId,
            authorFirstName: users.firstName,
            authorLastName: users.lastName,
            authorProfileImageUrl: users.profileImageUrl,
        })
        .from(posts)
        .innerJoin(users, eq(users.id, posts.userId))
        .where(eq(posts.id, id))
        .limit(1);

    if (rows.length === 0) return null;

    const postIds = [rows[0].id];
    const [likeCounts, commentCounts, categoryMap, vendorTagMap, userTagMap, imageMap] =
        await Promise.all([
            fetchLikeCounts(postIds),
            fetchCommentCounts(postIds),
            fetchCategoriesForPosts(postIds),
            fetchVendorTagsForPosts(postIds),
            fetchUserTagsForPosts(postIds),
            fetchImagesForPosts(postIds),
        ]);

    return {
        ...rows[0],
        likeCount: likeCounts.get(rows[0].id) ?? 0,
        commentCount: commentCounts.get(rows[0].id) ?? 0,
        categories: categoryMap.get(rows[0].id) ?? [],
        vendorTags: vendorTagMap.get(rows[0].id) ?? [],
        userTags: userTagMap.get(rows[0].id) ?? [],
        images: imageMap.get(rows[0].id) ?? [],
    };
}

// ── POST post ──────────────────────────────────────────────────────────────────

type CreatePostInput = {
    userId: string;
    title: string;
    content: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    categoryIds?: number[];
    vendorIds?: string[];
    taggedUserIds?: string[];
};

export async function createPost(input: CreatePostInput) {
    const { userId, title, content, address, city, state, categoryIds, vendorIds, taggedUserIds } =
        input;

    const [post] = await db
        .insert(posts)
        .values({
            userId,
            title: title.trim(),
            content: content.trim(),
            address: address?.trim() || null,
            city: city?.trim() || null,
            state: state?.trim().toUpperCase() || null,
        })
        .returning();

    if (categoryIds && categoryIds.length > 0) {
        await db
            .insert(postCategories)
            .values(categoryIds.map((categoryId) => ({ postId: post.id, categoryId })));
    }

    if (vendorIds && vendorIds.length > 0) {
        await db
            .insert(postVendorTags)
            .values(vendorIds.map((vendorId) => ({ postId: post.id, vendorId })));
    }

    if (taggedUserIds && taggedUserIds.length > 0) {
        await db
            .insert(postUserTags)
            .values(taggedUserIds.map((taggedUserId) => ({ postId: post.id, taggedUserId })));
    }

    console.log(`[postsService.createPost] Post created: id=${post.id}, userId=${userId}`);
    return post;
}

// ── PUT post ───────────────────────────────────────────────────────────────────

type UpdatePostInput = {
    title?: string;
    content?: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    categoryIds?: number[];
    vendorIds?: string[];
    taggedUserIds?: string[];
};

export async function updatePost(id: string, callerId: string, input: UpdatePostInput) {
    const [existing] = await db
        .select({ id: posts.id, userId: posts.userId })
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);

    if (!existing) throw new PostServiceError(404, 'Post not found');

    if (existing.userId !== callerId && !(await callerIsPrivileged(callerId))) {
        throw new PostServiceError(403, 'You can only edit your own posts');
    }

    const { title, content, address, city, state, categoryIds, vendorIds, taggedUserIds } = input;

    const [updated] = await db
        .update(posts)
        .set({
            updatedAt: new Date(),
            ...(title !== undefined ? { title: title.trim() } : {}),
            ...(content !== undefined ? { content: content.trim() } : {}),
            ...(address !== undefined ? { address: address?.trim() || null } : {}),
            ...(city !== undefined ? { city: city?.trim() || null } : {}),
            ...(state !== undefined ? { state: state?.trim().toUpperCase() || null } : {}),
        })
        .where(eq(posts.id, id))
        .returning();

    // Replace all junction records when provided
    if (categoryIds !== undefined) {
        await db.delete(postCategories).where(eq(postCategories.postId, id));
        if (categoryIds.length > 0) {
            await db
                .insert(postCategories)
                .values(categoryIds.map((categoryId) => ({ postId: id, categoryId })));
        }
    }

    if (vendorIds !== undefined) {
        await db.delete(postVendorTags).where(eq(postVendorTags.postId, id));
        if (vendorIds.length > 0) {
            await db
                .insert(postVendorTags)
                .values(vendorIds.map((vendorId) => ({ postId: id, vendorId })));
        }
    }

    if (taggedUserIds !== undefined) {
        await db.delete(postUserTags).where(eq(postUserTags.postId, id));
        if (taggedUserIds.length > 0) {
            await db
                .insert(postUserTags)
                .values(taggedUserIds.map((taggedUserId) => ({ postId: id, taggedUserId })));
        }
    }

    console.log(`[postsService.updatePost] Post updated: id=${id}`);
    return updated;
}

// ── DELETE post ────────────────────────────────────────────────────────────────

export async function deletePost(id: string, callerId: string) {
    const [existing] = await db
        .select({ id: posts.id, userId: posts.userId })
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);

    if (!existing) throw new PostServiceError(404, 'Post not found');

    if (existing.userId !== callerId && !(await callerIsPrivileged(callerId))) {
        throw new PostServiceError(403, 'You can only delete your own posts');
    }

    // Remove images from Supabase storage before the DB cascade deletes the rows
    const images = await db
        .select({ imageUrl: postImages.imageUrl })
        .from(postImages)
        .where(eq(postImages.postId, id));

    if (images.length > 0) {
        const paths = images
            .map((img) => storagePathFromUrl(img.imageUrl))
            .filter(Boolean) as string[];
        if (paths.length > 0) {
            await getSupabase().storage.from(storageBucket).remove(paths);
        }
    }

    await db.delete(posts).where(eq(posts.id, id));

    console.log(`[postsService.deletePost] Post deleted: id=${id}`);
    return { id: existing.id };
}

// ── Upload image ───────────────────────────────────────────────────────────────

const MAX_IMAGES_PER_POST = 5;

export async function uploadPostImage(
    postId: string,
    callerId: string,
    buffer: Buffer,
    mimetype: string,
) {
    const [existing] = await db
        .select({ id: posts.id, userId: posts.userId })
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);

    if (!existing) throw new PostServiceError(404, 'Post not found');
    if (existing.userId !== callerId && !(await callerIsPrivileged(callerId))) {
        throw new PostServiceError(403, 'You can only add images to your own posts');
    }

    const [{ total }] = await db
        .select({ total: count() })
        .from(postImages)
        .where(eq(postImages.postId, postId));

    if (total >= MAX_IMAGES_PER_POST) {
        throw new PostServiceError(400, `Posts can have at most ${MAX_IMAGES_PER_POST} images`);
    }

    const ext = mimetype === 'image/png' ? 'png' : 'jpg';
    const storagePath = `posts/${postId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await getSupabase()
        .storage.from(storageBucket)
        .upload(storagePath, buffer, { contentType: mimetype, upsert: false });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const {
        data: { publicUrl },
    } = getSupabase().storage.from(storageBucket).getPublicUrl(storagePath);

    const [image] = await db
        .insert(postImages)
        .values({ postId, imageUrl: publicUrl, displayOrder: total + 1 })
        .returning();

    return image;
}

// ── Delete image ───────────────────────────────────────────────────────────────

export async function deletePostImage(imageId: number, callerId: string) {
    const [image] = await db
        .select({ id: postImages.id, postId: postImages.postId, imageUrl: postImages.imageUrl })
        .from(postImages)
        .where(eq(postImages.id, imageId))
        .limit(1);

    if (!image) throw new PostServiceError(404, 'Image not found');

    const [post] = await db
        .select({ userId: posts.userId })
        .from(posts)
        .where(eq(posts.id, image.postId))
        .limit(1);

    if (!post) throw new PostServiceError(404, 'Post not found');
    if (post.userId !== callerId && !(await callerIsPrivileged(callerId))) {
        throw new PostServiceError(403, 'You can only delete images from your own posts');
    }

    const storagePath = storagePathFromUrl(image.imageUrl);
    if (storagePath) {
        await getSupabase().storage.from(storageBucket).remove([storagePath]);
    }

    await db.delete(postImages).where(eq(postImages.id, imageId));
    return { id: imageId };
}
