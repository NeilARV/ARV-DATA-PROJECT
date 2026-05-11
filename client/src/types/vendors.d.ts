export type Category = {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    iconName: string;
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
    categories: { id: number; name: string; slug: string; iconName: string }[];
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
