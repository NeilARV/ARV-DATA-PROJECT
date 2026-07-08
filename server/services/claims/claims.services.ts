import { db } from 'server/storage';
import type { ClaimRow, UserMembership } from '@shared/types/claims';
import { companyClaims, companyMembers, companies } from '@database/schemas/companies.schema';
import { users } from '@database/schemas/users.schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
    sendPlainEmail,
    getRmEmailsByUserIds,
    getDefaultFromEmail,
} from 'server/services/postmark/email.services';
import { isUniqueViolation } from 'server/utils/dbErrors';
import { escapeHtml } from 'server/utils/escapeHtml';
import { formatCompanyName } from '@shared/utils/formatCompanyName';

// ─── Claim notification email ─────────────────────────────────────────────────

async function notifyClaimSubmitted(
    userId: string,
    companyName: string,
    claimId: string,
    userMessage?: string,
): Promise<void> {
    const [[claimant], rmMap] = await Promise.all([
        db
            .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1),
        getRmEmailsByUserIds([userId]),
    ]);

    if (!claimant) return;

    const recipientEmail = rmMap.get(userId) ?? process.env.DEFAULT_CONTACT_RECIPIENT;
    if (!recipientEmail) {
        console.warn(
            `No recipient for claim notification (claim ${claimId}) — set DEFAULT_CONTACT_RECIPIENT`,
        );
        return;
    }

    const claimantName = `${claimant.firstName} ${claimant.lastName}`.trim();
    const displayCompanyName = formatCompanyName(companyName) ?? companyName;
    // userMessage is untrusted user input — escape it so no markup reaches the recipient's inbox.
    const messageSection = userMessage
        ? `<p><strong>Message from user:</strong><br>${escapeHtml(userMessage).replace(/\n/g, '<br>')}</p>`
        : '';

    console.log(
        `Sending join request notification for claim ${claimId} to ${recipientEmail} (${rmMap.has(userId) ? 'RM' : 'default recipient'})`,
    );
    await sendPlainEmail({
        From: getDefaultFromEmail(),
        To: recipientEmail,
        Subject: `New Join Request: ${displayCompanyName}`,
        HtmlBody: `
            <p><strong>${escapeHtml(claimantName)}</strong> (${escapeHtml(claimant.email)}) has submitted a <strong>join request</strong> for <strong>${escapeHtml(displayCompanyName)}</strong>.</p>
            ${messageSection}
            <p>Please review this request in the <strong>Admin Panel → Claims</strong> tab.</p>
            <p style="color:#666;font-size:12px;">Request ID: ${claimId}</p>
        `,
        TextBody: `${claimantName} (${claimant.email}) submitted a join request for ${displayCompanyName}.${userMessage ? ` Message: ${userMessage}` : ''} Review in Admin Panel > Claims. Request ID: ${claimId}`,
    });
    console.log(`Join request notification sent for claim ${claimId}`);
}

async function notifyClaimReviewed(
    claimUserId: string,
    companyName: string,
    action: 'approve' | 'reject',
    adminMessage?: string,
): Promise<void> {
    const [claimant] = await db
        .select({ firstName: users.firstName, email: users.email })
        .from(users)
        .where(eq(users.id, claimUserId))
        .limit(1);

    if (!claimant) return;

    const actionLabel = action === 'approve' ? 'Approved' : 'Rejected';
    const displayCompanyName = formatCompanyName(companyName) ?? companyName;
    const messageSection = adminMessage
        ? `<p><strong>Message from our team:</strong><br>${escapeHtml(adminMessage).replace(/\n/g, '<br>')}</p>`
        : '';

    await sendPlainEmail({
        From: getDefaultFromEmail(),
        To: claimant.email,
        Subject: `Company Claim ${actionLabel}: ${displayCompanyName}`,
        HtmlBody: `
            <p>Hi ${escapeHtml(claimant.firstName)},</p>
            <p>Your claim for <strong>${escapeHtml(displayCompanyName)}</strong> has been <strong>${actionLabel.toLowerCase()}</strong>.</p>
            ${messageSection}
            ${action === 'approve' ? '<p>You can now view your company on your profile page.</p>' : ''}
        `,
        TextBody: `Hi ${claimant.firstName}, your claim for ${displayCompanyName} has been ${actionLabel.toLowerCase()}.${adminMessage ? ` Message from our team: ${adminMessage}` : ''}`,
    });
    console.log(`Claim review notification sent to ${claimant.email} (${actionLabel})`);
}

// ─── Submit claim ─────────────────────────────────────────────────────────────

type SubmitClaimResult =
    | { status: 'ok'; claimId: string }
    | { status: 'company-not-found' }
    | { status: 'already-claimed-by-user' }; // user already has pending or approved claim

/**
 * Submits a join request (claim) for a company on behalf of a user.
 * Side effect: emails the claimant's RM (or the default contact) after the insert (best-effort).
 */
export async function submitClaim(
    userId: string,
    companyId: string,
    userMessage?: string,
): Promise<SubmitClaimResult> {
    const [company] = await db
        .select({ id: companies.id, companyName: companies.companyName })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
    if (!company) return { status: 'company-not-found' };

    const [existing] = await db
        .select({ id: companyClaims.id })
        .from(companyClaims)
        .where(
            and(
                eq(companyClaims.userId, userId),
                eq(companyClaims.companyId, companyId),
                sql`${companyClaims.status} IN ('pending', 'approved')`,
            ),
        )
        .limit(1);
    if (existing) return { status: 'already-claimed-by-user' };

    try {
        const [inserted] = await db
            .insert(companyClaims)
            .values({
                userId,
                companyId,
                status: 'pending',
                userMessage: userMessage ?? null,
            })
            .returning({ id: companyClaims.id });

        console.log(
            `Join request submitted: user ${userId} → company ${companyId} (claim ${inserted.id})`,
        );
        notifyClaimSubmitted(userId, company.companyName, inserted.id, userMessage).catch((err) =>
            console.error(
                'Join request notification email failed:',
                err instanceof Error ? err.message : err,
            ),
        );
        return { status: 'ok', claimId: inserted.id };
    } catch (err: unknown) {
        // Unique constraint violation — concurrent request beat us to the insert
        if (isUniqueViolation(err)) {
            return { status: 'already-claimed-by-user' };
        }
        throw err;
    }
}

// ─── List claims (admin) ──────────────────────────────────────────────────────

/** Lists company claims for admin review, newest first, optionally filtered by status. */
export async function listClaims(status?: ClaimRow['status']): Promise<ClaimRow[]> {
    const claimantAlias = db.$with('claimants').as(
        db
            .select({
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                email: users.email,
            })
            .from(users),
    );

    const rows = await db
        .with(claimantAlias)
        .select({
            id: companyClaims.id,
            status: companyClaims.status,
            userMessage: companyClaims.userMessage,
            adminNotes: companyClaims.adminNotes,
            adminMessage: companyClaims.adminMessage,
            reviewedAt: companyClaims.reviewedAt,
            createdAt: companyClaims.createdAt,
            userId: companyClaims.userId,
            userFirstName: claimantAlias.firstName,
            userLastName: claimantAlias.lastName,
            userEmail: claimantAlias.email,
            companyId: companies.id,
            companyName: companies.companyName,
            reviewedBy: companyClaims.reviewedBy,
        })
        .from(companyClaims)
        .innerJoin(claimantAlias, eq(companyClaims.userId, claimantAlias.id))
        .innerJoin(companies, eq(companyClaims.companyId, companies.id))
        .where(status ? eq(companyClaims.status, status) : undefined)
        .orderBy(desc(companyClaims.createdAt));

    if (rows.length === 0) return [];

    const reviewerIds = Array.from(
        new Set(rows.map((r) => r.reviewedBy).filter((id): id is string => id !== null)),
    );
    const reviewerMap = new Map<string, { firstName: string; lastName: string }>();

    if (reviewerIds.length > 0) {
        const reviewerRows = await db
            .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(inArray(users.id, reviewerIds));
        for (const r of reviewerRows) reviewerMap.set(r.id, r);
    }

    return rows.map((r) => {
        const reviewer = r.reviewedBy ? (reviewerMap.get(r.reviewedBy) ?? null) : null;
        return {
            id: r.id,
            status: r.status,
            userMessage: r.userMessage,
            adminNotes: r.adminNotes,
            adminMessage: r.adminMessage,
            reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
            createdAt: r.createdAt.toISOString(),
            userId: r.userId,
            userFirstName: r.userFirstName,
            userLastName: r.userLastName,
            userEmail: r.userEmail,
            companyId: r.companyId,
            companyName: r.companyName,
            reviewerFirstName: reviewer?.firstName ?? null,
            reviewerLastName: reviewer?.lastName ?? null,
        };
    });
}

// ─── Review claim (approve / reject) ─────────────────────────────────────────

type ReviewClaimResult =
    | { status: 'ok'; claim: typeof companyClaims.$inferSelect }
    | { status: 'not-found' }
    | { status: 'already-reviewed' };

/**
 * Approves or rejects a pending claim, adding the claimant as a company member on approval.
 * Side effect: emails the claimant the review outcome after the update (best-effort).
 */
export async function reviewClaim(
    claimId: string,
    reviewerId: string,
    action: 'approve' | 'reject',
    adminNotes?: string,
    adminMessage?: string,
): Promise<ReviewClaimResult> {
    const [claim] = await db
        .select()
        .from(companyClaims)
        .where(eq(companyClaims.id, claimId))
        .limit(1);

    if (!claim) return { status: 'not-found' };
    if (claim.status !== 'pending') return { status: 'already-reviewed' };

    // Member writes happen BEFORE the status update so that if anything fails
    // mid-way the claim stays 'pending' and the admin can safely retry.
    let insertedMember = false;
    if (action === 'approve') {
        const [alreadyMember] = await db
            .select({ userId: companyMembers.userId })
            .from(companyMembers)
            .where(
                and(
                    eq(companyMembers.userId, claim.userId),
                    eq(companyMembers.companyId, claim.companyId),
                ),
            )
            .limit(1);
        if (!alreadyMember) {
            // onConflictDoNothing: a concurrent approval may insert the same row between check and write.
            await db
                .insert(companyMembers)
                .values({
                    userId: claim.userId,
                    companyId: claim.companyId,
                })
                .onConflictDoNothing();
            insertedMember = true;
        }
        console.log(
            alreadyMember
                ? `Claim ${claimId} approved: user already a member, skipping insert`
                : `Claim ${claimId} approved: user ${claim.userId} → company ${claim.companyId}`,
        );
    } else {
        console.log(`Claim ${claimId} rejected`);
    }

    // The status transition is the arbiter between concurrent reviews (neon-http has no
    // transactions): guarded on 'pending', so exactly one review wins. If it fails the claim
    // stays pending and the member write above is idempotent on retry (alreadyMember guard).
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const [updated] = await db
        .update(companyClaims)
        .set({
            status: newStatus,
            adminNotes: adminNotes ?? null,
            adminMessage: adminMessage ?? null,
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(and(eq(companyClaims.id, claimId), eq(companyClaims.status, 'pending')))
        .returning();

    if (!updated) {
        // Lost a concurrent review race; if the winning review rejected (or the claim vanished),
        // undo the member row this call added so a rejected claim can't leave a membership behind.
        if (insertedMember) {
            const [current] = await db
                .select({ status: companyClaims.status })
                .from(companyClaims)
                .where(eq(companyClaims.id, claimId))
                .limit(1);
            if (!current || current.status === 'rejected') {
                await db
                    .delete(companyMembers)
                    .where(
                        and(
                            eq(companyMembers.userId, claim.userId),
                            eq(companyMembers.companyId, claim.companyId),
                        ),
                    );
            }
        }
        return { status: 'already-reviewed' };
    }

    // Need the company name for the notification email
    const [company] = await db
        .select({ companyName: companies.companyName })
        .from(companies)
        .where(eq(companies.id, claim.companyId))
        .limit(1);

    if (company) {
        notifyClaimReviewed(claim.userId, company.companyName, action, adminMessage).catch((err) =>
            console.error(
                'Claim review notification email failed:',
                err instanceof Error ? err.message : err,
            ),
        );
    }

    return { status: 'ok', claim: updated };
}

// ─── Get members for a company ────────────────────────────────────────────────

interface MemberRow {
    userId: string;
}

/** Lists the user ids of a company's members, oldest membership first. */
export async function getCompanyMembers(companyId: string): Promise<MemberRow[]> {
    const rows = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(eq(companyMembers.companyId, companyId))
        .orderBy(companyMembers.createdAt);

    return rows;
}

// ─── Get company memberships for a user ──────────────────────────────────────

/** Lists the companies a user belongs to, oldest membership first. */
export async function getUserMemberships(userId: string): Promise<UserMembership[]> {
    const rows = await db
        .select({
            companyId: companies.id,
            companyName: companies.companyName,
            role: companyMembers.role,
            isPrimary: companyMembers.isPrimary,
            joinedAt: companyMembers.createdAt,
        })
        .from(companyMembers)
        .innerJoin(companies, eq(companyMembers.companyId, companies.id))
        .where(eq(companyMembers.userId, userId))
        .orderBy(companyMembers.createdAt);

    return rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() }));
}

// ─── Set company memberships for a user (admin) ───────────────────────────────

type SetUserCompanyMembershipsResult =
    | { status: 'ok' }
    | { status: 'unknown-company-ids'; unknownIds: string[] };

/** Replaces a user's company memberships with exactly the given companies (admin operation). */
export async function setUserCompanyMemberships(
    userId: string,
    companyIds: string[],
): Promise<SetUserCompanyMembershipsResult> {
    const nextIds = new Set(companyIds);

    // Reject ids with no matching company up front — otherwise the insert below fails the FK
    // and surfaces as a 500 instead of a validation error.
    if (nextIds.size > 0) {
        const existing = await db
            .select({ id: companies.id })
            .from(companies)
            .where(inArray(companies.id, Array.from(nextIds)));
        const existingIds = new Set(existing.map((r) => r.id));
        const unknownIds = Array.from(nextIds).filter((id) => !existingIds.has(id));
        if (unknownIds.length > 0) return { status: 'unknown-company-ids', unknownIds };
    }

    const currentRows = await db
        .select({ companyId: companyMembers.companyId })
        .from(companyMembers)
        .where(eq(companyMembers.userId, userId));

    const currentIds = new Set(currentRows.map((r) => r.companyId));

    const toAdd = Array.from(nextIds).filter((id) => !currentIds.has(id));
    const toRemove = Array.from(currentIds).filter((id) => !nextIds.has(id));

    if (toRemove.length > 0) {
        await db
            .delete(companyMembers)
            .where(
                and(eq(companyMembers.userId, userId), inArray(companyMembers.companyId, toRemove)),
            );
    }

    if (toAdd.length > 0) {
        await db
            .insert(companyMembers)
            .values(toAdd.map((companyId) => ({ userId, companyId })))
            .onConflictDoNothing();
    }

    return { status: 'ok' };
}
