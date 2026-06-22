import express, { type Request, type RequestHandler } from 'express';
import session from 'express-session';
import apiRoutes from './routes/index';
import { errorHandler } from './middleware/errorHandler';

declare module 'express-session' {
    interface SessionData {
        isAdminAuthenticated?: boolean;
        userId?: string;
    }
}

interface AppOptions {
    sessionStore?: session.Store;
    /** Middleware injected after session setup — used in tests to set req.session.userId */
    testMiddleware?: RequestHandler;
}

export function createApp(options: AppOptions = {}) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        throw new Error('SESSION_SECRET environment variable is not set.');
    }

    const app = express();
    app.set('trust proxy', 1);

    app.use(
        express.json({
            limit: '50mb',
            verify: (req, _res, buf) => {
                (req as Request & { rawBody: unknown }).rawBody = buf;
            },
        }),
    );
    app.use(express.urlencoded({ extended: false, limit: '50mb' }));

    app.use((req, res, next) => {
        req.setTimeout(15 * 60 * 1000);
        res.setTimeout(15 * 60 * 1000);
        next();
    });

    app.use(
        session({
            store: options.sessionStore,
            secret,
            resave: false,
            saveUninitialized: false,
            proxy: true,
            cookie: {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/',
            },
        }),
    );

    if (options.testMiddleware) {
        app.use(options.testMiddleware);
    }

    app.use((req, res, next) => {
        const start = Date.now();
        const reqPath = req.path;
        let capturedJsonResponse: Record<string, unknown> | undefined;

        const originalResJson = res.json;
        res.json = function (bodyJson, ...args) {
            capturedJsonResponse = bodyJson as Record<string, unknown>;
            return originalResJson.apply(res, [bodyJson, ...args]);
        };

        res.on('finish', () => {
            const duration = Date.now() - start;
            if (reqPath.startsWith('/api')) {
                let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
                if (capturedJsonResponse) {
                    logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
                }
                if (logLine.length > 80) logLine = logLine.slice(0, 79) + '…';
                console.log(
                    `${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })} [express] ${logLine}`,
                );
            }
        });

        next();
    });

    app.use('/api', apiRoutes);

    app.use(errorHandler);

    return app;
}
