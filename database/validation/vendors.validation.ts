import { z } from 'zod';

export const vendorInputSchema = z.object({
    name: z.string().min(1, 'Name is required').max(255),
    description: z.string().max(1000).nullish(),
    address: z.string().max(255).nullish(),
    city: z.string().max(100).nullish(),
    state: z.string().max(2).nullish(),
    zipCode: z.string().max(10).nullish(),
    phone: z.string().max(20).nullish(),
    website: z.string().max(255).nullish(),
    categoryIds: z.array(z.number().int().positive()).min(1, 'At least one category is required'),
});

export const uploadVendorImageSchema = z.object({
    imageType: z.enum(['logo', 'header']),
});

export const updateVendorSchema = vendorInputSchema.partial().extend({
    categoryIds: z.array(z.number().int().positive()).min(1, 'At least one category is required'),
});

export type VendorInput = z.infer<typeof vendorInputSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type UploadVendorImageInput = z.infer<typeof uploadVendorImageSchema>;
