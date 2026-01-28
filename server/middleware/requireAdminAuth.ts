import { users } from "@database/schemas/users.schema";
import { Request, Response, NextFunction } from "express";
import { db } from "server/storage";
import { eq } from "drizzle-orm";

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Check if user is logged in
    if (!req.session.userId) {
      console.error(
        `[AUTH DENIED] No user session for ${req.path}, Session ID: ${req.sessionID}`,
      );
      return res.status(401).json({ message: "Unauthorized - Please log in" });
    }

    // Check if user is admin
    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!user || !user.isAdmin) {
      console.error(
        `[AUTH DENIED] User ${req.session.userId} is not an admin for ${req.path}`,
      );
      return res
        .status(403)
        .json({ message: "Forbidden - Admin access required" });
    }

    console.log(
      `[AUTH GRANTED] Admin user ${req.session.userId} accessing ${req.path}`,
    );
    next();
  } catch (error) {
    console.error("[AUTH ERROR]", error);
    res.status(500).json({ message: "Error checking admin status" });
  }
}