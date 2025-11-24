import { Store } from 'express-session';
import { db } from './storage';
import { sessions } from '@shared/schema';
import { eq, lt } from 'drizzle-orm';

interface SessionStoreOptions {
  ttl?: number; // Time to live in milliseconds
}

export class NeonSessionStore extends Store {
  private ttl: number;

  constructor(options: SessionStoreOptions = {}) {
    super();
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // Default 24 hours
  }

  async get(sid: string, callback: (err: any, session?: any) => void): Promise<void> {
    try {
      const result = await db
        .select()
        .from(sessions)
        .where(eq(sessions.sid, sid))
        .limit(1);

      if (result.length === 0) {
        return callback(null, undefined);
      }

      const session = result[0];
      const now = Math.floor(Date.now() / 1000);
      
      if (session.expire < now) {
        // Session expired, delete it
        await this.destroy(sid, () => {});
        return callback(null, undefined);
      }

      const sessionData = JSON.parse(session.sess);
      callback(null, sessionData);
    } catch (error) {
      console.error('[SessionStore] Error getting session:', error);
      callback(error);
    }
  }

  async set(sid: string, session: any, callback?: (err?: any) => void): Promise<void> {
    try {
      const expire = Math.floor((Date.now() + this.ttl) / 1000);
      const sess = JSON.stringify(session);

      // Upsert: insert or update
      await db
        .insert(sessions)
        .values({ sid, sess, expire })
        .onConflictDoUpdate({
          target: sessions.sid,
          set: { sess, expire }
        });

      console.log(`[SessionStore] Session saved: ${sid}, expires: ${new Date(expire * 1000).toISOString()}`);
      if (callback) callback(null);
    } catch (error) {
      console.error('[SessionStore] Error setting session:', error);
      if (callback) callback(error);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      await db.delete(sessions).where(eq(sessions.sid, sid));
      console.log(`[SessionStore] Session destroyed: ${sid}`);
      if (callback) callback(null);
    } catch (error) {
      console.error('[SessionStore] Error destroying session:', error);
      if (callback) callback(error);
    }
  }

  async touch(sid: string, session: any, callback?: (err?: any) => void): Promise<void> {
    try {
      const expire = Math.floor((Date.now() + this.ttl) / 1000);
      await db
        .update(sessions)
        .set({ expire })
        .where(eq(sessions.sid, sid));
      
      if (callback) callback(null);
    } catch (error) {
      console.error('[SessionStore] Error touching session:', error);
      if (callback) callback(error);
    }
  }

  async clear(callback?: (err?: any) => void): Promise<void> {
    try {
      await db.delete(sessions);
      console.log('[SessionStore] All sessions cleared');
      if (callback) callback(null);
    } catch (error) {
      console.error('[SessionStore] Error clearing sessions:', error);
      if (callback) callback(error);
    }
  }

  async length(callback: (err: any, length?: number) => void): Promise<void> {
    try {
      const result = await db.select().from(sessions);
      callback(null, result.length);
    } catch (error) {
      console.error('[SessionStore] Error getting length:', error);
      callback(error);
    }
  }

  async all(callback: (err: any, obj?: any) => void): Promise<void> {
    try {
      const result = await db.select().from(sessions);
      const sessionMap: { [sid: string]: any } = {};
      
      for (const row of result) {
        try {
          sessionMap[row.sid] = JSON.parse(row.sess);
        } catch (parseError) {
          console.error(`[SessionStore] Error parsing session ${row.sid}:`, parseError);
        }
      }
      
      callback(null, sessionMap);
    } catch (error) {
      console.error('[SessionStore] Error getting all sessions:', error);
      callback(error);
    }
  }

  // Clean up expired sessions (call this periodically)
  async cleanup(): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const deleted = await db
        .delete(sessions)
        .where(lt(sessions.expire, now))
        .returning();
      
      if (deleted.length > 0) {
        console.log(`[SessionStore] Cleaned up ${deleted.length} expired sessions`);
      }
    } catch (error) {
      console.error('[SessionStore] Error cleaning up sessions:', error);
    }
  }
}
