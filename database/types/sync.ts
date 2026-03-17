import { z } from "zod";
import { marketScanQueue } from "../schemas/sync.schema";
import { insertMarketScanQueueSchema } from "../inserts/sync.insert";

export type MarketScanQueue = typeof marketScanQueue.$inferSelect;
export type InsertMarketScanQueue = z.infer<typeof insertMarketScanQueueSchema>;

export type MarketScanQueueStatus = "pending" | "processing" | "complete" | "failed";
export type MarketScanWindow = "0-15d" | "15-30d" | "30-60d" | "60-90d" | "90-180d";