import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sfrSyncState } from "../schema";

export const insertSyncStateSchema = createInsertSchema(sfrSyncState, {
  id: z.never(),
  createdAt: z.never(),
  lastSyncAt: z.never(),
  totalRecordsSynced: z.number().int().optional(),
  lastSaleDate: z.coerce.date().optional(),
});