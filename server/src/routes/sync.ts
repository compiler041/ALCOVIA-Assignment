/**
 * POST /api/sync – Push/pull event synchronisation endpoint.
 *
 * Flow:
 *   1. Open a DB transaction
 *   2. Insert each incoming event (skip duplicates by id)
 *   3. Identify new successful focus sessions for webhook firing
 *   4. Compute reward state from ALL successful sessions for this student
 *   5. Return unseen events + computed rewards
 *   6. Commit transaction
 *   7. Fire webhooks (async, outside transaction)
 */

import { Router, type Request, type Response } from "express";
import { getDb, nextServerVersion, currentServerVersion } from "../db.js";
import {
  computeRewards,
  type FocusSessionPayload,
} from "../services/rewardService.js";
import { fireWebhookIfNeeded } from "../services/webhookService.js";
import { mergeHLC, createHLC, type HLCTimestamp } from "../hlc.js";

export const syncRouter = Router();

// ── Types ───────────────────────────────────────────────────────────────────

interface IncomingEvent {
  id: string;
  type: string;                       // 'focus_session' | 'task_status' | …
  payload: Record<string, unknown>;
  deviceId: string;
  studentId: string;
  hlc: HLCTimestamp;
}

interface SyncRequest {
  deviceId: string;
  studentId: string;
  lastSyncVersion: number;
  events: IncomingEvent[];
}

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

// ── Handler ─────────────────────────────────────────────────────────────────

syncRouter.post("/", (req: Request, res: Response): void => {
  try {
    const body = req.body as SyncRequest;
    const { deviceId, studentId, lastSyncVersion = 0, events = [] } = body;

    if (!deviceId || !studentId) {
      res.status(400).json({ error: "deviceId and studentId are required" });
      return;
    }

    const db = getDb();

    // Maintain a server-side HLC for merging
    let serverHLC = createHLC("server");

    // Prepared statements
    const checkExists = db.prepare("SELECT id FROM events WHERE id = ?");
    const insertEvent = db.prepare(`
      INSERT INTO events (id, type, payload, device_id, student_id,
                          hlc_ts, hlc_counter, hlc_node, server_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Track newly-inserted successful sessions for webhook
    const newSuccessfulSessionIds: string[] = [];

    // ── Transaction ──────────────────────────────────────────────────────
    const runSync = db.transaction(() => {
      for (const evt of events) {
        // Idempotent: skip if already stored
        if (checkExists.get(evt.id)) continue;

        // Merge HLC
        if (evt.hlc) {
          serverHLC = mergeHLC(serverHLC, evt.hlc);
        }

        // Assign next monotonic server_version
        const sv = nextServerVersion(db);

        const payloadStr =
          typeof evt.payload === "string"
            ? evt.payload
            : JSON.stringify(evt.payload);

        insertEvent.run(
          evt.id,
          evt.type,
          payloadStr,
          evt.deviceId || deviceId,
          evt.studentId || studentId,
          evt.hlc?.ts ?? serverHLC.ts,
          evt.hlc?.counter ?? serverHLC.counter,
          evt.hlc?.node ?? deviceId,
          sv
        );

        // Check if this is a successful focus session
        if (evt.type === "focus_session") {
          const p = typeof evt.payload === "string"
            ? JSON.parse(evt.payload) as FocusSessionPayload
            : evt.payload as unknown as FocusSessionPayload;
          if (p.status === "success") {
            newSuccessfulSessionIds.push(evt.id);
          }
        }
      }

      // ── Fetch events the client hasn't seen ────────────────────────────
      const unseen = db
        .prepare(
          `SELECT * FROM events
           WHERE student_id = ? AND server_version > ?
           ORDER BY server_version ASC`
        )
        .all(studentId, lastSyncVersion) as StoredEvent[];

      // ── Compute rewards from ALL successful sessions ───────────────────
      const allSessionRows = db
        .prepare(
          `SELECT payload FROM events
           WHERE student_id = ? AND type = 'focus_session'`
        )
        .all(studentId) as { payload: string }[];

      const successfulPayloads: FocusSessionPayload[] = [];
      for (const row of allSessionRows) {
        try {
          const p = JSON.parse(row.payload) as FocusSessionPayload;
          if (p.status === "success") {
            successfulPayloads.push(p);
          }
        } catch {
          // skip malformed payloads
        }
      }

      const rewards = computeRewards(successfulPayloads);
      const latestVersion = currentServerVersion(db);

      return { unseen, rewards, latestVersion, successfulPayloads };
    });

    const result = runSync();

    // ── Format response ──────────────────────────────────────────────────
    const responseEvents = result.unseen.map((e: StoredEvent) => ({
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
      events: responseEvents,
      serverVersion: result.latestVersion,
      rewards: result.rewards,
    });

    // ── Fire webhooks asynchronously (outside the response) ──────────────
    if (newSuccessfulSessionIds.length > 0) {
      const rewards = result.rewards;
      setImmediate(() => {
        for (const sid of newSuccessfulSessionIds) {
          fireWebhookIfNeeded(db, sid, studentId, rewards).catch((err) =>
            console.error("[sync] webhook error:", err)
          );
        }
      });
    }
  } catch (err) {
    console.error("[sync] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Utils ───────────────────────────────────────────────────────────────────

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
