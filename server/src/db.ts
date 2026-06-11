/**
 * Database module – SQLite via better-sqlite3 (synchronous API).
 *
 * Tables:
 *   events              – immutable CRDT event log
 *   server_version_seq  – monotonic counter for server_version assignment
 *   notifications_sent  – deduplication table for n8n webhook calls
 */

import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.resolve(
  process.env.ALCOVIA_DB_PATH || path.join(process.cwd(), "alcovia.db")
);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);

  // Enable WAL for better concurrent read performance
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  return _db;
}

/**
 * Initialise all tables. Safe to call multiple times (IF NOT EXISTS).
 */
export function initDb(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id              TEXT PRIMARY KEY,
      type            TEXT NOT NULL,
      payload         TEXT NOT NULL,
      device_id       TEXT NOT NULL,
      student_id      TEXT NOT NULL,
      hlc_ts          INTEGER NOT NULL,
      hlc_counter     INTEGER NOT NULL,
      hlc_node        TEXT NOT NULL,
      server_version  INTEGER NOT NULL,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_student
      ON events(student_id);

    CREATE INDEX IF NOT EXISTS idx_events_server_version
      ON events(server_version);

    CREATE TABLE IF NOT EXISTS server_version_seq (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      value INTEGER NOT NULL DEFAULT 0
    );

    -- Seed the sequence row if it doesn't exist
    INSERT OR IGNORE INTO server_version_seq (id, value) VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS notifications_sent (
      session_id  TEXT PRIMARY KEY,
      student_id  TEXT NOT NULL,
      sent_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_student
      ON notifications_sent(student_id);
  `);
}

/**
 * Atomically claim the next server_version value.
 * Must be called inside an existing transaction.
 */
export function nextServerVersion(db: Database.Database): number {
  const stmt = db.prepare(
    "UPDATE server_version_seq SET value = value + 1 WHERE id = 1"
  );
  stmt.run();

  const row = db.prepare("SELECT value FROM server_version_seq WHERE id = 1").get() as {
    value: number;
  };
  return row.value;
}

/**
 * Get the current (latest) server_version without incrementing.
 */
export function currentServerVersion(db: Database.Database): number {
  const row = db.prepare("SELECT value FROM server_version_seq WHERE id = 1").get() as {
    value: number;
  };
  return row.value;
}
