import { z } from 'zod';
import { userCountySubscriptions } from '../schemas/msas.schema';
import { insertUserCountySubscriptionSchema } from '../inserts/countySubscriptions.insert';

export type UserCountySubscription = typeof userCountySubscriptions.$inferSelect;
export type InsertUserCountySubscription = z.infer<typeof insertUserCountySubscriptionSchema>;
export type { CountySubscriptionInput } from '../validation/countySubscriptions.validation';
