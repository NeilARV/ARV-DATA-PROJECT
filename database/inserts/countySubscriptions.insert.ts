import { createInsertSchema } from 'drizzle-zod';
import { userCountySubscriptions } from '../schemas';

// The DB-shaped insert (drizzle-zod): the timestamps are DB-defaulted, so callers never supply them.
export const insertUserCountySubscriptionSchema = createInsertSchema(userCountySubscriptions).omit({
    createdAt: true,
    updatedAt: true,
});
