import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { NeonSessionStore } from "./session-store";
import { db } from "./storage";
import { sessions } from "@shared/schema";

const app = express();

app.set('trust proxy', 1);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

declare module 'express-session' {
  interface SessionData {
    isAdminAuthenticated?: boolean;
    userId?: string;
  }
}

app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Set longer timeout for large uploads and processing
app.use((req, res, next) => {
  req.setTimeout(15 * 60 * 1000); // 15 minute timeout for uploads
  res.setTimeout(15 * 60 * 1000);
  next();
});

// Enforce SESSION_SECRET is set
if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is not set. This is required for secure admin authentication.');
  process.exit(1);
}

// Create database-backed session store for production persistence
const sessionStore = new NeonSessionStore({ 
  ttl: 24 * 60 * 60 * 1000  // 24 hour session lifetime
});

// Clean up expired sessions every hour
setInterval(() => {
  sessionStore.cleanup().catch(err => 
    console.error('[SessionStore] Cleanup error:', err)
  );
}, 60 * 60 * 1000);

// Session middleware for admin authentication
app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,  // Don't save session if unmodified (store handles it)
    saveUninitialized: false,  // Don't create session until something stored
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    },
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Verify sessions table is accessible on startup
  try {
    const existingSessions = await db.select().from(sessions).limit(1);
    console.log(`[Startup] Sessions table verified. Found ${existingSessions.length} existing sessions.`);
  } catch (error) {
    console.error('[Startup] ERROR: Sessions table not accessible. Run npm run db:push to create it.');
    console.error('[Startup] Session error details:', error);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
