/**
 * Focus session store — manages focus session state and derives rewards.
 */

import { v4 as uuidv4 } from 'uuid';
import { StorageManager } from './storage';
import { HLCTimestamp, tickHLC } from '../crdt/hlc';
import { SyncEvent, FocusSessionPayload, RewardState } from '../crdt/types';

const STUDENT_ID = 'student-1';

export interface ActiveSession {
  startTime: Date;
  targetDuration: number; // minutes
  timeRemaining: number;  // seconds
}

/**
 * Create a focus session completion event (success or failure)
 */
export function createFocusSessionEvent(
  deviceId: string,
  hlc: HLCTimestamp,
  targetDuration: number,
  actualDuration: number,
  status: 'success' | 'failed',
  startTime: Date,
  failReason?: 'give_up' | 'app_switch'
): { event: SyncEvent; newHlc: HLCTimestamp } {
  const newHlc = tickHLC(hlc);
  const event: SyncEvent = {
    id: uuidv4(),
    type: 'focus_session',
    payload: {
      targetDuration,
      actualDuration,
      status,
      failReason,
      startTime: startTime.toISOString(),
      endTime: new Date().toISOString(),
    } as FocusSessionPayload,
    deviceId,
    studentId: STUDENT_ID,
    hlc: newHlc,
  };
  return { event, newHlc };
}

/**
 * Compute rewards from local events (pure function).
 */
export function computeLocalRewards(events: SyncEvent[]): RewardState {
  const successfulSessions = events
    .filter(e => e.type === 'focus_session')
    .map(e => e.payload as FocusSessionPayload)
    .filter(p => p.status === 'success');

  return {
    streak: computeStreak(successfulSessions),
    coins: successfulSessions.length * 50,
    todayMinutes: computeTodayMinutes(successfulSessions),
  };
}

function computeStreak(sessions: FocusSessionPayload[]): number {
  if (sessions.length === 0) return 0;

  const dateSet = new Set<string>();
  for (const s of sessions) {
    const d = toDateString(s.startTime);
    if (d) dateSet.add(d);
  }

  if (dateSet.size === 0) return 0;

  const today = formatDate(new Date());
  let streak = 0;
  const cursor = new Date(today + 'T00:00:00');

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

function computeTodayMinutes(sessions: FocusSessionPayload[]): number {
  const today = formatDate(new Date());
  let total = 0;
  for (const s of sessions) {
    if (toDateString(s.startTime) === today) {
      total += s.targetDuration || 0;
    }
  }
  return total;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateString(iso: string): string | null {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return formatDate(d);
  } catch {
    return null;
  }
}

/**
 * Get all focus session events
 */
export function getFocusSessions(events: SyncEvent[]): (SyncEvent & { payload: FocusSessionPayload })[] {
  return events
    .filter(e => e.type === 'focus_session')
    .map(e => e as SyncEvent & { payload: FocusSessionPayload });
}
