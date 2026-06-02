import { z } from 'zod';

export const createPostSchema = z.object({
    title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less'),
    content: z.string().min(1, 'Content is required').max(10000, 'Content is too long'),
    city: z.string().max(100, 'City must be 100 characters or less').optional(),
    state: z.string().max(2, 'Use a 2-letter state abbreviation').optional(),
    categoryIds: z.array(z.number().int().positive()).optional(),
    vendorIds: z.array(z.string()).optional(),
});

export const updatePostSchema = createPostSchema;

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
