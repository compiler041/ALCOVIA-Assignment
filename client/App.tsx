/**
 * Alcovia — Main App Entry Point
 *
 * Reads clientId from URL query param (?client=device-A).
 * Provides tab navigation between Focus, Syllabus, and Dev Panel.
 * Manages global state: events, HLC, sync engine, online status.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { StorageManager } from './src/store/storage';
import { SyncEngine } from './src/store/syncEngine';
import { createHLC, HLCTimestamp, mergeHLC } from './src/crdt/hlc';
import { SyncEvent, RewardState } from './src/crdt/types';
import { computeLocalRewards } from './src/store/focusStore';
import FocusScreen from './src/screens/FocusScreen';
import SyllabusScreen from './src/screens/SyllabusScreen';
import DevPanel from './src/screens/DevPanel';

// Read clientId from URL query param (web only)
function getClientId(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    return params.get('client') || 'device-A';
  }
  return 'device-A';
}

const CLIENT_ID = getClientId();
const SYNC_INTERVAL_MS = 5000;

type Tab = 'focus' | 'syllabus' | 'devpanel';

export default function App() {
  // Core state
  const [storage] = useState(() => new StorageManager(CLIENT_ID));
  const [syncEngine] = useState(() => new SyncEngine(CLIENT_ID, storage));
  const [hlc, setHlc] = useState<HLCTimestamp>(() => createHLC(CLIENT_ID));
  const [events, setEvents] = useState<SyncEvent[]>(() => storage.getEvents());
  const [isOnline, setIsOnline] = useState(true);
  const [serverRewards, setServerRewards] = useState<RewardState | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('focus');

  // Keep sync engine in sync with online state
  useEffect(() => {
    syncEngine.setOnline(isOnline);
    if (isOnline) {
      // Sync immediately when coming online
      doSync();
    }
  }, [isOnline]);

  // Auto-sync every 5s when online
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(() => {
      doSync();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isOnline]);

  // Refresh events from storage periodically (in case sync adds events)
  useEffect(() => {
    const interval = setInterval(() => {
      const current = storage.getEvents();
      setEvents(current);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const doSync = useCallback(async () => {
    const result = await syncEngine.sync();
    if (result.success) {
      const ts = new Date().toLocaleTimeString();
      setLastSyncResult(`✓ ${ts} (${result.newEventsReceived || 0} new events)`);
      if (result.rewards) {
        setServerRewards(result.rewards);
      }
      // Refresh events from storage after sync
      setEvents(storage.getEvents());
    } else if (result.error && result.error !== 'Offline' && result.error !== 'Sync in progress') {
      setLastSyncResult(`✗ ${result.error}`);
    }
  }, [syncEngine, storage]);

  const handleSetIsOnline = useCallback((online: boolean) => {
    setIsOnline(online);
  }, []);

  const localRewards = computeLocalRewards(events);
  const rewards = serverRewards || localRewards;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.logo}>Alcovia <Text style={styles.logoSub}>study app</Text></Text>
          <View style={styles.headerRight}>
            <Text style={styles.syncStatus}>✓ Synced</Text>
          </View>
        </View>

        {/* Stats Pill Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statPill}>
            <Text style={styles.statEmoji}>🔥</Text>
            <Text style={styles.statValue}>{rewards.streak} <Text style={styles.statLabel}>streak</Text></Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statEmoji}>🪙</Text>
            <Text style={styles.statValue}>{rewards.coins} <Text style={styles.statLabel}>coins</Text></Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statEmoji}>⏱️</Text>
            <Text style={styles.statValue}>{rewards.todayMinutes} <Text style={styles.statLabel}>min today</Text></Text>
          </View>
        </View>
      </View>

      <View style={styles.separator} />

      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === 'focus' && (
          <FocusScreen
            deviceId={CLIENT_ID}
            storage={storage}
            syncEngine={syncEngine}
            hlc={hlc}
            setHlc={setHlc}
            events={events}
            setEvents={setEvents}
            serverRewards={serverRewards}
          />
        )}
        {activeTab === 'syllabus' && (
          <SyllabusScreen
            deviceId={CLIENT_ID}
            storage={storage}
            hlc={hlc}
            setHlc={setHlc}
            events={events}
            setEvents={setEvents}
          />
        )}
        {activeTab === 'devpanel' && (
          <DevPanel
            deviceId={CLIENT_ID}
            syncEngine={syncEngine}
            storage={storage}
            events={events}
            isOnline={isOnline}
            setIsOnline={handleSetIsOnline}
            onForceSync={doSync}
            serverRewards={serverRewards}
            lastSyncResult={lastSyncResult}
          />
        )}
      </View>

      {/* Bottom Tab Navigation */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={styles.bottomTab}
          onPress={() => setActiveTab('focus')}
        >
          <Text style={[styles.bottomTabIcon, activeTab === 'focus' && styles.bottomTabIconActive]}>⏱️</Text>
          <Text style={[styles.bottomTabText, activeTab === 'focus' && styles.bottomTabTextActive]}>Focus</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.centerActionPill} onPress={() => setActiveTab('devpanel')}>
          <MaterialCommunityIcons name="crop-free" size={20} color="#888" />
          <Text style={{ fontSize: 18, color: '#888', fontWeight: '500', fontFamily: 'serif' }}>T</Text>
          <MaterialCommunityIcons name="pencil" size={20} color="#888" />
          <Ionicons name="chatbubble" size={22} color="#d4b4ff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTab}
          onPress={() => setActiveTab('syllabus')}
        >
          <Text style={[styles.bottomTabIcon, activeTab === 'syllabus' && styles.bottomTabIconActive]}>📖</Text>
          <Text style={[styles.bottomTabText, activeTab === 'syllabus' && styles.bottomTabTextActive]}>Syllabus</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d', // Very dark gray, almost black
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 20 : 50,
    paddingBottom: 16,
    backgroundColor: '#0d0d0d',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  logoSub: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncStatus: {
    fontSize: 13,
    color: '#888',
  },
  statsBar: {
    flexDirection: 'row',
    gap: 12,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#666',
  },
  separator: {
    height: 1,
    backgroundColor: '#1f1f1f',
    width: '100%',
  },
  content: {
    flex: 1,
  },
  bottomTabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  bottomTab: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  bottomTabIcon: {
    fontSize: 18,
    color: '#666',
    marginBottom: 4,
    opacity: 0.5,
  },
  bottomTabIconActive: {
    color: '#5c80ff', // Light blue
    opacity: 1,
  },
  bottomTabText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  bottomTabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  centerActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 16,
  },
  actionIcon: {
    color: '#888',
    fontSize: 16,
  },
});
