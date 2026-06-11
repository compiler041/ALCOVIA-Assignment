# Alcovia — Testing Guide

## 🚀 Starting the App

### Terminal 1: Backend Server
```bash
cd alcovia/server
npm install
npx tsx src/index.ts
```
You should see:
```
[db] Database initialized
Alcovia server running on port 3001
```

### Terminal 2: Client App
```bash
cd alcovia/client
npm install
npx expo start --web
```
Expo will open the app in your browser (usually `http://localhost:8081`).

---

## 🖥️ Setting Up Two Devices

Open **two browser tabs** (or windows):

| Device | URL |
|--------|-----|
| **Device A** | `http://localhost:8081/?client=device-A` |
| **Device B** | `http://localhost:8081/?client=device-B` |

Each tab has **isolated localStorage** — they simulate two real devices on the same student account (`student-1`).

> **Verify:** The header bar should show the device name (e.g., `device-A`) with a green dot (online).

---

## 🧪 Test Scenarios

### Test 1: Basic Online Sync
**Goal:** Confirm changes propagate between devices.

1. In **Device A** → Go to **Syllabus** tab
2. Click on a task (e.g., "Linear Equations") to change its status to **In Progress**
3. Wait 5 seconds (auto-sync interval)
4. In **Device B** → Go to **Syllabus** tab
5. ✅ **Verify:** "Linear Equations" shows as **In Progress** on Device B too

---

### Test 2: Offline Focus Session + Sync
**Goal:** Complete a focus session offline, then sync.

1. In **Device A** → Go to **Dev Panel** tab
2. Click **📴 Go Offline** — status turns red "OFFLINE"
3. Go to **Focus** tab
4. Select **1 min** (shortest, for quick testing)
5. Click **Start Focus Session**
6. Wait for the timer to complete (1 minute)
7. ✅ **Verify:** Stats update locally — Streak: 1, Coins: 50, Today: 1m
8. Go to **Dev Panel** → you'll see "Unsynced: 1"
9. Click **📶 Go Online**
10. Click **🔄 Force Sync** (or wait 5 seconds)
11. ✅ **Verify:** Unsynced drops to 0, server rewards match local rewards

---

### Test 3: Two Offline Focus Sessions — One Per Device
**Goal:** Both devices complete sessions offline, then sync. Rewards computed correctly.

1. **Device A** → Dev Panel → **Go Offline**
2. **Device B** → Dev Panel → **Go Offline**
3. **Device A** → Focus → Select **1 min** → Start → Wait for completion
4. **Device B** → Focus → Select **1 min** → Start → Wait for completion
5. Now both have 1 unsynced focus session each
6. **Device A** → Dev Panel → **Go Online** → **Force Sync**
7. **Device B** → Dev Panel → **Go Online** → **Force Sync**
8. Wait a few seconds for both to sync
9. ✅ **Verify on BOTH devices:**
   - Streak: 1 (both sessions are on the same day)
   - Coins: 100 (50 per session × 2 sessions)
   - Today: 2m (1 min × 2)
   - Both devices show identical state

---

### Test 4: Conflicting Task Status Edits
**Goal:** Same task edited differently on two offline devices — LWW with HLC resolves it.

1. **Device A** → Dev Panel → **Go Offline**
2. **Device B** → Dev Panel → **Go Offline**
3. **Device A** → Syllabus → Change "Triangles" to **In Progress**
4. **Device B** → Syllabus → Change "Triangles" to **Done**
5. **Device A** → Dev Panel → **Go Online** → **Force Sync**
6. **Device B** → Dev Panel → **Go Online** → **Force Sync**
7. Wait a few seconds
8. ✅ **Verify:** Both devices show the SAME status for "Triangles"
   - Whichever device edited LATER (by HLC timestamp) wins
   - Check Dev Panel → "Resolved Tasks" section to see which HLC won

---

### Test 5: Edit vs. Delete Conflict
**Goal:** One device edits a task, the other deletes it.

1. **Device A** → Dev Panel → **Go Offline**
2. **Device B** → Dev Panel → **Go Offline**
3. **Device A** → Syllabus → Change "Atoms" to **Done**
4. **Device B** → Syllabus → Click the **✕** button on "Atoms" to delete it
5. **Device A** → **Go Online** → **Force Sync**
6. **Device B** → **Go Online** → **Force Sync**
7. ✅ **Verify:** Both devices converge — the action with the higher HLC wins
   - If delete was later → task shows as deleted on both
   - If edit was later → task shows as "Done" on both
   - Check Dev Panel → "Resolved Tasks" to see the winner

---

### Test 6: Give Up (Failed Session)
**Goal:** Verify failed sessions don't award rewards.

1. Go to **Focus** tab on either device
2. Select **1 min** → Start session
3. After a few seconds, click **Give Up**
4. ✅ **Verify:** No coins or streak increase
5. Check **Dev Panel → Event Log** — you'll see a `focus_session` event with status `❌ failed (give_up)`

---

### Test 7: App Switch Detection
**Goal:** Backgrounding the app for >5 seconds fails the session.

1. Start a focus session (1 min)
2. Switch to a different browser tab (this triggers `visibilitychange`)
3. Wait 6+ seconds, then come back
4. ✅ **Verify:** Session auto-failed with reason `app_switch`
5. Check Dev Panel → Event Log for `failed (app_switch)`

---

### Test 8: n8n Webhook Exactly-Once (Check Server Logs)
**Goal:** Verify the notification fires exactly once, even when synced from two devices.

1. **Device A** → Go Offline → Complete a focus session → Go Online → Sync
2. **Device B** → Go Online → Sync (it will receive the same session)
3. Check the **server terminal** — you should see:
   ```
   [webhook] Sent notification for session abc123...
   ```
   This should appear **exactly once**, not twice.
4. ✅ **Verify:** In Dev Panel → "Notifications Sent" section shows 1 entry
5. If n8n is running, the workflow execution log will also show 1 execution

---

### Test 9: Idempotent Sync (Double Sync)
**Goal:** Syncing the same data twice doesn't duplicate anything.

1. Complete a focus session on Device A (online)
2. Click **Force Sync** multiple times rapidly
3. ✅ **Verify:** Coins, streak, and events don't change or duplicate

---

### Test 10: Clear Data & Re-sync
**Goal:** A fresh device can pull all state from server.

1. On **Device B** → Dev Panel → Click **🗑 Clear Data**
2. Refresh the browser tab
3. Wait for auto-sync (or click Force Sync)
4. ✅ **Verify:** Device B recovers all synced events and shows the same state as Device A

---

## 🔍 Debugging Tips

### Check Server State
Open in browser:
```
http://localhost:3001/api/state/student-1
```
This shows all events, computed rewards, resolved task statuses, and notifications sent.

### Check Notification Log
```
http://localhost:3001/api/notifications/student-1
```

### Server Health
```
http://localhost:3001/api/health
```

### Reset Everything
1. Stop the server (Ctrl+C)
2. Delete `alcovia/server/alcovia.db`
3. Clear localStorage in both browser tabs (Dev Panel → Clear Data)
4. Restart the server

---

## 📋 Checklist Summary

| # | Test | What to Verify |
|---|------|---------------|
| 1 | Basic sync | Changes propagate between devices |
| 2 | Offline focus + sync | Session recorded offline, syncs correctly |
| 3 | Two offline sessions | Rewards computed correctly (no duplicates) |
| 4 | Conflicting task edits | LWW resolves, both devices agree |
| 5 | Edit vs delete | Higher HLC wins, both devices agree |
| 6 | Give up | No rewards for failed sessions |
| 7 | App switch | Auto-fail after 5s grace period |
| 8 | n8n exactly-once | Webhook fires once per session |
| 9 | Double sync | No duplication on retry |
| 10 | Clear & re-sync | Fresh device recovers full state |
