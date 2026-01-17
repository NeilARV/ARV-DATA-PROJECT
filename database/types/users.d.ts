import { z } from "zod";
import { users, emailWhitelist } from "../schema/users.schema";
import { 
  insertUserSchema, 
  insertEmailWhitelistSchema, 
  loginSchema 
} from "../insert/users.insert";
import { updateUserProfileSchema } from "../update/users.update";

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type EmailWhitelist = typeof emailWhitelist.$inferSelect;
export type InsertEmailWhitelist = z.infer<typeof insertEmailWhitelistSchema>;