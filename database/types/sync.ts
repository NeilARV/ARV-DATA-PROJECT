import { z } from "zod";
import { sfrSyncState } from "../schema/sync.schema";
import { insertSyncStateSchema } from "../insert/sync.insert";

export type SfrSyncState = typeof sfrSyncState.$inferSelect;
export type InsertSyncState = z.infer<typeof insertSyncStateSchema>;