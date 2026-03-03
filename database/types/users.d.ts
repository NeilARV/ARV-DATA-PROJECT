import { z } from "zod";
import { users, emailWhitelist } from "../schemas/users.schema";
import { 
  insertUserSchema, 
  insertEmailWhitelistSchema, 
} from "../inserts/users.insert";
import { updateUserProfileSchema } from "../updates/users.update";
import { loginSchema } from "@database/validation/users.validation";
import { insertUserBySignUpSchema } from "../inserts/users.insert";

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type EmailWhitelist = typeof emailWhitelist.$inferSelect;
export type InsertEmailWhitelist = z.infer<typeof insertEmailWhitelistSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof insertUserBySignUpSchema>; 