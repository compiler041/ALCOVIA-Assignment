/**
 * Focus Session Screen — Timer, duration picker, stats display.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { StorageManager } from '../store/storage';
import { SyncEngine } from '../store/syncEngine';
import { HLCTimestamp, tickHLC } from '../crdt/hlc';
import { SyncEvent, RewardState } from '../crdt/types';
import { createFocusSessionEvent, computeLocalRewards, ActiveSession } from '../store/focusStore';

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

const DURATIONS = [1, 5, 25, 45, 60, 90]; // minutes (1 and 5 for quick testing)
const GRACE_PERIOD_MS = 5000; // 5 seconds

export default function FocusScreen({ deviceId, storage, syncEngine, hlc, setHlc, events, setEvents, serverRewards }: Props) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartRef = useRef<Date | null>(null);

  const localRewards = computeLocalRewards(events);
  // Use server rewards if available, otherwise local
  const rewards = serverRewards || localRewards;

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
      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statEmoji}>🔥</Text>
          <Text style={styles.statValue}>{rewards.streak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statEmoji}>🪙</Text>
          <Text style={styles.statValue}>{rewards.coins}</Text>
          <Text style={styles.statLabel}>Coins</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statEmoji}>⏱️</Text>
          <Text style={styles.statValue}>{rewards.todayMinutes}m</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
      </View>

      {!activeSession ? (
        <>
          {/* Duration Picker */}
          <Text style={styles.sectionTitle}>Choose Duration</Text>
          <View style={styles.durationGrid}>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.durationBtn, selectedDuration === d && styles.durationBtnActive]}
                onPress={() => setSelectedDuration(d)}
              >
                <Text style={[styles.durationText, selectedDuration === d && styles.durationTextActive]}>
                  {d} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Start Button */}
          <TouchableOpacity style={styles.startBtn} onPress={startSession}>
            <Text style={styles.startBtnText}>Start Focus Session</Text>
          </TouchableOpacity>
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
            <Text style={styles.timerLabel}>{activeSession.targetDuration} min session</Text>
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
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statEmoji: {
    fontSize: 24,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e0e0e0',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: 16,
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
});
