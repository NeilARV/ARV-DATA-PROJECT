import { Request, Response, NextFunction } from 'express';
import {
    loginSchema,
    changePasswordSchema,
    forgotPasswordSchema,
    completeResetSchema,
} from '@database/validation/users.validation';
import { updateUserProfileSchema, updateNotificationPreferencesSchema } from '@database/updates';
import { EmailVerificationServices, SessionServices, UserServices } from 'server/services/auth';
import {
    getUserCountySubscriptions,
    replaceUserCountySubscriptions,
    msaNamesToCountySelections,
} from 'server/services/subscriptions/countySubscriptions.services';
import type { CountySubscription } from '@shared/types/users';
import { generateTempPassword } from 'server/utils/generateTempPassword';
import { sendTempPasswordEmail } from 'server/services/postmark/passwordReset.services';

/** Distinct parent-MSA names covered by the user's county subscriptions — the legacy
 *  `msaSubscriptions` field, derived so the current profile UI keeps working until issue #115. */
function deriveMsaSubscriptionNames(countySubscriptions: CountySubscription[]): string[] {
    return Array.from(new Set(countySubscriptions.map((c) => c.msaName)));
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const validation = loginSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid login data',
                errors: validation.error.errors,
            });
            return;
        }

        const { email, password } = validation.data;

        // Find user by email
        const [user] = await UserServices.getUserByEmail(email);

        // User does not exist
        if (!user) {
            res.status(401).json({ message: 'Invalid email or password' });
            return;
        }

        // Verify password
        const isValidPassword = await SessionServices.isValidPassword(password, user.passwordHash);

        if (!isValidPassword) {
            res.status(401).json({ message: 'Invalid email or password' });
            return;
        }

        // Set user session
        req.session.userId = user.id;

        // Return user data (without password hash)
        const { passwordHash: _, ...userWithoutPassword } = user;
        res.json({
            success: true,
            user: userWithoutPassword,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error logging in' });
    }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
            res.status(500).json({ message: 'Error logging out' });
            return;
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.session.userId) {
            res.json({ user: null });
            return;
        }

        const [user] = await UserServices.getUserById(req.session.userId);

        if (!user) {
            req.session.userId = undefined;
            res.json({ user: null });
            return;
        }

        const [countySubscriptions, relationshipManager, notificationPreferences] =
            await Promise.all([
                getUserCountySubscriptions(user.id),
                UserServices.getRelationshipManagerForUser(user.id),
                UserServices.getUserNotificationPreferences(user.id),
            ]);
        const { passwordHash: _, ...userWithoutPassword } = user;
        res.json({
            user: {
                ...userWithoutPassword,
                countySubscriptions,
                msaSubscriptions: deriveMsaSubscriptionNames(countySubscriptions),
                relationshipManager,
                notificationPreferences,
            },
        });
    } catch (error) {
        console.error('Error fetching current user:', error);
        res.status(500).json({ message: 'Error fetching user' });
    }
}

export async function updateProfile(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        // Check if user is authenticated
        if (!req.session.userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        // Validate request body
        const validation = updateUserProfileSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid profile data',
                errors: validation.error.errors,
            });
            return;
        }

        // Subscriptions are replaced separately (county table), not part of the users-row update.
        // countySubscriptions is the authoritative field (issue #114); legacy msaSubscriptions is
        // still honored — translated to whole-MSA county rows — until the profile UI moves (#115).
        const { countySubscriptions, msaSubscriptions, ...profileData } = validation.data;

        // Check if email is being updated and if it's already taken by another user
        if (profileData.email) {
            const [existingUser] = await UserServices.getUserByEmail(profileData.email);
            if (existingUser && existingUser.id !== req.session.userId) {
                res.status(409).json({ message: 'An account with this email already exists' });
                return;
            }
        }

        // Update user profile (only allow updating own profile)
        const result = await UserServices.updateUser(req.session.userId, profileData);

        if (!result) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const { user: updatedUser, hasEmailChanged } = result;

        if (countySubscriptions !== undefined) {
            await replaceUserCountySubscriptions(updatedUser.id, countySubscriptions);
        } else if (msaSubscriptions !== undefined) {
            await replaceUserCountySubscriptions(
                updatedUser.id,
                msaNamesToCountySelections(msaSubscriptions),
            );
        }

        const [refreshedCountySubscriptions, relationshipManager, notificationPreferences] =
            await Promise.all([
                getUserCountySubscriptions(updatedUser.id),
                UserServices.getRelationshipManagerForUser(updatedUser.id),
                UserServices.getUserNotificationPreferences(updatedUser.id),
            ]);
        res.json({
            success: true,
            user: {
                ...updatedUser,
                countySubscriptions: refreshedCountySubscriptions,
                msaSubscriptions: deriveMsaSubscriptionNames(refreshedCountySubscriptions),
                relationshipManager,
                notificationPreferences,
            },
        });

        // A changed email is unproven, so a fresh verification link goes out after the
        // response. Best-effort: a failed send must not fail the profile update.
        if (hasEmailChanged) {
            void EmailVerificationServices.issueVerificationEmail(
                updatedUser.id,
                updatedUser.email,
            ).catch((emailError) =>
                console.error('[updateProfile] verification email failed:', emailError),
            );
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Error updating profile' });
    }
}

export async function updateNotifications(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.session.userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const validation = updateNotificationPreferencesSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid notification preferences',
                errors: validation.error.errors,
            });
            return;
        }

        const preferences = await UserServices.upsertUserNotificationPreferences(
            req.session.userId,
            validation.data,
        );

        res.json({ success: true, preferences });
    } catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({ message: 'Error updating notification preferences' });
    }
}

export async function changePassword(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.session.userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const validation = changePasswordSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid password data',
                errors: validation.error.errors,
            });
            return;
        }

        const { currentPassword, newPassword } = validation.data;

        const [user] = await UserServices.getUserById(req.session.userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const isValidPassword = await SessionServices.isValidPassword(
            currentPassword,
            user.passwordHash,
        );
        if (!isValidPassword) {
            res.status(400).json({ message: 'Current password is incorrect' });
            return;
        }

        await UserServices.changeUserPassword(user.id, newPassword);

        // Log the user out of every other device after a voluntary password change.
        await UserServices.destroyOtherUserSessions(user.id, req.sessionID);

        res.json({ success: true });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ message: 'Error changing password' });
    }
}

export async function completeReset(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.session.userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const validation = completeResetSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid password data',
                errors: validation.error.errors,
            });
            return;
        }

        const [user] = await UserServices.getUserById(req.session.userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        // This endpoint only completes a pending forced reset. It must never be a way
        // to set a new password without the current one — that path stays on
        // PATCH /me/password. The session reaching here was created by logging in with
        // the temporary password, which is the proof of possession.
        if (!user.mustResetPassword) {
            res.status(409).json({ message: 'No password reset is pending' });
            return;
        }

        await UserServices.changeUserPassword(user.id, validation.data.newPassword);

        res.json({ success: true });
    } catch (error) {
        console.error('Error completing password reset:', error);
        res.status(500).json({ message: 'Error completing password reset' });
    }
}

export async function forgotPassword(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    // Always responds with the same generic message regardless of whether the
    // email exists, to avoid leaking which addresses have accounts.
    const genericResponse = {
        message: 'If an account exists for that email, a temporary password has been sent.',
    };

    try {
        const validation = forgotPasswordSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid email',
                errors: validation.error.errors,
            });
            return;
        }

        const { email } = validation.data;
        const [user] = await UserServices.getUserByEmail(email);

        if (user) {
            const tempPassword = generateTempPassword();
            await UserServices.resetUserPassword(user.email, tempPassword);
            await sendTempPasswordEmail(user.email, tempPassword);
        }

        res.json(genericResponse);
    } catch (error) {
        console.error('Error processing forgot-password request:', error);
        res.json(genericResponse);
    }
}
