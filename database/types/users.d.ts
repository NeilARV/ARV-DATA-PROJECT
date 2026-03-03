import { z } from "zod";
import { users, emailWhitelist } from "../schemas/users.schema";
import { 
  insertUserSchema, 
  insertEmailWhitelistSchema, 
  loginSchema 
} from "../inserts/users.insert";
import { updateUserProfileSchema } from "../updates/users.update";

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type EmailWhitelist = typeof emailWhitelist.$inferSelect;
export type InsertEmailWhitelist = z.infer<typeof insertEmailWhitelistSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;