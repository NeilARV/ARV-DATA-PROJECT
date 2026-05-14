export type Category = {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    iconName: string;
    vendorCount: number;
};

export type Vendor = {
    id: string;
    name: string;
    description: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
    website: string | null;
    isRecommended: boolean;
    categories: { id: number; name: string; slug: string; iconName: string }[];
};

export type PostImage = {
    id: number;
    imageUrl: string;
    displayOrder: number;
};

export type Post = {
    id: string;
    title: string;
    content: string;
    address: string | null;
    city: string | null;
    state: string | null;
    createdAt: string;
    updatedAt: string;
    userId: string;
    authorFirstName: string;
    authorLastName: string;
    likeCount: number;
    commentCount: number;
    categories: { id: number; name: string; slug: string; iconName: string }[];
    vendorTags: { id: string; name: string }[];
    userTags?: { id: string; firstName: string; lastName: string }[];
    images: PostImage[];
};

export type CreatePostInput = {
    title: string;
    content: string;
    address?: string;
    city?: string;
    state?: string;
    categoryIds?: number[];
    vendorIds?: string[];
};
