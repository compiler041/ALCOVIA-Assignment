/**
 * Syllabus Progress Screen — Subjects, chapters, tasks with progress tracking.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { StorageManager } from '../store/storage';
import { HLCTimestamp } from '../crdt/hlc';
import { SyncEvent, TaskStatus } from '../crdt/types';
import {
  SYLLABUS,
  createTaskStatusEvent,
  nextTaskStatus,
  resolveTaskStatuses,
  computeChapterProgress,
  computeSubjectProgress,
} from '../store/syllabusStore';

interface Props {
  deviceId: string;
  storage: StorageManager;
  hlc: HLCTimestamp;
  setHlc: (h: HLCTimestamp) => void;
  events: SyncEvent[];
  setEvents: (e: SyncEvent[]) => void;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: '#666',
  in_progress: '#f0a500',
  done: '#2ed573',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  done: 'Done',
};

export default function SyllabusScreen({ deviceId, storage, hlc, setHlc, events, setEvents }: Props) {
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set(['math', 'science', 'english']));
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  const taskStatuses = resolveTaskStatuses(events);

  const toggleSubject = (id: string) => {
    const next = new Set(expandedSubjects);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedSubjects(next);
  };

  const toggleChapter = (id: string) => {
    const next = new Set(expandedChapters);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedChapters(next);
  };

  const handleStatusChange = (taskId: string, subjectId: string, chapterId: string) => {
    const current = taskStatuses.get(taskId);
    const currentStatus: TaskStatus = current?.status || 'not_started';
    const newStatus = nextTaskStatus(currentStatus);

    const { event, newHlc } = createTaskStatusEvent(
      deviceId, hlc, taskId, subjectId, chapterId, newStatus
    );
    setHlc(newHlc);
    storage.saveEvent(event);
    setEvents(storage.getEvents());
  };

  const handleDelete = (taskId: string, subjectId: string, chapterId: string) => {
    const current = taskStatuses.get(taskId);
    const currentStatus: TaskStatus = current?.status || 'not_started';

    const { event, newHlc } = createTaskStatusEvent(
      deviceId, hlc, taskId, subjectId, chapterId, currentStatus, true
    );
    setHlc(newHlc);
    storage.saveEvent(event);
    setEvents(storage.getEvents());
  };

  const handleRestore = (taskId: string, subjectId: string, chapterId: string) => {
    const { event, newHlc } = createTaskStatusEvent(
      deviceId, hlc, taskId, subjectId, chapterId, 'not_started', false
    );
    setHlc(newHlc);
    storage.saveEvent(event);
    setEvents(storage.getEvents());
  };

  // Calculate global syllabus progress
  const allTasks = SYLLABUS.flatMap(s => s.chapters.flatMap(c => c.tasks));
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter(t => taskStatuses.get(t.id)?.status === 'done').length;
  const globalProgress = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Syllabus</Text>
        <Text style={styles.pageSubtitle}>{doneTasks} of {totalTasks} tasks done · {globalProgress}%</Text>
        <View style={styles.globalProgressOuter}>
          <View style={[styles.globalProgressInner, { width: `${globalProgress}%` }]} />
        </View>
      </View>

      <View style={styles.subjectsContainer}>
      {SYLLABUS.map(subject => {
        const subjectProgress = computeSubjectProgress(subject.id, taskStatuses);
        const isExpanded = expandedSubjects.has(subject.id);
        const totalSubTasks = subject.chapters.reduce((acc, ch) => acc + ch.tasks.length, 0);
        const doneSubTasks = subject.chapters.reduce((acc, ch) => {
          return acc + ch.tasks.filter(t => taskStatuses.get(t.id)?.status === 'done').length;
        }, 0);

        return (
          <View key={subject.id} style={styles.subjectCard}>
            <TouchableOpacity style={styles.subjectHeader} onPress={() => toggleSubject(subject.id)}>
              <View style={styles.subjectTitleRow}>
                <Text style={styles.subjectTitle}>{subject.title}</Text>
                <View style={styles.subjectHeaderRight}>
                  <Text style={styles.subjectProgressText}>{doneSubTasks}/{totalSubTasks}</Text>
                  <Text style={styles.expandIcon}>{isExpanded ? '⌃' : '⌄'}</Text>
                </View>
              </View>
              {/* No grey track for subject progress, just the blue line */}
              <View style={styles.progressBarOuterTransparent}>
                <View style={[styles.progressBarInner, { width: `${subjectProgress}%` }]} />
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.chaptersContainer}>
                {subject.chapters.map(chapter => {
                  const chExpanded = expandedChapters.has(chapter.id);
                  const totalChTasks = chapter.tasks.length;
                  const doneChTasks = chapter.tasks.filter(t => taskStatuses.get(t.id)?.status === 'done').length;

                  return (
                    <View key={chapter.id} style={styles.chapterSection}>
                      <TouchableOpacity style={styles.chapterHeader} onPress={() => toggleChapter(chapter.id)}>
                        <Text style={styles.chapterTitle}>{chapter.title}</Text>
                        <View style={styles.chapterHeaderRight}>
                          <Text style={styles.chapterProgressText}>{doneChTasks}/{totalChTasks}</Text>
                          <Text style={styles.expandIconSmall}>{chExpanded ? '⌃' : '⌄'}</Text>
                        </View>
                      </TouchableOpacity>

                      {chExpanded && (
                        <View style={styles.tasksContainer}>
                          {chapter.tasks.map(task => {
                            const resolved = taskStatuses.get(task.id);
                            const status: TaskStatus = resolved?.status || 'not_started';
                            const deleted = resolved?.deleted || false;
                            
                            if (deleted) return null; // Hide deleted tasks based on image

                            return (
                              <View key={task.id} style={styles.taskRow}>
                                <TouchableOpacity
                                  style={styles.taskStatusBtn}
                                  onPress={() => handleStatusChange(task.id, subject.id, chapter.id)}
                                >
                                  {status === 'done' && (
                                    <View style={styles.statusDone}>
                                      <Text style={styles.statusDoneIcon}>✓</Text>
                                    </View>
                                  )}
                                  {status === 'in_progress' && (
                                    <View style={styles.statusInProgress}>
                                      <View style={styles.statusInProgressInner} />
                                    </View>
                                  )}
                                  {status === 'not_started' && (
                                    <View style={styles.statusNotStarted} />
                                  )}

                                  <Text style={[
                                    styles.taskTitle,
                                    status === 'done' && styles.taskTitleDone,
                                    status === 'not_started' && styles.taskTitleNotStarted
                                  ]}>
                                    {task.title}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                          <TouchableOpacity style={styles.addTaskBtn}>
                            <Text style={styles.addTaskText}>+ Add task</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    padding: 16,
  },
  pageHeader: {
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  globalProgressOuter: {
    width: '100%',
    height: 4,
    backgroundColor: '#222',
    borderRadius: 2,
  },
  globalProgressInner: {
    height: '100%',
    backgroundColor: '#5c80ff',
    borderRadius: 2,
  },
  subjectsContainer: {
    gap: 12,
  },
  subjectCard: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    overflow: 'hidden',
  },
  subjectHeader: {
    padding: 16,
  },
  subjectTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subjectTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  subjectHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subjectProgressText: {
    fontSize: 13,
    color: '#888',
    marginRight: 12,
  },
  expandIcon: {
    color: '#888',
    fontSize: 16,
  },
  progressBarOuter: {
    width: '100%',
    height: 4,
    backgroundColor: '#222',
    borderRadius: 2,
  },
  progressBarOuterTransparent: {
    width: '100%',
    height: 4,
    backgroundColor: 'transparent', // Match mockup: no grey track
    borderRadius: 2,
    marginTop: -4, // Pull up closer to title
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: '#4a72ff',
    borderRadius: 2,
  },
  chaptersContainer: {
    paddingBottom: 16,
  },
  chapterSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  chapterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chapterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  chapterHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chapterProgressText: {
    fontSize: 12,
    color: '#888',
    marginRight: 12,
  },
  expandIconSmall: {
    color: '#888',
    fontSize: 14,
  },
  tasksContainer: {
    paddingLeft: 12, // Indent tasks relative to chapter
    gap: 16,
    marginBottom: 8,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDone: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#38c976', // Adjusted green
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusDoneIcon: {
    color: '#0d0d0d', // Match mockup black check
    fontSize: 10,
    fontWeight: '900',
  },
  statusInProgress: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#f2a93b', // Adjusted yellow/orange
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusInProgressInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f2a93b',
  },
  statusNotStarted: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#2a2a2a', // Very faint dark outline
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  taskTitleDone: {
    color: '#666',
    textDecorationLine: 'line-through',
  },
  taskTitleNotStarted: {
    color: '#e0e0e0', // Slightly dimmer than in-progress
  },
  addTaskBtn: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addTaskText: {
    color: '#666',
    fontSize: 13,
  },
});
