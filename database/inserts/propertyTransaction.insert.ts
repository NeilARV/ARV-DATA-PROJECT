import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const insertPropertyTransactionSchema = z.object({
    transactionType: z.string().nullable().optional(),
    recordingDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    saleDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    buyerName: z.string().nullable().optional(),
    sellerName: z.string().nullable().optional(),
    salePrice: z.string().nullable().optional(),
    firstMtgLenderName: z.string().nullable().optional(),
});

export type InsertPropertyTransactionInput = z.infer<typeof insertPropertyTransactionSchema>;
