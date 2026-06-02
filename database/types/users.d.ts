import { z } from 'zod';
import { users, emailSubscriptionList } from '../schemas/users.schema';
import { insertUserSchema, insertEmailSubscriptionListSchema } from '../inserts/users.insert';
import { updateUserProfileSchema } from '../updates/users.update';
import { loginSchema } from '@database/validation/users.validation';
import { insertUserBySignUpSchema } from '../inserts/users.insert';

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type EmailSubscriptionList = typeof emailSubscriptionList.$inferSelect;
export type InsertEmailSubscriptionList = z.infer<typeof insertEmailSubscriptionListSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof insertUserBySignUpSchema>;
