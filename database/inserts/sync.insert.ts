import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { marketScanQueue } from "../schemas";

export const insertMarketScanQueueSchema = createInsertSchema(marketScanQueue, {
  id: z.never(),
  enqueuedAt: z.never(),
  processedAt: z.never(),
  msaId: z.number().int().positive(),
  status: z.enum(["pending", "processing", "complete", "failed"]).optional(),
  scanWindow: z.enum(["0-22d", "20-46d", "44-76d", "74-91d"]).optional(),
  saleValue: z.coerce.string().optional(),
  rawData: z.record(z.unknown()),
});