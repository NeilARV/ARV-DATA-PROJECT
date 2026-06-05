import { apiRequest } from '@/lib/queryClient';
import type { Category, Vendor, Post, CreatePostInput } from '@/types/vendors';
import type {
    VendorInput,
    UpdateVendorInput,
    CategoryInput,
} from '@database/validation/vendors.validation';

export async function fetchCategories(): Promise<Category[]> {
    const res = await apiRequest('GET', '/api/categories');
    return res.json();
}

export async function fetchVendor(vendorId: string): Promise<Vendor> {
    const res = await apiRequest('GET', `/api/vendors/${vendorId}`);
    return res.json();
}

export async function fetchVendors(categoryIds?: number[]): Promise<Vendor[]> {
    const url =
        categoryIds && categoryIds.length > 0
            ? `/api/vendors?categoryIds=${categoryIds.join(',')}`
            : '/api/vendors';
    const res = await apiRequest('GET', url);
    return res.json();
}

export async function fetchPosts(filters?: {
    categoryId?: number;
    vendorId?: string;
    page?: number;
    limit?: number;
}): Promise<Post[]> {
    const params = new URLSearchParams();
    if (filters?.categoryId !== undefined) params.set('categoryId', String(filters.categoryId));
    if (filters?.vendorId) params.set('vendorId', filters.vendorId);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    const res = await apiRequest('GET', `/api/posts${query ? `?${query}` : ''}`);
    return res.json();
}

export async function createPost(input: CreatePostInput): Promise<Post> {
    const res = await apiRequest('POST', '/api/posts', input);
    const json = await res.json();
    return json.post;
}

export async function updatePost(postId: string, input: Partial<CreatePostInput>): Promise<Post> {
    const res = await apiRequest('PUT', `/api/posts/${postId}`, input);
    const json = await res.json();
    return json.post;
}

export async function deletePost(postId: string): Promise<void> {
    await apiRequest('DELETE', `/api/posts/${postId}`);
}

export async function uploadPostImage(
    postId: string,
    file: File,
): Promise<{ id: number; imageUrl: string; displayOrder: number }> {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`/api/posts/${postId}/images`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
    }
    const json = await res.json();
    return json.image;
}

export async function deletePostImage(postId: string, imageId: number): Promise<void> {
    await apiRequest('DELETE', `/api/posts/${postId}/images/${imageId}`);
}

export async function createVendor(input: VendorInput): Promise<Vendor> {
    const res = await apiRequest('POST', '/api/vendors', input);
    const json = await res.json();
    return json.vendor;
}

export async function updateVendor(vendorId: string, input: UpdateVendorInput): Promise<Vendor> {
    const res = await apiRequest('PUT', `/api/vendors/${vendorId}`, input);
    const json = await res.json();
    return json.vendor;
}

export async function deleteVendor(vendorId: string): Promise<void> {
    await apiRequest('DELETE', `/api/vendors/${vendorId}`);
}

export async function fetchRecommendedVendors(): Promise<Vendor[]> {
    const res = await apiRequest('GET', '/api/vendors/recommended');
    return res.json();
}

export async function toggleVendorRecommend(
    vendorId: string,
): Promise<{ id: string; isRecommended: boolean }> {
    const res = await apiRequest('PUT', `/api/vendors/${vendorId}/recommend`);
    return res.json();
}

export async function uploadVendorLogo(vendorId: string, file: File): Promise<{ logoUrl: string }> {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`/api/vendors/${vendorId}/logo`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
    }
    return res.json();
}

export async function removeVendorLogo(vendorId: string): Promise<void> {
    await apiRequest('DELETE', `/api/vendors/${vendorId}/logo`);
}

export async function uploadVendorHeader(
    vendorId: string,
    file: File,
): Promise<{ headerUrl: string }> {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`/api/vendors/${vendorId}/header`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
    }
    return res.json();
}

export async function removeVendorHeader(vendorId: string): Promise<void> {
    await apiRequest('DELETE', `/api/vendors/${vendorId}/header`);
}

export async function createCategory(input: CategoryInput): Promise<Category> {
    const res = await apiRequest('POST', '/api/categories', input);
    const json = await res.json();
    return json.category;
}

export async function deleteCategory(categoryId: number): Promise<void> {
    await apiRequest('DELETE', `/api/categories/${categoryId}`);
}
