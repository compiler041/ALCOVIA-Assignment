/**
 * Debug / state inspection routes.
 *
 * GET /api/state/:studentId          – full computed state for a student
 * GET /api/notifications/:studentId  – webhook notification log
 */

import { Router, type Request, type Response } from "express";
import { getDb } from "../db.js";
import {
  computeRewards,
  type FocusSessionPayload,
} from "../services/rewardService.js";

export const stateRouter = Router();
export const notificationsRouter = Router();

// ── Types ───────────────────────────────────────────────────────────────────

interface StoredEvent {
  id: string;
  type: string;
  payload: string;
  device_id: string;
  student_id: string;
  hlc_ts: number;
  hlc_counter: number;
  hlc_node: string;
  server_version: number;
  created_at: string;
}

interface TaskStatusPayload {
  taskId: string;
  status: string;
  [key: string]: unknown;
}

interface NotificationRow {
  session_id: string;
  student_id: string;
  sent_at: string;
}

// ── GET /api/state/:studentId ───────────────────────────────────────────────

stateRouter.get("/:studentId", (req: Request, res: Response): void => {
  try {
    const { studentId } = req.params;
    const db = getDb();

    // 1. All events for this student
    const allEvents = db
      .prepare(
        `SELECT * FROM events WHERE student_id = ? ORDER BY server_version ASC`
      )
      .all(studentId) as StoredEvent[];

    // 2. Compute rewards from successful focus sessions
    const successfulPayloads: FocusSessionPayload[] = [];
    for (const e of allEvents) {
      if (e.type === "focus_session") {
        try {
          const p = JSON.parse(e.payload) as FocusSessionPayload;
          if (p.status === "success") {
            successfulPayloads.push(p);
          }
        } catch {
          // skip
        }
      }
    }
    const rewards = computeRewards(successfulPayloads);

    // 3. Resolve task statuses via Last-Writer-Wins (by HLC)
    const taskStatuses = resolveTaskStatuses(allEvents);

    // 4. Notification log for this student
    const notifications = db
      .prepare(
        `SELECT * FROM notifications_sent WHERE student_id = ? ORDER BY sent_at DESC`
      )
      .all(studentId) as NotificationRow[];

    // 5. Format events for output
    const formattedEvents = allEvents.map((e) => ({
      id: e.id,
      type: e.type,
      payload: safeJsonParse(e.payload),
      deviceId: e.device_id,
      studentId: e.student_id,
      hlc: { ts: e.hlc_ts, counter: e.hlc_counter, node: e.hlc_node },
      serverVersion: e.server_version,
      createdAt: e.created_at,
    }));

    res.json({
      studentId,
      eventCount: allEvents.length,
      events: formattedEvents,
      rewards,
      taskStatuses,
      notifications,
    });
  } catch (err) {
    console.error("[state] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/notifications/:studentId ───────────────────────────────────────

notificationsRouter.get("/:studentId", (req: Request, res: Response): void => {
  try {
    const { studentId } = req.params;
    const db = getDb();

    const notifications = db
      .prepare(
        `SELECT * FROM notifications_sent WHERE student_id = ? ORDER BY sent_at DESC`
      )
      .all(studentId) as NotificationRow[];

    res.json({
      studentId,
      count: notifications.length,
      notifications,
    });
  } catch (err) {
    console.error("[notifications] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve task statuses using Last-Writer-Wins with HLC ordering.
 * For each taskId we keep only the event with the highest HLC.
 */
function resolveTaskStatuses(
  events: StoredEvent[]
): Record<string, { status: string; updatedBy: string; hlc: { ts: number; counter: number; node: string } }> {
  const taskMap = new Map<
    string,
    { status: string; updatedBy: string; hlc_ts: number; hlc_counter: number; hlc_node: string }
  >();

  for (const e of events) {
    if (e.type !== "task_status") continue;

    let p: TaskStatusPayload;
    try {
      p = JSON.parse(e.payload) as TaskStatusPayload;
    } catch {
      continue;
    }

    const existing = taskMap.get(p.taskId);
    if (!existing) {
      taskMap.set(p.taskId, {
        status: p.status,
        updatedBy: e.device_id,
        hlc_ts: e.hlc_ts,
        hlc_counter: e.hlc_counter,
        hlc_node: e.hlc_node,
      });
      continue;
    }

    // Compare HLC: ts → counter → node
    if (
      e.hlc_ts > existing.hlc_ts ||
      (e.hlc_ts === existing.hlc_ts && e.hlc_counter > existing.hlc_counter) ||
      (e.hlc_ts === existing.hlc_ts &&
        e.hlc_counter === existing.hlc_counter &&
        e.hlc_node > existing.hlc_node)
    ) {
      taskMap.set(p.taskId, {
        status: p.status,
        updatedBy: e.device_id,
        hlc_ts: e.hlc_ts,
        hlc_counter: e.hlc_counter,
        hlc_node: e.hlc_node,
      });
    }
  }

  const result: Record<
    string,
    { status: string; updatedBy: string; hlc: { ts: number; counter: number; node: string } }
  > = {};
  for (const [taskId, val] of taskMap) {
    result[taskId] = {
      status: val.status,
      updatedBy: val.updatedBy,
      hlc: { ts: val.hlc_ts, counter: val.hlc_counter, node: val.hlc_node },
    };
  }
  return result;
}

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
