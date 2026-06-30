import { z } from 'zod';
import {
    cvUploads,
    cvViolations,
    cvMatches,
    cvNotificationsSent,
} from '../schemas/code-violations.schema';
import {
    insertCvUploadSchema,
    insertCvViolationSchema,
    insertCvMatchSchema,
    insertCvNotificationSentSchema,
} from '../inserts/code-violations.insert';
import {
    CV_PROCESSING_STATUSES,
    CV_UPLOAD_STATUSES,
    CV_UPLOAD_SOURCES,
    CV_NOTIFICATION_CHANNELS,
} from '../validation/code-violations.validation';

export type CvUpload = typeof cvUploads.$inferSelect;
export type InsertCvUpload = z.infer<typeof insertCvUploadSchema>;

export type CvViolation = typeof cvViolations.$inferSelect;
export type InsertCvViolation = z.infer<typeof insertCvViolationSchema>;

export type CvMatch = typeof cvMatches.$inferSelect;
export type InsertCvMatch = z.infer<typeof insertCvMatchSchema>;

export type CvNotificationSent = typeof cvNotificationsSent.$inferSelect;
export type InsertCvNotificationSent = z.infer<typeof insertCvNotificationSentSchema>;

// The queue state of a violation (the consumer's work lifecycle).
export type CvProcessingStatus = (typeof CV_PROCESSING_STATUSES)[number];
// The upload-level lifecycle shown in the admin panel.
export type CvUploadStatus = (typeof CV_UPLOAD_STATUSES)[number];
// Which producer enqueued a batch.
export type CvUploadSource = (typeof CV_UPLOAD_SOURCES)[number];
// Delivery channel of a sent notification.
export type CvNotificationChannel = (typeof CV_NOTIFICATION_CHANNELS)[number];
