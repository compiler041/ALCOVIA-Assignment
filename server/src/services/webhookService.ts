/**
 * Webhook service – fires an n8n webhook exactly once per successful
 * focus session. Deduplication is handled via the notifications_sent table.
 */

import type Database from "better-sqlite3";
import type { RewardState } from "./rewardService.js";

// Default: use the built-in mock WhatsApp endpoint on this server.
// To use real n8n: set N8N_WEBHOOK_URL=http://localhost:5678/webhook/focus-success
const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "http://localhost:3001/api/mock-whatsapp/webhook/focus-success";

export interface WebhookPayload {
  sessionId: string;
  studentId: string;
  streak: number;
  coins: number;
  todayMinutes: number;
  message: string;
}

/**
 * Fire the n8n webhook for a successful focus session if we haven't
 * already sent a notification for it.
 *
 * This function uses its own check-then-insert pattern against the
 * notifications_sent table. The caller should ensure it runs inside a
 * DB transaction so the check + insert is atomic.
 */
export async function fireWebhookIfNeeded(
  db: Database.Database,
  sessionId: string,
  studentId: string,
  rewards: RewardState
): Promise<void> {
  // 1. Check if we already sent a notification for this session
  const existing = db
    .prepare("SELECT session_id FROM notifications_sent WHERE session_id = ?")
    .get(sessionId);

  if (existing) {
    return; // already sent
  }

  // 2. Build payload
  const payload: WebhookPayload = {
    sessionId,
    studentId,
    streak: rewards.streak,
    coins: rewards.coins,
    todayMinutes: rewards.todayMinutes,
    message: `Streak now ${rewards.streak} days! +50 coins earned.`,
  };

  // 3. Record that we're sending (insert BEFORE the HTTP call so that
  //    even if the call fails and is retried later we don't double-send).
  db.prepare(
    "INSERT INTO notifications_sent (session_id, student_id) VALUES (?, ?)"
  ).run(sessionId, studentId);

  // 4. Fire the webhook (best-effort, don't crash on failure)
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(
        `[webhook] n8n responded ${res.status} for session ${sessionId}`
      );
    } else {
      console.log(`[webhook] Sent notification for session ${sessionId}`);
    }
  } catch (err) {
    // Log but don't throw – the notification is already recorded so we
    // won't retry on the next sync.
    console.warn(`[webhook] Failed to reach n8n for session ${sessionId}:`, err);
  }
}
