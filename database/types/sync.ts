import { z } from "zod";
import { sfrSyncState } from "../schemas/sync.schema";
import { insertSyncStateSchema } from "../inserts/sync.insert";

export type SfrSyncState = typeof sfrSyncState.$inferSelect;
export type InsertSyncState = z.infer<typeof insertSyncStateSchema>;