import { z } from "zod";
import { marketScanQueue } from "../schemas/sync.schema";
import { insertMarketScanQueueSchema } from "../inserts/sync.insert";

export type MarketScanQueue = typeof marketScanQueue.$inferSelect;
export type InsertMarketScanQueue = z.infer<typeof insertMarketScanQueueSchema>;

export type MarketScanQueueStatus = "pending" | "processing" | "complete" | "failed";
export type MarketScanWindow = "0-22d" | "20-46d" | "44-76d" | "74-91d";