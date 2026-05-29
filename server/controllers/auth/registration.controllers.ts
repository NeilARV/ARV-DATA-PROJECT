import { Request, Response, NextFunction } from "express";
import { insertUserSchema } from "@database/inserts";
import { UserServices } from "server/services/auth";
import { getMsaNameFromCounty } from "server/utils/countyToMsa";
import { db } from "server/storage";
import { msas } from "@database/schemas/msas.schema";
import { eq } from "drizzle-orm";


export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {

        const validation = insertUserSchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                message: "Invalid signup data",
                errors: validation.error.errors,
            });
            return;
        }

        const { firstName, lastName, phone, email, password, county, state } = validation.data;
        const normalizedCounty = county || null;
        const normalizedState = state || null;

        const existingUser = await UserServices.getUserByEmail(email);

        if (existingUser.length > 0) {
            res.status(409).json({ message: "An account with this email already exists" });
            return;
        }

        const subscriptionListEntry = await UserServices.checkEmailSubscriptionList(email);
        console.log('[signup] email lookup:', email.toLowerCase().trim(), '→ found:', !!subscriptionListEntry, subscriptionListEntry ? `(rm: ${subscriptionListEntry.relationshipManagerId ?? 'none'})` : '');

        const subscriptionId: number | null = subscriptionListEntry ? 1 : null;

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
        console.log('[signup] user created:', newUser.id, 'subscriptionId:', newUser.subscriptionId);

        if (subscriptionListEntry?.relationshipManagerId) {
            await UserServices.addUserRelationshipManager(newUser.id, subscriptionListEntry.relationshipManagerId);
            console.log('[signup] linked RM:', subscriptionListEntry.relationshipManagerId);
        }

        if (subscriptionListEntry) {
            await UserServices.removeEmailFromSubscriptionList(subscriptionListEntry.id);
            console.log('[signup] removed from subscription list:', subscriptionListEntry.id);
        }

        await UserServices.upsertUserNotificationPreferences(newUser.id, {
            dataAppStatusFilter: ['in-renovation', 'wholesale'],
            dealTypeFilter: ['wholesale', 'agent', 'sold'],
        });

        if (normalizedCounty) {
            const msaName = getMsaNameFromCounty(normalizedCounty);
            if (msaName) {
                const [msaRow] = await db
                    .select({ id: msas.id })
                    .from(msas)
                    .where(eq(msas.name, msaName))
                    .limit(1);
                if (msaRow) {
                    await UserServices.addUserMsaSubscription(newUser.id, msaRow.id);
                }
            }
        }

        req.session.userId = newUser.id;

        res.status(201).json({
            success: true,
            user: newUser,
        });

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Error creating account" });
    }
}
