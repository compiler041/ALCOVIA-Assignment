/**
 * Sync engine — handles push/pull synchronization with the server.
 */

import { StorageManager } from './storage';
import { SyncEvent, SyncResponse, RewardState } from '../crdt/types';

const SERVER_URL = 'http://localhost:3001';
const STUDENT_ID = 'student-1';

export interface SyncResult {
  success: boolean;
  rewards?: RewardState;
  error?: string;
  newEventsReceived?: number;
}

export class SyncEngine {
  private storage: StorageManager;
  private deviceId: string;
  private _isOnline: boolean = true;
  private isSyncing: boolean = false;

  constructor(deviceId: string, storage: StorageManager) {
    this.deviceId = deviceId;
    this.storage = storage;
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  setOnline(online: boolean): void {
    this._isOnline = online;
  }

  async sync(): Promise<SyncResult> {
    if (!this._isOnline || this.isSyncing) {
      return { success: false, error: this.isSyncing ? 'Sync in progress' : 'Offline' };
    }

    this.isSyncing = true;
    try {
      const allEvents = this.storage.getEvents();
      const unsyncedEvents = allEvents.filter(e => !e.serverVersion);

      const response = await fetch(`${SERVER_URL}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceId,
          studentId: STUDENT_ID,
          lastSyncVersion: this.storage.getLastSyncVersion(),
          events: unsyncedEvents,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data: SyncResponse = await response.json();

      // Merge received events
      this.mergeRemoteEvents(data.events);
      this.storage.setLastSyncVersion(data.serverVersion);

      return {
        success: true,
        rewards: data.rewards,
        newEventsReceived: data.events.length,
      };
    } catch (err: any) {
      console.warn('[sync] Error:', err.message);
      return { success: false, error: err.message };
    } finally {
      this.isSyncing = false;
    }
  }

  private mergeRemoteEvents(remoteEvents: SyncEvent[]): void {
    const localEvents = this.storage.getEvents();
    const localIds = new Set(localEvents.map(e => e.id));

    // Update serverVersion on events we sent that are now confirmed
    for (const local of localEvents) {
      const remote = remoteEvents.find(r => r.id === local.id);
      if (remote && remote.serverVersion) {
        local.serverVersion = remote.serverVersion;
      }
    }

    // Add remote events that we don't have locally
    const newEvents = remoteEvents.filter(e => !localIds.has(e.id));

    this.storage.saveEvents([...localEvents, ...newEvents]);
  }

  async fetchNotifications(): Promise<any[]> {
    try {
      const response = await fetch(`${SERVER_URL}/api/mock-whatsapp/log/${STUDENT_ID}`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.notifications || [];
    } catch {
      return [];
    }
  }
}
