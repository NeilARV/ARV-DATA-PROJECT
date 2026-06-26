import { db } from 'server/storage';
import { cvViolations, cvNotificationsSent } from '@database/schemas/codeViolations.schema';
import { notifications } from '@database/schemas/mastermind.schema';
import { and, eq, inArray } from 'drizzle-orm';
import { resolveOwnersForProperties } from './resolveOwners.services';
import {
    sendTemplateToUser,
    sendPlainEmail,
    getDefaultFromEmail,
    getEmailRecipientsByUserIds,
} from 'server/services/postmark/email.services';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import type { CodeViolationNotificationMetadata } from '@shared/mastermind/events';

// Delivers code-violation alerts to the owning company's users: an in-app bell row + an
// email, each recorded once in cv_notifications_sent so overlapping re-uploads never
// re-alert. Only confident matches reach here (the pipeline holds fuzzy). A matched
// property with no linked users yields nothing (the "do nothing" case).

/** A confident match to notify on: the violation and the property it resolved to. */
export interface ViolationMatch {
    violationId: string;
    propertyId: string;
}

type ViolationRow = {
    id: string;
    recordNumber: string;
    rawAddress: string | null;
    applicationName: string | null;
    status: string | null;
    description: string | null;
};

// Short street line for display (drop the "City ST ZIP United States" tail).
function shortAddress(rawAddress: string | null): string {
    if (!rawAddress) return '';
    return (rawAddress.split(',')[0] ?? rawAddress).trim();
}

/**
 * Send bell + email alerts for the given confident matches, idempotently.
 * @param matches confident (violationId, propertyId) pairs from the pipeline
 * Side effect: inserts notifications rows, sends Postmark emails, writes the ledger.
 */
export async function notifyForMatches(matches: ViolationMatch[]): Promise<void> {
    if (matches.length === 0) return;

    const violationIds = Array.from(new Set(matches.map((m) => m.violationId)));
    const propertyIds = Array.from(new Set(matches.map((m) => m.propertyId)));

    const [violations, ownersByProperty] = await Promise.all([
        db
            .select({
                id: cvViolations.id,
                recordNumber: cvViolations.recordNumber,
                rawAddress: cvViolations.rawAddress,
                applicationName: cvViolations.applicationName,
                status: cvViolations.status,
                description: cvViolations.description,
            })
            .from(cvViolations)
            .where(inArray(cvViolations.id, violationIds)),
        resolveOwnersForProperties(propertyIds),
    ]);

    const violationById = new Map<string, ViolationRow>(violations.map((v) => [v.id, v]));

    for (const { violationId, propertyId } of matches) {
        const violation = violationById.get(violationId);
        if (!violation) continue;

        const owner = ownersByProperty.get(propertyId);
        // No owning company, or company has no linked users → store-only, alert no one.
        if (!owner || owner.userIds.length === 0) continue;

        const displayAddress = shortAddress(violation.rawAddress);
        const metadata: CodeViolationNotificationMetadata = {
            cvViolationId: violation.id,
            propertyId,
            recordNumber: violation.recordNumber,
            address: displayAddress,
            violationType: violation.applicationName,
            status: violation.status,
        };

        for (const userId of owner.userIds) {
            await deliverInApp(violation.id, propertyId, userId, metadata);
            await deliverEmail(violation, propertyId, userId, owner.companyName, displayAddress);
        }
    }
}

// In-app bell: claim the ledger row first (atomic, race-safe), then insert the bell so it
// can't double-post. actorId stays null — a code violation has no human actor.
async function deliverInApp(
    violationId: string,
    propertyId: string,
    userId: string,
    metadata: CodeViolationNotificationMetadata,
): Promise<void> {
    try {
        const [claimed] = await db
            .insert(cvNotificationsSent)
            .values({ cvViolationId: violationId, propertyId, userId, channel: 'in_app' })
            .onConflictDoNothing()
            .returning({ id: cvNotificationsSent.id });
        if (!claimed) return; // already alerted on this channel

        await db.insert(notifications).values({ userId, type: 'code_violation', metadata });
    } catch (error) {
        console.error(
            '[cv-notify] in-app delivery failed:',
            error instanceof Error ? error.message : error,
        );
    }
}

// Email: check the ledger, send, THEN record — so a failed/unconfigured send doesn't mark
// the alert "sent" and suppress a later retry. CV_ALERT_OVERRIDE_EMAIL redirects every
// alert to one address (dev safety); without it we only email notification-eligible users.
async function deliverEmail(
    violation: ViolationRow,
    propertyId: string,
    userId: string,
    companyName: string | null,
    displayAddress: string,
): Promise<void> {
    try {
        const [existing] = await db
            .select({ id: cvNotificationsSent.id })
            .from(cvNotificationsSent)
            .where(
                and(
                    eq(cvNotificationsSent.cvViolationId, violation.id),
                    eq(cvNotificationsSent.userId, userId),
                    eq(cvNotificationsSent.channel, 'email'),
                ),
            )
            .limit(1);
        if (existing) return;

        const overrideEmail = process.env.CV_ALERT_OVERRIDE_EMAIL;
        let toEmail: string | null = overrideEmail ?? null;
        if (!toEmail) {
            const [eligible] = await getEmailRecipientsByUserIds([userId]);
            toEmail = eligible?.email ?? null;
        }
        if (!toEmail) return; // not eligible + no override → bell only

        const company = formatCompanyName(companyName) ?? 'your company';
        const templateAlias = process.env.CV_CODE_VIOLATION_TEMPLATE_ALIAS;
        if (templateAlias) {
            await sendTemplateToUser({
                toEmail,
                toUserId: userId,
                templateAlias,
                templateModel: {
                    companyName: company,
                    address: displayAddress,
                    recordNumber: violation.recordNumber,
                    violationType: violation.applicationName ?? 'Code violation',
                    status: violation.status ?? '',
                    description: violation.description ?? '',
                },
            });
        } else {
            // Dev fallback so the flow is testable before the Postmark template exists.
            await sendPlainEmail({
                From: getDefaultFromEmail(),
                To: toEmail,
                Subject: `Code violation reported at ${displayAddress}`,
                HtmlBody:
                    `<p>A code violation was filed for a property owned by <strong>${company}</strong>.</p>` +
                    `<p><strong>${violation.applicationName ?? 'Code violation'}</strong> — ${violation.status ?? ''}<br/>` +
                    `${displayAddress}<br/>Record ${violation.recordNumber}</p>` +
                    `<p>${violation.description ?? ''}</p>`,
            });
        }

        await db
            .insert(cvNotificationsSent)
            .values({ cvViolationId: violation.id, propertyId, userId, channel: 'email' })
            .onConflictDoNothing();
    } catch (error) {
        console.error(
            '[cv-notify] email delivery failed:',
            error instanceof Error ? error.message : error,
        );
    }
}
