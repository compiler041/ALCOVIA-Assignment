/**
 * Namespaced localStorage wrapper.
 * Each client instance (device) gets its own isolated storage namespace.
 */

import { SyncEvent } from '../crdt/types';

const EVENTS_KEY = 'events';
const SYNC_VERSION_KEY = 'lastSyncVersion';

export class StorageManager {
  private prefix: string;

  constructor(clientId: string) {
    this.prefix = `alcovia_${clientId}_`;
  }

  private key(name: string): string {
    return this.prefix + name;
  }

  getEvents(): SyncEvent[] {
    try {
      const raw = localStorage.getItem(this.key(EVENTS_KEY));
      if (!raw) return [];
      return JSON.parse(raw) as SyncEvent[];
    } catch {
      return [];
    }
  }

  saveEvent(event: SyncEvent): void {
    const events = this.getEvents();
    // Deduplicate by id
    if (events.some(e => e.id === event.id)) return;
    events.push(event);
    localStorage.setItem(this.key(EVENTS_KEY), JSON.stringify(events));
  }

  saveEvents(events: SyncEvent[]): void {
    localStorage.setItem(this.key(EVENTS_KEY), JSON.stringify(events));
  }

  getLastSyncVersion(): number {
    const raw = localStorage.getItem(this.key(SYNC_VERSION_KEY));
    return raw ? parseInt(raw, 10) : 0;
  }

  setLastSyncVersion(v: number): void {
    localStorage.setItem(this.key(SYNC_VERSION_KEY), String(v));
  }

  clearAll(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
}
