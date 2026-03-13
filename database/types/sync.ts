import { z } from "zod";
import { marketScanQueue } from "../schemas/sync.schema";
import { insertMarketScanQueueSchema } from "../inserts/sync.insert";

export type MarketScanQueue = typeof marketScanQueue.$inferSelect;
export type InsertMarketScanQueue = z.infer<typeof insertMarketScanQueueSchema>;

export type MarketScanQueueStatus = "pending" | "processing" | "processed" | "failed";
export type MarketScanWindow = "0-7d" | "7-14d" | "14-30d" | "30-60d";
