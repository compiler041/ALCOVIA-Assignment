/**
 * Event types for the CRDT sync protocol.
 */

import { HLCTimestamp } from './hlc';

export type EventType = 'focus_session' | 'task_status';

export interface FocusSessionPayload {
  targetDuration: number;   // minutes
  actualDuration: number;   // minutes
  status: 'success' | 'failed';
  failReason?: 'give_up' | 'app_switch';
  startTime: string;        // ISO string
  endTime: string;          // ISO string
}

export interface TaskStatusPayload {
  taskId: string;
  subjectId: string;
  chapterId: string;
  newStatus: 'not_started' | 'in_progress' | 'done';
  deleted?: boolean;
}

export interface SyncEvent {
  id: string;
  type: EventType;
  payload: FocusSessionPayload | TaskStatusPayload;
  deviceId: string;
  studentId: string;
  hlc: HLCTimestamp;
  serverVersion?: number;
}

export interface RewardState {
  streak: number;
  coins: number;
  todayMinutes: number;
}

export interface SyncResponse {
  events: SyncEvent[];
  serverVersion: number;
  rewards: RewardState;
}

// Hardcoded syllabus structure
export interface TaskDef {
  id: string;
  title: string;
  chapterId: string;
  subjectId: string;
}

export interface ChapterDef {
  id: string;
  title: string;
  subjectId: string;
  tasks: TaskDef[];
}

export interface SubjectDef {
  id: string;
  title: string;
  chapters: ChapterDef[];
}

export type TaskStatus = 'not_started' | 'in_progress' | 'done';

export interface ResolvedTask {
  id: string;
  title: string;
  chapterId: string;
  subjectId: string;
  status: TaskStatus;
  deleted: boolean;
}
