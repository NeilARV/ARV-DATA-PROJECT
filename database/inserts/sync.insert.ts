import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { marketScanQueue } from "../schemas";

export const insertMarketScanQueueSchema = createInsertSchema(marketScanQueue, {
  id: z.never(),
  enqueuedAt: z.never(),
  processedAt: z.never(),
  msaId: z.number().int().positive(),
  status: z.enum(["pending", "processing", "processed", "failed"]).optional(),
  scanWindow: z.enum(["0-7d", "7-14d", "14-30d", "30-60d"]).optional(),
  saleValue: z.coerce.string().optional(),
  rawData: z.record(z.unknown()),
});
