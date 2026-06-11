/**
 * Mock notification endpoint — simulates WhatsApp/n8n notification sink.
 * Logs every notification to console and stores in-memory for the dev panel.
 * 
 * This runs inside the Express server so n8n is NOT required for demo.
 * When real n8n is set up, change N8N_WEBHOOK_URL env var to point there.
 */

import { Router, type Request, type Response } from "express";

export const mockNotificationRouter = Router();

export interface MockNotification {
  sessionId: string;
  studentId: string;
  streak: number;
  coins: number;
  todayMinutes: number;
  message: string;
  receivedAt: string;
  whatsappPayload: {
    to: string;
    text: string;
  };
}

// In-memory store of all notifications (visible via GET /api/mock-notifications)
const notificationLog: MockNotification[] = [];

/**
 * POST /api/mock-whatsapp/webhook/focus-success
 * Simulates the n8n webhook + WhatsApp send
 */
mockNotificationRouter.post("/webhook/focus-success", (req: Request, res: Response): void => {
  const body = req.body;

  const notification: MockNotification = {
    sessionId: body.sessionId || "unknown",
    studentId: body.studentId || "unknown",
    streak: body.streak || 0,
    coins: body.coins || 0,
    todayMinutes: body.todayMinutes || 0,
    message: body.message || "",
    receivedAt: new Date().toISOString(),
    whatsappPayload: {
      to: "+91-STUDENT-PHONE",
      text: `🎯 Alcovia Focus Alert!\n\n${body.message}\n\n📊 Stats:\n🔥 Streak: ${body.streak} days\n🪙 Coins: ${body.coins}\n⏱️ Today: ${body.todayMinutes} min\n\nKeep going! 💪`,
    },
  };

  notificationLog.push(notification);

  // ======= THIS IS THE "WHATSAPP MESSAGE" =======
  console.log("\n" + "=".repeat(60));
  console.log("📱 WHATSAPP MESSAGE SENT (Mock)");
  console.log("=".repeat(60));
  console.log(`To: ${notification.whatsappPayload.to}`);
  console.log(`Message:\n${notification.whatsappPayload.text}`);
  console.log(`Session ID: ${notification.sessionId}`);
  console.log(`Time: ${notification.receivedAt}`);
  console.log("=".repeat(60) + "\n");

  res.json({
    success: true,
    sessionId: body.sessionId,
    message: "WhatsApp notification sent (mock)",
    deduplicated: false,
  });
});

/**
 * GET /api/mock-whatsapp/log
 * Returns all mock notifications for dev panel inspection
 */
mockNotificationRouter.get("/log", (_req: Request, res: Response): void => {
  res.json({
    count: notificationLog.length,
    notifications: notificationLog,
  });
});

/**
 * GET /api/mock-whatsapp/log/:studentId
 * Returns notifications for a specific student
 */
mockNotificationRouter.get("/log/:studentId", (req: Request, res: Response): void => {
  const filtered = notificationLog.filter(n => n.studentId === req.params.studentId);
  res.json({
    count: filtered.length,
    notifications: filtered,
  });
});
