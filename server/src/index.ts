/**
 * Alcovia server – main entry point.
 *
 * Starts the Express server on port 3001 with CORS, JSON parsing,
 * and all API routes mounted.
 */

import express from "express";
import cors from "cors";
import { initDb } from "./db.js";
import { syncRouter } from "./routes/sync.js";
import { stateRouter, notificationsRouter } from "./routes/state.js";
import { mockNotificationRouter } from "./routes/mockNotification.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Routes ──────────────────────────────────────────────────────────────────

app.use("/api/sync", syncRouter);
app.use("/api/state", stateRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/mock-whatsapp", mockNotificationRouter);

// Health-check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Startup ─────────────────────────────────────────────────────────────────

initDb();
console.log("[db] Database initialized");

app.listen(PORT, () => {
  console.log(`Alcovia server running on port ${PORT}`);
  console.log(`Mock WhatsApp endpoint: http://localhost:${PORT}/api/mock-whatsapp/webhook/focus-success`);
  console.log(`Mock WhatsApp log: http://localhost:${PORT}/api/mock-whatsapp/log`);
});

export default app;
