import type { BadgeProps } from '@/components/ui/badge';
import type { CvProcessingStatus, CvUploadStatus } from '@shared/types/code-violations';

type BadgeVariant = NonNullable<BadgeProps['variant']>;
type StatusBadge = { label: string; variant: BadgeVariant };

/**
 * Per-complaint queue-state badges (§6.1). `Record` over the union forces every status to be
 * mapped — a new `processing_status` value is a compile error here until it gets a badge.
 */
export const CV_PROCESSING_STATUS_BADGE: Record<CvProcessingStatus, StatusBadge> = {
    pending: { label: 'Pending', variant: 'secondary' },
    processing: { label: 'Processing', variant: 'secondary' },
    awaiting_review: { label: 'Awaiting review', variant: 'orange' },
    no_match: { label: 'No match', variant: 'outline' },
    ambiguous: { label: 'Ambiguous', variant: 'orange' },
    complete: { label: 'Complete', variant: 'green' },
    failed: { label: 'Failed', variant: 'destructive' },
};

/** Upload-level lifecycle badges shown in the history table and the detail header. */
export const CV_UPLOAD_STATUS_BADGE: Record<CvUploadStatus, StatusBadge> = {
    enqueued: { label: 'Enqueued', variant: 'secondary' },
    processing: { label: 'Processing', variant: 'secondary' },
    review: { label: 'Needs review', variant: 'orange' },
    completed: { label: 'Completed', variant: 'green' },
    failed: { label: 'Failed', variant: 'destructive' },
};

/**
 * True while the consumer is still draining an upload — the panels poll on this so the UI reflects
 * progress, and stop once it settles (`review`/`completed`/`failed`). Typed against `CvUploadStatus`
 * so a renamed status is a compile error here.
 */
export function isUploadInFlight(status: CvUploadStatus): boolean {
    return status === 'enqueued' || status === 'processing';
}
