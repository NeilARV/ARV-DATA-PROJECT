import { Request, Response, NextFunction } from 'express';
import { insertUserSchema } from '@database/inserts';
import { UserServices, EmailVerificationServices } from 'server/services/auth';
import {
    seedHomeCountySubscription,
    seedWhitelistCountySubscriptions,
} from 'server/services/subscriptions/countySubscriptions.services';
import { normalizeEmail } from 'server/utils/normalizeEmail';

export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const validation = insertUserSchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid signup data',
                errors: validation.error.errors,
            });
            return;
        }

        const { firstName, lastName, phone, email, password, county, state } = validation.data;
        const normalizedCounty = county || null;
        const normalizedState = state || null;

        const existingUser = await UserServices.getUserByEmail(email);

        if (existingUser.length > 0) {
            res.status(409).json({ message: 'An account with this email already exists' });
            return;
        }

        const subscriptionListEntry = await UserServices.checkEmailSubscriptionList(email);
        console.log(
            '[signup] email lookup:',
            normalizeEmail(email),
            '→ found:',
            !!subscriptionListEntry,
            subscriptionListEntry
                ? `(rm: ${subscriptionListEntry.relationshipManagerId ?? 'none'})`
                : '',
        );

        // Subscription-list signups are granted the basic tier (resolved in the service)
        const subscriptionId = subscriptionListEntry
            ? await UserServices.resolveSignupSubscriptionId()
            : null;

        const newUser = await UserServices.createUser({
            firstName,
            lastName,
            phone,
            email,
            password,
            county: normalizedCounty,
            state: normalizedState,
            subscriptionId,
        });
        console.log(
            '[signup] user created:',
            newUser.id,
            'subscriptionId:',
            newUser.subscriptionId,
        );

        if (subscriptionListEntry?.relationshipManagerId) {
            await UserServices.addUserRelationshipManager(
                newUser.id,
                subscriptionListEntry.relationshipManagerId,
            );
            console.log('[signup] linked RM:', subscriptionListEntry.relationshipManagerId);
        }

        if (subscriptionListEntry) {
            // Copy the entry's counties before the delete — they cascade with the entry (#135).
            await seedWhitelistCountySubscriptions(newUser.id, subscriptionListEntry.id);
            await UserServices.removeEmailFromSubscriptionList(subscriptionListEntry.id);
            console.log('[signup] removed from subscription list:', subscriptionListEntry.id);
        }

        await UserServices.upsertUserNotificationPreferences(newUser.id, {
            dataAppStatusFilter: ['in-renovation', 'wholesale'],
            dealTypeFilter: ['wholesale', 'agent', 'sold', 'reo'],
        });

        // Seed the home county — never the whole (multi-county) MSA (issue #114). With a whitelist
        // entry this unions with the counties copied above; the PK dedupes an overlap (#135).
        if (normalizedCounty) {
            await seedHomeCountySubscription(newUser.id, normalizedCounty);
        }

        req.session.userId = newUser.id;

        // Best-effort: a failed verification email must not fail signup (auto-login stays).
        // The user can resend from the banner / profile if it doesn't arrive.
        try {
            await EmailVerificationServices.issueVerificationEmail(newUser.id, newUser.email);
        } catch (emailError) {
            console.error('[signup] verification email failed:', emailError);
        }

        res.status(201).json({
            success: true,
            user: newUser,
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Error creating account' });
    }
}
