import { createServer } from 'http';
import { setupVite, serveStatic, log } from './vite';
import { NeonSessionStore } from './session-store';
import { db } from './storage';
import { sessions } from '@database/schemas/users.schema';
import { startScheduledJobs } from './jobs';
import { createApp } from './app';
import { initWebSocket } from './websocket';
import dotenv from 'dotenv';

dotenv.config();

declare module 'http' {
    interface IncomingMessage {
        rawBody: unknown;
    }
}

if (!process.env.SESSION_SECRET) {
    console.error(
        'FATAL: SESSION_SECRET environment variable is not set. This is required for secure admin authentication.',
    );
    process.exit(1);
}

(async () => {
    const sessionStore = new NeonSessionStore({
        ttl: 24 * 60 * 60 * 1000,
    });

    setInterval(
        () => {
            sessionStore
                .cleanup()
                .catch((err) => console.error('[SessionStore] Cleanup error:', err));
        },
        60 * 60 * 1000,
    );

    const app = createApp({ sessionStore });

    try {
        const existingSessions = await db.select().from(sessions).limit(1);
        console.log(
            `[Startup] Sessions table verified. Found ${existingSessions.length} existing sessions.`,
        );
    } catch (error) {
        console.error(
            '[Startup] ERROR: Sessions table not accessible. Run npm run db:push to create it.',
        );
        console.error('[Startup] Session error details:', error);
    }

    const server = createServer(app);

    const isDevelopment = app.get('env') === 'development';
    initWebSocket(server, sessionStore, { isDevelopment });

    if (isDevelopment) {
        await setupVite(app, server);
    } else {
        serveStatic(app);
    }

    const port = parseInt(process.env.PORT || '5001', 10);
    const isProduction = process.env.NODE_ENV === 'production';
    const host = isProduction ? '0.0.0.0' : '127.0.0.1';

    server.listen({ port, host }, () => {
        log(`serving on ${isProduction ? port : `http://localhost:${port}`}`);
        startScheduledJobs();
    });
})();
