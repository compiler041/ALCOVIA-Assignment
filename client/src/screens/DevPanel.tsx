/**
 * Dev Panel — Online/offline toggle, event log, state viewer, notification log.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SyncEngine } from '../store/syncEngine';
import { SyncEvent, RewardState, FocusSessionPayload, TaskStatusPayload } from '../crdt/types';
import { computeLocalRewards } from '../store/focusStore';
import { resolveTaskStatuses } from '../store/syllabusStore';
import { StorageManager } from '../store/storage';

interface Props {
  deviceId: string;
  syncEngine: SyncEngine;
  storage: StorageManager;
  events: SyncEvent[];
  isOnline: boolean;
  setIsOnline: (v: boolean) => void;
  onForceSync: () => void;
  serverRewards: RewardState | null;
  lastSyncResult: string;
}

export default function DevPanel({
  deviceId, syncEngine, storage, events, isOnline, setIsOnline, onForceSync, serverRewards, lastSyncResult
}: Props) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showEvents, setShowEvents] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);

  const localRewards = computeLocalRewards(events);
  const taskStatuses = resolveTaskStatuses(events);
  const lastSyncVersion = storage.getLastSyncVersion();

  // Fetch notifications periodically when online
  useEffect(() => {
    if (!isOnline) return;
    const fetchNotifs = async () => {
      const n = await syncEngine.fetchNotifications();
      setNotifications(n);
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 5000);
    return () => clearInterval(interval);
  }, [isOnline]);

  const focusEvents = events.filter(e => e.type === 'focus_session');
  const taskEvents = events.filter(e => e.type === 'task_status');

  return (
    <ScrollView style={styles.container}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Client:</Text>
          <Text style={styles.valueHighlight}>{deviceId}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Status:</Text>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#2ed573' : '#ff4757' }]} />
          <Text style={[styles.value, { color: isOnline ? '#2ed573' : '#ff4757' }]}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Sync Version:</Text>
          <Text style={styles.value}>{lastSyncVersion}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Local Events:</Text>
          <Text style={styles.value}>{events.length} ({focusEvents.length} focus, {taskEvents.length} task)</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Unsynced:</Text>
          <Text style={[styles.value, { color: '#f0a500' }]}>
            {events.filter(e => !e.serverVersion).length}
          </Text>
        </View>
        {lastSyncResult ? (
          <View style={styles.statusRow}>
            <Text style={styles.label}>Last Sync:</Text>
            <Text style={styles.valueMuted}>{lastSyncResult}</Text>
          </View>
        ) : null}
      </View>

      {/* Controls */}
      <View style={styles.controlRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, isOnline ? styles.btnDanger : styles.btnSuccess]}
          onPress={() => setIsOnline(!isOnline)}
        >
          <Text style={styles.btnText}>{isOnline ? '📴 Go Offline' : '📶 Go Online'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, styles.btnPrimary, !isOnline && styles.btnDisabled]}
          onPress={onForceSync}
          disabled={!isOnline}
        >
          <Text style={styles.btnText}>🔄 Force Sync</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, styles.btnWarning]}
          onPress={() => { storage.clearAll(); }}
        >
          <Text style={styles.btnText}>🗑 Clear Data</Text>
        </TouchableOpacity>
      </View>

      {/* Computed State */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Computed Rewards</Text>
        <View style={styles.rewardGrid}>
          <View style={styles.rewardCard}>
            <Text style={styles.rewardLabel}>Local</Text>
            <Text style={styles.rewardValue}>🔥 {localRewards.streak} | 🪙 {localRewards.coins} | ⏱ {localRewards.todayMinutes}m</Text>
          </View>
          {serverRewards && (
            <View style={styles.rewardCard}>
              <Text style={styles.rewardLabel}>Server</Text>
              <Text style={styles.rewardValue}>🔥 {serverRewards.streak} | 🪙 {serverRewards.coins} | ⏱ {serverRewards.todayMinutes}m</Text>
            </View>
          )}
        </View>
      </View>

      {/* Notification Log */}
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setShowNotifs(!showNotifs)}>
        <Text style={styles.sectionTitle}>🔔 Mock WhatsApp ({notifications.length})</Text>
        <Text style={styles.expandIcon}>{showNotifs ? '▼' : '▶'}</Text>
      </TouchableOpacity>
      {showNotifs && (
        <View style={styles.logContainer}>
          {notifications.length === 0 ? (
            <Text style={styles.emptyText}>No notifications yet</Text>
          ) : [...notifications].reverse().map((n: any, i: number) => (
            <View key={i} style={styles.logItem}>
              <Text style={styles.logId}>Session: {n.sessionId?.slice(0, 8)}...</Text>
              <Text style={styles.logMeta}>Sent: {new Date(n.receivedAt).toLocaleTimeString()}</Text>
              <View style={{ marginTop: 8, backgroundColor: '#25D366', padding: 8, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>WhatsApp Message</Text>
                <Text style={{ color: '#fff', fontSize: 13, marginTop: 4 }}>{n.whatsappPayload?.text}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Event Log */}
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setShowEvents(!showEvents)}>
        <Text style={styles.sectionTitle}>📋 Event Log ({events.length})</Text>
        <Text style={styles.expandIcon}>{showEvents ? '▼' : '▶'}</Text>
      </TouchableOpacity>
      {showEvents && (
        <View style={styles.logContainer}>
          {events.length === 0 ? (
            <Text style={styles.emptyText}>No events yet</Text>
          ) : [...events].reverse().map((e, i) => (
            <View key={i} style={styles.logItem}>
              <View style={styles.logHeader}>
                <Text style={[styles.logType, { color: e.type === 'focus_session' ? '#6c63ff' : '#f0a500' }]}>
                  {e.type === 'focus_session' ? '🎯' : '📝'} {e.type}
                </Text>
                <Text style={styles.logSynced}>
                  {e.serverVersion ? `✓ sv:${e.serverVersion}` : '⏳ unsynced'}
                </Text>
              </View>
              <Text style={styles.logId}>ID: {e.id.slice(0, 12)}...</Text>
              <Text style={styles.logMeta}>Device: {e.deviceId} | HLC: {e.hlc.ts}:{e.hlc.counter}</Text>
              {e.type === 'focus_session' && (
                <Text style={styles.logPayload}>
                  {(e.payload as FocusSessionPayload).status === 'success' ? '✅' : '❌'}{' '}
                  {(e.payload as FocusSessionPayload).targetDuration}min —{' '}
                  {(e.payload as FocusSessionPayload).status}
                  {(e.payload as FocusSessionPayload).failReason ? ` (${(e.payload as FocusSessionPayload).failReason})` : ''}
                </Text>
              )}
              {e.type === 'task_status' && (
                <Text style={styles.logPayload}>
                  {(e.payload as TaskStatusPayload).deleted ? '🗑' : '📝'}{' '}
                  {(e.payload as TaskStatusPayload).taskId} → {(e.payload as TaskStatusPayload).newStatus}
                  {(e.payload as TaskStatusPayload).deleted ? ' (DELETED)' : ''}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Resolved Task States */}
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setShowTasks(!showTasks)}>
        <Text style={styles.sectionTitle}>📋 Resolved Tasks ({taskStatuses.size})</Text>
        <Text style={styles.expandIcon}>{showTasks ? '▼' : '▶'}</Text>
      </TouchableOpacity>
      {showTasks && (
        <View style={styles.logContainer}>
          {taskStatuses.size === 0 ? (
            <Text style={styles.emptyText}>No task changes yet</Text>
          ) : Array.from(taskStatuses.entries()).map(([taskId, val]) => (
            <View key={taskId} style={styles.logItem}>
              <Text style={styles.logId}>{taskId}</Text>
              <Text style={styles.logPayload}>
                Status: {val.status} {val.deleted ? '(DELETED)' : ''} | Winner HLC: {val.hlc.node}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  statusBar: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    color: '#888',
    fontSize: 13,
    width: 110,
  },
  value: {
    color: '#e0e0e0',
    fontSize: 13,
  },
  valueHighlight: {
    color: '#6c63ff',
    fontSize: 14,
    fontWeight: '700',
  },
  valueMuted: {
    color: '#888',
    fontSize: 12,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  controlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDanger: { backgroundColor: '#c0392b' },
  btnSuccess: { backgroundColor: '#27ae60' },
  btnPrimary: { backgroundColor: '#6c63ff' },
  btnWarning: { backgroundColor: '#e67e22' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  section: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#e0e0e0',
    fontSize: 15,
    fontWeight: '600',
  },
  expandIcon: {
    color: '#888',
    fontSize: 12,
  },
  rewardGrid: {
    gap: 6,
    marginTop: 8,
  },
  rewardCard: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
  },
  rewardLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 2,
  },
  rewardValue: {
    color: '#e0e0e0',
    fontSize: 13,
  },
  logContainer: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  logItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
    paddingVertical: 8,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logType: {
    fontSize: 13,
    fontWeight: '600',
  },
  logSynced: {
    fontSize: 11,
    color: '#2ed573',
  },
  logId: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  logMeta: {
    fontSize: 11,
    color: '#555',
    marginTop: 1,
  },
  logPayload: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 2,
  },
  emptyText: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    padding: 16,
  },
});
