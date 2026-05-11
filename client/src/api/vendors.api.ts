import { apiRequest } from "@/lib/queryClient";
import type { Category, Vendor, Post, CreatePostInput } from "@/types/vendors";

export async function fetchCategories(): Promise<Category[]> {
    const res = await apiRequest("GET", "/api/categories");
    return res.json();
}

export async function fetchVendors(categoryIds?: number[]): Promise<Vendor[]> {
    const url = categoryIds && categoryIds.length > 0
        ? `/api/vendors?categoryIds=${categoryIds.join(",")}`
        : "/api/vendors";
    const res = await apiRequest("GET", url);
    return res.json();
}

export async function fetchPosts(filters?: {
    categoryId?: number;
    vendorId?: string;
    page?: number;
    limit?: number;
}): Promise<Post[]> {
    const params = new URLSearchParams();
    if (filters?.categoryId !== undefined) params.set("categoryId", String(filters.categoryId));
    if (filters?.vendorId) params.set("vendorId", filters.vendorId);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.limit) params.set("limit", String(filters.limit));
    const query = params.toString();
    const res = await apiRequest("GET", `/api/posts${query ? `?${query}` : ""}`);
    return res.json();
}

export async function createPost(input: CreatePostInput): Promise<Post> {
    const res = await apiRequest("POST", "/api/posts", input);
    const json = await res.json();
    return json.post;
}

export async function updatePost(
    postId: string,
    input: Partial<CreatePostInput>,
): Promise<Post> {
    const res = await apiRequest("PUT", `/api/posts/${postId}`, input);
    const json = await res.json();
    return json.post;
}

export async function deletePost(postId: string): Promise<void> {
    await apiRequest("DELETE", `/api/posts/${postId}`);
}
