import { db } from 'server/storage';
import { companyClaims, companyMembers, companies } from '@database/schemas/companies.schema';
import { users } from '@database/schemas/users.schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

// ─── Submit claim ─────────────────────────────────────────────────────────────

export type SubmitClaimResult =
    | { status: 'ok'; claimId: string }
    | { status: 'company-not-found' }
    | { status: 'already-claimed-by-user' }; // user already has pending or approved claim

export async function submitClaim(userId: string, companyId: string): Promise<SubmitClaimResult> {
    const [company] = await db
        .select({ id: companies.id })
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

    // Determine type: dispute if the company already has an approved member
    const [existingOwner] = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(eq(companyMembers.companyId, companyId))
        .limit(1);
    const type = existingOwner ? 'dispute' : 'claim';

    const [inserted] = await db
        .insert(companyClaims)
        .values({ userId, companyId, status: 'pending', type })
        .returning({ id: companyClaims.id });

    console.log(
        `${type === 'dispute' ? 'Dispute' : 'Claim'} submitted: user ${userId} → company ${companyId} (claim ${inserted.id})`,
    );
    return { status: 'ok', claimId: inserted.id };
}

// ─── List claims (admin) ──────────────────────────────────────────────────────

export interface ClaimRow {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    type: 'claim' | 'dispute';
    adminNotes: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    userId: string;
    userFirstName: string;
    userLastName: string;
    userEmail: string;
    companyId: string;
    companyName: string;
    reviewerFirstName: string | null;
    reviewerLastName: string | null;
}

const reviewers = db.$with('reviewers').as(
    db
        .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
        })
        .from(users),
);

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
            type: companyClaims.type,
            adminNotes: companyClaims.adminNotes,
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
            type: r.type,
            adminNotes: r.adminNotes,
            reviewedAt: r.reviewedAt,
            createdAt: r.createdAt,
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

export type ReviewClaimResult =
    | { status: 'ok'; claim: typeof companyClaims.$inferSelect }
    | { status: 'not-found' }
    | { status: 'already-reviewed' };

export async function reviewClaim(
    claimId: string,
    reviewerId: string,
    action: 'approve' | 'reject',
    adminNotes?: string,
): Promise<ReviewClaimResult> {
    const [claim] = await db
        .select()
        .from(companyClaims)
        .where(eq(companyClaims.id, claimId))
        .limit(1);

    if (!claim) return { status: 'not-found' };
    if (claim.status !== 'pending') return { status: 'already-reviewed' };

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const [updated] = await db
        .update(companyClaims)
        .set({
            status: newStatus,
            adminNotes: adminNotes ?? null,
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(companyClaims.id, claimId))
        .returning();

    if (action === 'approve') {
        if (claim.type === 'dispute') {
            // Dispute approval: remove all existing members and make the disputer the new owner
            await db.delete(companyMembers).where(eq(companyMembers.companyId, claim.companyId));
            console.log(
                `Dispute ${claimId} approved: removed existing owner, user ${claim.userId} is now owner of company ${claim.companyId}`,
            );
        } else {
            // Standard first-time claim: skip if this user already somehow has a member row
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
            if (alreadyMember) {
                console.log(`Claim ${claimId} approved: user already a member, skipping insert`);
                return { status: 'ok', claim: updated };
            }
            console.log(
                `Claim ${claimId} approved: user ${claim.userId} → company ${claim.companyId}`,
            );
        }

        await db.insert(companyMembers).values({
            userId: claim.userId,
            companyId: claim.companyId,
            role: 'owner',
            isPrimary: true,
        });
    } else {
        console.log(`Claim ${claimId} rejected`);
    }

    return { status: 'ok', claim: updated };
}

// ─── Get members for a company ────────────────────────────────────────────────

export interface MemberRow {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    role: 'owner' | 'member';
    isPrimary: boolean;
    joinedAt: Date;
}

export async function getCompanyMembers(companyId: string): Promise<MemberRow[]> {
    const rows = await db
        .select({
            userId: companyMembers.userId,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            role: companyMembers.role,
            isPrimary: companyMembers.isPrimary,
            joinedAt: companyMembers.createdAt,
        })
        .from(companyMembers)
        .innerJoin(users, eq(companyMembers.userId, users.id))
        .where(eq(companyMembers.companyId, companyId))
        .orderBy(companyMembers.createdAt);

    return rows;
}

// ─── Get company memberships for a user ──────────────────────────────────────

export interface UserMembershipRow {
    companyId: string;
    companyName: string;
    role: 'owner' | 'member';
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
