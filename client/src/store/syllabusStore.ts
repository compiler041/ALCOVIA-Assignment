/**
 * Syllabus store — hardcoded subjects/chapters/tasks + LWW task status resolution.
 */

import { v4 as uuidv4 } from 'uuid';
import { HLCTimestamp, tickHLC, compareHLC } from '../crdt/hlc';
import { SyncEvent, TaskStatusPayload, SubjectDef, ResolvedTask, TaskStatus } from '../crdt/types';

const STUDENT_ID = 'student-1';

/** Hardcoded syllabus data */
export const SYLLABUS: SubjectDef[] = [
  {
    id: 'math',
    title: 'Mathematics',
    chapters: [
      {
        id: 'math-ch1',
        title: 'Algebra',
        subjectId: 'math',
        tasks: [
          { id: 'math-ch1-t1', title: 'Linear Equations', chapterId: 'math-ch1', subjectId: 'math' },
          { id: 'math-ch1-t2', title: 'Quadratic Equations', chapterId: 'math-ch1', subjectId: 'math' },
          { id: 'math-ch1-t3', title: 'Polynomials', chapterId: 'math-ch1', subjectId: 'math' },
        ],
      },
      {
        id: 'math-ch2',
        title: 'Geometry',
        subjectId: 'math',
        tasks: [
          { id: 'math-ch2-t1', title: 'Triangles', chapterId: 'math-ch2', subjectId: 'math' },
          { id: 'math-ch2-t2', title: 'Circles', chapterId: 'math-ch2', subjectId: 'math' },
          { id: 'math-ch2-t3', title: 'Coordinate Geometry', chapterId: 'math-ch2', subjectId: 'math' },
        ],
      },
    ],
  },
  {
    id: 'science',
    title: 'Science',
    chapters: [
      {
        id: 'sci-ch1',
        title: 'Physics',
        subjectId: 'science',
        tasks: [
          { id: 'sci-ch1-t1', title: 'Motion', chapterId: 'sci-ch1', subjectId: 'science' },
          { id: 'sci-ch1-t2', title: 'Force', chapterId: 'sci-ch1', subjectId: 'science' },
          { id: 'sci-ch1-t3', title: 'Energy', chapterId: 'sci-ch1', subjectId: 'science' },
        ],
      },
      {
        id: 'sci-ch2',
        title: 'Chemistry',
        subjectId: 'science',
        tasks: [
          { id: 'sci-ch2-t1', title: 'Atoms', chapterId: 'sci-ch2', subjectId: 'science' },
          { id: 'sci-ch2-t2', title: 'Chemical Reactions', chapterId: 'sci-ch2', subjectId: 'science' },
          { id: 'sci-ch2-t3', title: 'Periodic Table', chapterId: 'sci-ch2', subjectId: 'science' },
        ],
      },
    ],
  },
  {
    id: 'english',
    title: 'English',
    chapters: [
      {
        id: 'eng-ch1',
        title: 'Grammar',
        subjectId: 'english',
        tasks: [
          { id: 'eng-ch1-t1', title: 'Tenses', chapterId: 'eng-ch1', subjectId: 'english' },
          { id: 'eng-ch1-t2', title: 'Active-Passive', chapterId: 'eng-ch1', subjectId: 'english' },
          { id: 'eng-ch1-t3', title: 'Reported Speech', chapterId: 'eng-ch1', subjectId: 'english' },
        ],
      },
      {
        id: 'eng-ch2',
        title: 'Literature',
        subjectId: 'english',
        tasks: [
          { id: 'eng-ch2-t1', title: 'Poetry Analysis', chapterId: 'eng-ch2', subjectId: 'english' },
          { id: 'eng-ch2-t2', title: 'Short Stories', chapterId: 'eng-ch2', subjectId: 'english' },
          { id: 'eng-ch2-t3', title: 'Essay Writing', chapterId: 'eng-ch2', subjectId: 'english' },
        ],
      },
    ],
  },
];

/** Create a task status change event */
export function createTaskStatusEvent(
  deviceId: string,
  hlc: HLCTimestamp,
  taskId: string,
  subjectId: string,
  chapterId: string,
  newStatus: TaskStatus,
  deleted?: boolean
): { event: SyncEvent; newHlc: HLCTimestamp } {
  const newHlc = tickHLC(hlc);
  const event: SyncEvent = {
    id: uuidv4(),
    type: 'task_status',
    payload: {
      taskId,
      subjectId,
      chapterId,
      newStatus,
      deleted: deleted || false,
    } as TaskStatusPayload,
    deviceId,
    studentId: STUDENT_ID,
    hlc: newHlc,
  };
  return { event, newHlc };
}

/** Cycle task status: not_started → in_progress → done → not_started */
export function nextTaskStatus(current: TaskStatus): TaskStatus {
  switch (current) {
    case 'not_started': return 'in_progress';
    case 'in_progress': return 'done';
    case 'done': return 'not_started';
    default: return 'not_started';
  }
}

/**
 * Resolve task statuses from event log using LWW with HLC.
 * For each taskId, the event with the highest HLC wins.
 */
export function resolveTaskStatuses(events: SyncEvent[]): Map<string, { status: TaskStatus; deleted: boolean; hlc: HLCTimestamp }> {
  const taskMap = new Map<string, { status: TaskStatus; deleted: boolean; hlc: HLCTimestamp }>();

  for (const e of events) {
    if (e.type !== 'task_status') continue;
    const p = e.payload as TaskStatusPayload;
    const existing = taskMap.get(p.taskId);

    if (!existing || compareHLC(e.hlc, existing.hlc) > 0) {
      taskMap.set(p.taskId, {
        status: p.newStatus,
        deleted: p.deleted || false,
        hlc: e.hlc,
      });
    }
  }

  return taskMap;
}

/** Compute chapter progress: done tasks / total non-deleted tasks */
export function computeChapterProgress(
  chapterId: string,
  taskStatuses: Map<string, { status: TaskStatus; deleted: boolean; hlc: HLCTimestamp }>
): number {
  const chapter = SYLLABUS
    .flatMap(s => s.chapters)
    .find(c => c.id === chapterId);
  if (!chapter) return 0;

  let total = 0;
  let done = 0;
  for (const task of chapter.tasks) {
    const resolved = taskStatuses.get(task.id);
    if (resolved?.deleted) continue;
    total++;
    if (resolved?.status === 'done') done++;
  }

  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Compute subject progress: average of chapter percentages */
export function computeSubjectProgress(
  subjectId: string,
  taskStatuses: Map<string, { status: TaskStatus; deleted: boolean; hlc: HLCTimestamp }>
): number {
  const subject = SYLLABUS.find(s => s.id === subjectId);
  if (!subject || subject.chapters.length === 0) return 0;

  let totalProgress = 0;
  for (const ch of subject.chapters) {
    totalProgress += computeChapterProgress(ch.id, taskStatuses);
  }

  return Math.round(totalProgress / subject.chapters.length);
}
