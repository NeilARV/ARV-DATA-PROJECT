import { db } from 'server/storage';
import { and, eq } from 'drizzle-orm';
import {
    cvMatches,
    cvNotificationsSent,
    cvViolations,
} from '@database/schemas/code-violations.schema';
import { companies } from '@database/schemas/companies.schema';
import {
    CV_NOTIFICATION_CHANNEL,
    CV_PROCESSING_STATUS,
} from '@database/validation/code-violations.validation';
import type { CvViolation } from '@database/types/code-violations';
import { getCompanyMembers } from 'server/services/claims/claims.services';
import {
    getDefaultFromEmail,
    getEmailRecipientsByUserIds,
    sendPlainEmail,
} from 'server/services/postmark/email.services';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import { escapeHtml } from 'server/utils/escapeHtml';
import { markComplete, markFailed, refreshUploadStatus } from './mark-status';

const LABEL = '[CV-NOTIFY]';

interface NotifyViolationParams {
    violation: CvViolation;
    /** The owning company id — the caller has already established the violation is notifiable. */
    ownerCompanyId: string;
    /**
     * The owning company's member user ids, when the caller already has them (the consumer's inline
     * path gets them from {@link resolveOwner}). Omitted by the approve path — where no resolve ran
     * this pass — in which case they're queried here.
     */
    memberUserIds?: string[];
}

/** Outcome of notifying one complaint. */
export interface NotifyResult {
    /** Emails actually sent this pass (0 on a re-run where everyone was already notified). */
    emailsSent: number;
    /**
     * Whether this complaint has at least one recorded delivery — counting prior passes, not just
     * this one. The caller uses it for the `notified` flag so a re-run that re-sends nothing still
     * records the complaint as notified (the flag tracks the ledger, not the current pass).
     */
    notified: boolean;
}

/** Result of an approve-triggered notify pass over one upload's held-back complaints. */
export interface ApproveNotifyResult {
    violationsNotified: number;
    emailsSent: number;
}

/**
 * NOTIFY stage (§4.6, Chunk D): email every platform user linked to the violation's owning company
 * that one of their properties has a new code complaint, and record each delivery in
 * `cv_notifications_sent`.
 *
 * Recipients are the company's `company_members` (never `company_contacts` — §2) narrowed by
 * {@link getEmailRecipientsByUserIds}, which drops anyone with the master `notifications` flag off or
 * an unverified email (the kill-switch). Each recipient is **claimed in `cv_notifications_sent`
 * before the email is sent**, so the row's UNIQUE constraint is the real double-send guard: a re-run,
 * re-approve, or concurrent pass that finds the row already present skips the send. If the send then
 * fails, the claim is released so a later pass retries; one bounce is logged and never aborts the rest.
 *
 * Does not set the violation's `processing_status` — the caller owns that transition (the consumer
 * inline, or {@link notifyAwaitingReviewForUpload}) so all status writes stay in one place.
 *
 * @param params the matched violation and its notifiable owning company id
 * @returns the emails sent this pass and whether the complaint has any recorded delivery
 */
export async function notifyViolation(params: NotifyViolationParams): Promise<NotifyResult> {
    const { violation, ownerCompanyId, memberUserIds } = params;

    // Whether any email was ever recorded for this complaint — the source of truth for the `notified`
    // flag, so a re-run that re-sends nothing (everyone already notified) still reports it notified.
    const alreadySent = await db
        .select({ userId: cvNotificationsSent.userId })
        .from(cvNotificationsSent)
        .where(
            and(
                eq(cvNotificationsSent.violationId, violation.id),
                eq(cvNotificationsSent.channel, CV_NOTIFICATION_CHANNEL.EMAIL),
            ),
        );
    const alreadySentIds = new Set(alreadySent.map((r) => r.userId));
    const priorlyNotified = alreadySentIds.size > 0;

    // Reuse the ids the consumer already resolved; only re-query on the approve path.
    const userIds =
        memberUserIds ?? (await getCompanyMembers(ownerCompanyId)).map((m) => m.userId);
    if (userIds.length === 0) return { emailsSent: 0, notified: priorlyNotified };

    const recipients = await getEmailRecipientsByUserIds(userIds);
    const pending = recipients.filter((r) => !alreadySentIds.has(r.userId));
    if (pending.length === 0) return { emailsSent: 0, notified: priorlyNotified };

    const companyName = await getOwnerCompanyName(ownerCompanyId);
    const email = buildViolationEmail(violation, companyName);
    const from = getDefaultFromEmail();

    let emailsSent = 0;
    for (const recipient of pending) {
        // Claim the (violation, user, email) row first; if a concurrent pass already claimed it,
        // onConflictDoNothing returns no row and we skip — the UNIQUE is the hard double-send guard.
        const [claim] = await db
            .insert(cvNotificationsSent)
            .values({
                violationId: violation.id,
                userId: recipient.userId,
                companyId: ownerCompanyId,
            })
            .onConflictDoNothing()
            .returning({ id: cvNotificationsSent.id });
        if (!claim) continue;

        try {
            await sendPlainEmail({
                From: from,
                To: recipient.email,
                Subject: email.subject,
                HtmlBody: email.htmlBody,
                TextBody: email.textBody,
            });
            emailsSent++;
        } catch (err) {
            // Release the claim so this recipient isn't permanently recorded sent without an email.
            await db.delete(cvNotificationsSent).where(eq(cvNotificationsSent.id, claim.id));
            console.error(
                `${LABEL} Failed to email ${recipient.email} for ${violation.recordNumber}:`,
                err instanceof Error ? err.message : err,
            );
        }
    }

    return { emailsSent, notified: priorlyNotified || emailsSent > 0 };
}

/**
 * Approve-triggered notify pass (§4.6): drain one upload's `awaiting_review` complaints — email each
 * one's recipients via {@link notifyViolation}, flip it to `complete` (`notified` = whether an email
 * fired), and refresh the upload's roll-up so it advances `review → completed`.
 *
 * Per-row isolation mirrors the consumer: a complaint that throws is marked `failed` and the pass
 * continues. Re-running is safe — already-`complete` rows are no longer `awaiting_review`, so they're
 * not re-fetched, and {@link notifyViolation} skips anyone already emailed.
 *
 * @param uploadId the upload whose held complaints to notify
 * @returns how many complaints were emailed and the total emails sent
 * Side effect: sends code-violation alert emails and writes `cv_notifications_sent` rows.
 */
export async function notifyAwaitingReviewForUpload(
    uploadId: string,
): Promise<ApproveNotifyResult> {
    const rows = await db
        .select({ violation: cvViolations, ownerCompanyId: cvMatches.ownerCompanyId })
        .from(cvViolations)
        .innerJoin(cvMatches, eq(cvMatches.violationId, cvViolations.id))
        .where(
            and(
                eq(cvViolations.firstSeenUploadId, uploadId),
                eq(cvViolations.processingStatus, CV_PROCESSING_STATUS.AWAITING_REVIEW),
            ),
        );

    let violationsNotified = 0;
    let emailsSent = 0;

    for (const { violation, ownerCompanyId } of rows) {
        const normalizedAddress = violation.normalizedAddress ?? '';
        try {
            // awaiting_review implies a notifiable company (the consumer only parks notifiable rows
            // there); a null owner here would be a data anomaly — complete it without emailing.
            if (!ownerCompanyId) {
                await markComplete(violation.id, { normalizedAddress, notified: false });
                continue;
            }

            const { emailsSent: sent, notified } = await notifyViolation({
                violation,
                ownerCompanyId,
            });
            await markComplete(violation.id, { normalizedAddress, notified });
            if (sent > 0) {
                violationsNotified++;
                emailsSent += sent;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`${LABEL} Approve notify failed for ${violation.recordNumber}: ${message}`);
            await markFailed(violation.id, message);
        }
    }

    await refreshUploadStatus(uploadId);
    return { violationsNotified, emailsSent };
}

/** Fetch + title-case the owning company name for the email (ARV.RAW-COMPANY-NAME). */
async function getOwnerCompanyName(companyId: string): Promise<string | null> {
    const [row] = await db
        .select({ companyName: companies.companyName })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
    return formatCompanyName(row?.companyName);
}

interface ViolationEmail {
    subject: string;
    htmlBody: string;
    textBody: string;
}

/**
 * Build the V1 plain-HTML code-violation alert (no Postmark template until V2 §8.4). Every
 * interpolated value is escaped; the description's newlines become `<br>` for readability.
 */
function buildViolationEmail(violation: CvViolation, companyName: string | null): ViolationEmail {
    const company = companyName ?? 'your company';
    const address = violation.rawAddress;

    const detailHtml = (label: string, value: string | null): string =>
        value ? `<p style="margin:4px 0;"><strong>${label}:</strong> ${escapeHtml(value)}</p>` : '';
    const descriptionHtml = violation.description
        ? `<p style="margin:4px 0;"><strong>Description:</strong><br>${escapeHtml(violation.description).replace(/\n/g, '<br>')}</p>`
        : '';

    const subject = `New code complaint on a ${company} property`;
    const htmlBody = `
        <p>A property associated with <strong>${escapeHtml(company)}</strong> has a new code-enforcement complaint on file with the City of San Diego.</p>
        <p style="margin:4px 0;"><strong>Property:</strong> ${escapeHtml(address)}</p>
        ${detailHtml('Record Number', violation.recordNumber)}
        ${detailHtml('Type', violation.recordType)}
        ${detailHtml('Status', violation.statusText)}
        ${detailHtml('Date', violation.violationDate)}
        ${descriptionHtml}
        <p style="color:#666;font-size:12px;">You're receiving this because you're associated with ${escapeHtml(company)} on ARV Finance.</p>
    `.trim();

    const textBody = [
        `A property associated with ${company} has a new code-enforcement complaint on file with the City of San Diego.`,
        `Property: ${address}`,
        `Record Number: ${violation.recordNumber}`,
        violation.recordType ? `Type: ${violation.recordType}` : '',
        violation.statusText ? `Status: ${violation.statusText}` : '',
        violation.violationDate ? `Date: ${violation.violationDate}` : '',
        violation.description ? `Description: ${violation.description}` : '',
    ]
        .filter(Boolean)
        .join('\n');

    return { subject, htmlBody, textBody };
}
