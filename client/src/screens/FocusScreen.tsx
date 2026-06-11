/**
 * Focus Session Screen — Timer, duration picker, stats display.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { StorageManager } from '../store/storage';
import { SyncEngine } from '../store/syncEngine';
import { HLCTimestamp, tickHLC } from '../crdt/hlc';
import { SyncEvent, RewardState } from '../crdt/types';
import { createFocusSessionEvent, computeLocalRewards, ActiveSession, getFocusSessions } from '../store/focusStore';

interface Props {
  deviceId: string;
  storage: StorageManager;
  syncEngine: SyncEngine;
  hlc: HLCTimestamp;
  setHlc: (h: HLCTimestamp) => void;
  events: SyncEvent[];
  setEvents: (e: SyncEvent[]) => void;
  serverRewards: RewardState | null;
}

const DURATIONS = [25, 50, 90, 5 / 60]; // 5/60 = 5 seconds
const GRACE_PERIOD_MS = 5000; // 5 seconds

export default function FocusScreen({ deviceId, storage, syncEngine, hlc, setHlc, events, setEvents, serverRewards }: Props) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(25);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartRef = useRef<Date | null>(null);

  const rewards = computeLocalRewards(events);

  // Get recent successful sessions
  const recentSessions = getFocusSessions(events)
    .filter(e => e.payload.status === 'success')
    .sort((a, b) => {
      const aTime = new Date(a.payload.endTime || a.payload.startTime).getTime();
      const bTime = new Date(b.payload.endTime || b.payload.startTime).getTime();
      return bTime - aTime;
    })
    .slice(0, 3);

  // Timer tick
  useEffect(() => {
    if (!activeSession) return;

    timerRef.current = setInterval(() => {
      setActiveSession(prev => {
        if (!prev) return null;
        // Calculate based on wall-clock elapsed time (resilient to timer throttling)
        const elapsedSec = Math.floor((Date.now() - prev.startTime.getTime()) / 1000);
        const totalSec = prev.targetDuration * 60;
        const remaining = Math.max(0, totalSec - elapsedSec);

        if (remaining <= 0) {
          // Session complete — success!
          clearInterval(timerRef.current!);
          handleSessionComplete(prev);
          return null;
        }
        return { ...prev, timeRemaining: remaining };
      });
    }, 250); // Update 4x/sec for smooth countdown

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSession?.startTime]);

  // App switch detection (visibility change)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleVisibility = () => {
      if (document.hidden && activeSession) {
        // Start grace period
        graceRef.current = setTimeout(() => {
          handleFail('app_switch');
        }, GRACE_PERIOD_MS);
      } else {
        // Came back within grace period
        if (graceRef.current) {
          clearTimeout(graceRef.current);
          graceRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (graceRef.current) clearTimeout(graceRef.current);
    };
  }, [activeSession]);

  const handleSessionComplete = useCallback((session: ActiveSession) => {
    const actualMinutes = session.targetDuration;
    const { event, newHlc } = createFocusSessionEvent(
      deviceId, hlc, session.targetDuration, actualMinutes, 'success', session.startTime
    );
    setHlc(newHlc);
    storage.saveEvent(event);
    const allEvents = storage.getEvents();
    setEvents(allEvents);
    setActiveSession(null);
  }, [deviceId, hlc, storage, setHlc, setEvents]);

  const startSession = () => {
    const now = new Date();
    sessionStartRef.current = now;
    setActiveSession({
      startTime: now,
      targetDuration: selectedDuration,
      timeRemaining: selectedDuration * 60,
    });
  };

  const handleFail = (reason: 'give_up' | 'app_switch') => {
    if (!activeSession) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (graceRef.current) clearTimeout(graceRef.current);

    const elapsed = Math.floor((Date.now() - activeSession.startTime.getTime()) / 1000 / 60);
    const { event, newHlc } = createFocusSessionEvent(
      deviceId, hlc, activeSession.targetDuration, elapsed, 'failed', activeSession.startTime, reason
    );
    setHlc(newHlc);
    storage.saveEvent(event);
    const allEvents = storage.getEvents();
    setEvents(allEvents);
    setActiveSession(null);
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progress = activeSession
    ? 1 - (activeSession.timeRemaining / (activeSession.targetDuration * 60))
    : 0;

  return (
    <View style={styles.container}>
      {/* Stats Pills & Title */}
      <View style={styles.headerArea}>
        <Text style={styles.sectionTitle}>Focus session</Text>
        
        <View style={styles.statsPillRow}>
          <View style={[styles.statPill, { backgroundColor: 'rgba(46, 213, 115, 0.15)' }]}>
            <Text style={[styles.statPillText, { color: '#2ed573' }]}>🔥 Streak {rewards.streak}d</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: 'rgba(46, 213, 115, 0.15)' }]}>
            <Text style={[styles.statPillText, { color: '#2ed573' }]}>🪙 {rewards.coins} coins</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: '#2a2a2a' }]}>
            <Text style={[styles.statPillText, { color: '#aaa' }]}>⏱️ Today {rewards.todayMinutes} min</Text>
          </View>
        </View>
      </View>

      {!activeSession ? (
        <>
          {/* Duration Picker */}
          <View style={styles.durationGrid}>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.durationBtn, selectedDuration === d && styles.durationBtnActive]}
                onPress={() => setSelectedDuration(d)}
              >
                <Text style={[styles.durationText, selectedDuration === d && styles.durationTextActive]}>
                  {d < 1 ? `Demo: ${Math.round(d * 60)} s` : `${d} min`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Start Button */}
          <TouchableOpacity style={styles.startBtn} onPress={startSession}>
            <Text style={styles.startBtnText}>Start Focus Session</Text>
          </TouchableOpacity>

          {/* Recent Sessions */}
          {recentSessions.length > 0 && (
            <View style={styles.recentSessionsContainer}>
              {recentSessions.map(session => (
                <View key={session.id} style={styles.recentSessionPill}>
                  <Text style={styles.recentSessionIcon}>✅</Text>
                  <Text style={styles.recentSessionText}>
                    {session.payload.targetDuration < 1 
                      ? `${Math.round(session.payload.targetDuration * 60)} sec` 
                      : `${session.payload.targetDuration} min`} · +50 coins 
                  </Text>
                  <Text style={styles.recentSessionDevice}>
                    {session.deviceId}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          {/* Timer Display */}
          <View style={styles.timerContainer}>
            {/* Progress ring (simplified as bar for RN web) */}
            <View style={styles.progressBarOuter}>
              <View style={[styles.progressBarInner, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.timerText}>{formatTime(activeSession.timeRemaining)}</Text>
            <Text style={styles.timerLabel}>
              {activeSession.targetDuration < 1 
                ? `${Math.round(activeSession.targetDuration * 60)} sec session` 
                : `${activeSession.targetDuration} min session`}
            </Text>
          </View>

          {/* Give Up Button */}
          <TouchableOpacity style={styles.giveUpBtn} onPress={() => handleFail('give_up')}>
            <Text style={styles.giveUpText}>Give Up</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  headerArea: {
    width: '100%',
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
  },
  statsPillRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 32,
  },
  durationBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#1e1e30',
    minWidth: 80,
    alignItems: 'center',
  },
  durationBtnActive: {
    borderColor: '#6c63ff',
    backgroundColor: '#2d2b55',
  },
  durationText: {
    color: '#aaa',
    fontSize: 15,
    fontWeight: '500',
  },
  durationTextActive: {
    color: '#6c63ff',
    fontWeight: '700',
  },
  startBtn: {
    backgroundColor: '#6c63ff',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  timerContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  progressBarOuter: {
    width: 280,
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: '#6c63ff',
    borderRadius: 4,
  },
  timerText: {
    fontSize: 64,
    fontWeight: '700',
    color: '#e0e0e0',
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: 16,
    color: '#888',
    marginTop: 8,
  },
  giveUpBtn: {
    backgroundColor: '#ff4757',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },
  giveUpText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  recentSessionsContainer: {
    marginTop: 32,
    alignItems: 'center',
    gap: 8,
  },
  recentSessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 213, 115, 0.1)', // Faint green background
    borderWidth: 1,
    borderColor: 'rgba(46, 213, 115, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  recentSessionIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  recentSessionText: {
    color: '#2ed573',
    fontSize: 14,
    fontWeight: '500',
  },
  recentSessionDevice: {
    color: '#888',
    fontSize: 12,
    marginLeft: 6,
    fontWeight: '400',
  },
});
