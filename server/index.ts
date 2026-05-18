import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";

// Bootstrap GCP credentials dynamically from env variable on Serverless / Railway
if (process.env.GOOGLE_CREDS_JSON) {
  try {
    const credsPath = path.join("/tmp", "gcp-creds.json");
    // Validate it's proper JSON and clean up any potential wrapping quotes or newlines
    const parsed = JSON.parse(process.env.GOOGLE_CREDS_JSON.trim());
    fs.writeFileSync(credsPath, JSON.stringify(parsed, null, 2));
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
    console.log("[GCP] Dynamically loaded and validated credentials from GOOGLE_CREDS_JSON");

    // Automatically set GCP_PROJECT_ID from the service account JSON if not explicitly configured in env
    if (parsed.project_id && !process.env.GCP_PROJECT_ID) {
      process.env.GCP_PROJECT_ID = parsed.project_id;
      console.log(`[GCP] Automatically configured GCP_PROJECT_ID from credentials: ${parsed.project_id}`);
    }
  } catch (err: any) {
    console.error("[GCP] Failed to write dynamic credentials. Make sure GOOGLE_CREDS_JSON is valid JSON:", err.message);
  }
}

import { createServer } from "http";
import express, { type Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

(globalThis as any).WebSocket = WebSocket;

import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { cleanupExpiredSessions } from "./services/vectorStoreService";

console.log("DB URL:", process.env.DATABASE_URL);
console.log("cwd:", process.cwd());

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

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

      log(logLine);
    }
  });

  next();
});

// Middleware to extract Supabase JWT and inject userId into req.body
app.use("/api", async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL || "",
        process.env.VITE_SUPABASE_ANON_KEY || "",
        {
          auth: { persistSession: false }
        }
      );
      
      const { data, error } = await supabase.auth.getUser(token);
      if (error) {
        console.error("Supabase getUser error:", error.message);
      } else if (data?.user) {
        req.body.userId = data.user.id; // Inject userId so schemas can parse it
      }
    } catch (err) {
      console.error("JWT verification failed:", err);
    }
  }
  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Run cleanup every hour
  setInterval(() => {
    cleanupExpiredSessions().catch(console.error);
  }, 1000 * 60 * 60);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
