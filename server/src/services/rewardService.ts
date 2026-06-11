/**
 * Reward computation service.
 *
 * All functions are pure – they derive rewards from the full set of
 * successful focus-session events for a student. Rewards are never
 * stored; they are always recomputed.
 */

export interface FocusSessionPayload {
  sessionId?: string;
  startTime: string;           // ISO-8601
  endTime?: string;            // ISO-8601
  targetDuration: number;      // minutes
  actualDuration?: number;     // minutes
  status: 'success' | 'failed';
  failReason?: 'give_up' | 'app_switch';
  [key: string]: unknown;
}

export interface RewardState {
  streak: number;
  coins: number;
  todayMinutes: number;
}

/**
 * Compute the full reward state from an array of successful focus-session
 * event payloads.
 */
export function computeRewards(sessions: FocusSessionPayload[]): RewardState {
  return {
    streak: computeStreak(sessions),
    coins: computeCoins(sessions),
    todayMinutes: computeTodayMinutes(sessions),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Streak = number of consecutive calendar days (counting backward from today)
 * that have at least one successful session.
 */
export function computeStreak(sessions: FocusSessionPayload[]): number {
  if (sessions.length === 0) return 0;

  // Collect unique calendar dates (YYYY-MM-DD in local time)
  const dateSet = new Set<string>();
  for (const s of sessions) {
    const d = toDateString(s.startTime);
    if (d) dateSet.add(d);
  }

  if (dateSet.size === 0) return 0;

  // Walk backward from today
  const today = todayDateString();
  let streak = 0;
  let cursor = new Date(today + "T00:00:00");

  while (true) {
    const key = formatDate(cursor);
    if (dateSet.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * 50 coins per unique successful session.
 */
export function computeCoins(sessions: FocusSessionPayload[]): number {
  // Deduplicate by sessionId if present, otherwise count all
  const seen = new Set<string>();
  let count = 0;
  for (const s of sessions) {
    const key = s.sessionId ?? JSON.stringify(s);
    if (!seen.has(key)) {
      seen.add(key);
      count++;
    }
  }
  return count * 50;
}

/**
 * Sum of targetDuration for today's successful sessions.
 */
export function computeTodayMinutes(sessions: FocusSessionPayload[]): number {
  const today = todayDateString();
  let total = 0;
  for (const s of sessions) {
    if (toDateString(s.startTime) === today) {
      total += s.targetDuration ?? 0;
    }
  }
  return total;
}

// ─── Date utilities ─────────────────────────────────────────────────────────

function todayDateString(): string {
  return formatDate(new Date());
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateString(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return formatDate(d);
  } catch {
    return null;
  }
}
