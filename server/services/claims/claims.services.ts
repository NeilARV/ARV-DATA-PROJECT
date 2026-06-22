import { db } from 'server/storage';
import type { ClaimRow } from '@shared/types/claims';
import { companyClaims, companyMembers, companies } from '@database/schemas/companies.schema';
import { users } from '@database/schemas/users.schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
    sendPlainEmail,
    getRmEmailsByUserIds,
    getDefaultFromEmail,
} from 'server/services/postmark/email.services';
import { isUniqueViolation } from 'server/utils/dbErrors';

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
    const messageSection = userMessage
        ? `<p><strong>Message from user:</strong><br>${userMessage}</p>`
        : '';

    console.log(
        `Sending join request notification for claim ${claimId} to ${recipientEmail} (${rmMap.has(userId) ? 'RM' : 'default recipient'})`,
    );
    await sendPlainEmail({
        From: getDefaultFromEmail(),
        To: recipientEmail,
        Subject: `New Join Request: ${companyName}`,
        HtmlBody: `
            <p><strong>${claimantName}</strong> (${claimant.email}) has submitted a <strong>join request</strong> for <strong>${companyName}</strong>.</p>
            ${messageSection}
            <p>Please review this request in the <strong>Admin Panel → Claims</strong> tab.</p>
            <p style="color:#666;font-size:12px;">Request ID: ${claimId}</p>
        `,
        TextBody: `${claimantName} (${claimant.email}) submitted a join request for ${companyName}.${userMessage ? ` Message: ${userMessage}` : ''} Review in Admin Panel > Claims. Request ID: ${claimId}`,
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
    const messageSection = adminMessage
        ? `<p><strong>Message from our team:</strong><br>${adminMessage}</p>`
        : '';

    await sendPlainEmail({
        From: getDefaultFromEmail(),
        To: claimant.email,
        Subject: `Company Claim ${actionLabel}: ${companyName}`,
        HtmlBody: `
            <p>Hi ${claimant.firstName},</p>
            <p>Your claim for <strong>${companyName}</strong> has been <strong>${actionLabel.toLowerCase()}</strong>.</p>
            ${messageSection}
            ${action === 'approve' ? '<p>You can now view your company on your profile page.</p>' : ''}
        `,
        TextBody: `Hi ${claimant.firstName}, your claim for ${companyName} has been ${actionLabel.toLowerCase()}.${adminMessage ? ` Message from our team: ${adminMessage}` : ''}`,
    });
    console.log(`Claim review notification sent to ${claimant.email} (${actionLabel})`);
}

// ─── Submit claim ─────────────────────────────────────────────────────────────

type SubmitClaimResult =
    | { status: 'ok'; claimId: string }
    | { status: 'company-not-found' }
    | { status: 'already-claimed-by-user' }; // user already has pending or approved claim

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

export async function listClaims(statusFilter?: string): Promise<ClaimRow[]> {
    const validStatuses = ['pending', 'approved', 'rejected'] as const;
    type ClaimStatus = (typeof validStatuses)[number];
    const status: ClaimStatus | undefined = (validStatuses as readonly string[]).includes(
        statusFilter ?? '',
    )
        ? (statusFilter as ClaimStatus)
        : undefined;

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
            await db.insert(companyMembers).values({
                userId: claim.userId,
                companyId: claim.companyId,
            });
        }
        console.log(
            alreadyMember
                ? `Claim ${claimId} approved: user already a member, skipping insert`
                : `Claim ${claimId} approved: user ${claim.userId} → company ${claim.companyId}`,
        );
    } else {
        console.log(`Claim ${claimId} rejected`);
    }

    // Status update is last — if this fails the claim stays pending and
    // the member write above is idempotent on retry (alreadyMember guard).
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
        .where(eq(companyClaims.id, claimId))
        .returning();

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

export async function getCompanyMembers(companyId: string): Promise<MemberRow[]> {
    const rows = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(eq(companyMembers.companyId, companyId))
        .orderBy(companyMembers.createdAt);

    return rows;
}

// ─── Get company memberships for a user ──────────────────────────────────────

interface UserMembershipRow {
    companyId: string;
    companyName: string;
    role: 'owner' | 'member' | null;
    isPrimary: boolean;
    joinedAt: Date;
}

export async function getUserMemberships(userId: string): Promise<UserMembershipRow[]> {
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

    return rows;
}

// ─── Set company memberships for a user (admin) ───────────────────────────────

export async function setUserCompanyMemberships(
    userId: string,
    companyIds: string[],
): Promise<void> {
    const currentRows = await db
        .select({ companyId: companyMembers.companyId })
        .from(companyMembers)
        .where(eq(companyMembers.userId, userId));

    const currentIds = new Set(currentRows.map((r) => r.companyId));
    const nextIds = new Set(companyIds);

    const toAdd = companyIds.filter((id) => !currentIds.has(id));
    const toRemove = Array.from(currentIds).filter((id) => !nextIds.has(id));

    if (toRemove.length > 0) {
        await db
            .delete(companyMembers)
            .where(
                and(eq(companyMembers.userId, userId), inArray(companyMembers.companyId, toRemove)),
            );
    }

    for (const companyId of toAdd) {
        await db.insert(companyMembers).values({ userId, companyId }).onConflictDoNothing();
    }
}
