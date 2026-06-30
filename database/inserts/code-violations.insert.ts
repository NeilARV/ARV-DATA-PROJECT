import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
    cvUploads,
    cvViolations,
    cvMatches,
    cvNotificationsSent,
} from '../schemas/code-violations.schema';
import {
    CV_UPLOAD_SOURCES,
    CV_UPLOAD_STATUSES,
    CV_PROCESSING_STATUSES,
    CV_NOTIFICATION_CHANNELS,
} from '../validation/code-violations.validation';

export const insertCvUploadSchema = createInsertSchema(cvUploads, {
    source: z.enum(CV_UPLOAD_SOURCES).optional(),
    status: z.enum(CV_UPLOAD_STATUSES).optional(),
}).omit({
    id: true,
    createdAt: true,
    finishedAt: true,
});

export const insertCvViolationSchema = createInsertSchema(cvViolations, {
    processingStatus: z.enum(CV_PROCESSING_STATUSES).optional(),
}).omit({
    id: true,
    processedAt: true,
    createdAt: true,
    updatedAt: true,
});

export const insertCvMatchSchema = createInsertSchema(cvMatches).omit({
    id: true,
    matchedAt: true,
});

export const insertCvNotificationSentSchema = createInsertSchema(cvNotificationsSent, {
    channel: z.enum(CV_NOTIFICATION_CHANNELS).optional(),
}).omit({
    id: true,
    sentAt: true,
});
