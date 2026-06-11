# Architectural Decisions (DECISIONS.md)

This document outlines the core architectural choices made to satisfy Alcovia's offline-first, multi-device sync requirements.

## 1. Offline-First Sync Model: Event Sourcing & CRDTs
Instead of updating "state" (e.g., `UPDATE tasks SET status = 'done'`), the client and server communicate exclusively via **Event Sourcing**. 
Every action a user takes (completing a focus session, changing a task status) generates an immutable `SyncEvent`.

**Why?**
* **Offline safety:** If a user is offline, we just append events to a local queue (`localStorage`). 
* **Zero data loss:** When the device reconnects, it simply pushes all unseen events to the server. The server stores a canonical, append-only log of all events.
* **Easy Sync:** Syncing is reduced to a simple push/pull. The client sends events the server hasn't seen, and the server sends events the client hasn't seen (tracked via a monotonic `serverVersion` counter).

## 2. Conflict Resolution: Hybrid Logical Clocks (HLCs)
Students often use multiple devices offline. If Device A marks "Math" as `in_progress`, and Device B marks it as `done` offline, we need a deterministic way to resolve the conflict when both sync.

* **The Problem with Wall Clocks:** We cannot trust `Date.now()`. If a student's laptop clock is 5 minutes behind their phone, wall-clock conflict resolution will silently overwrite new data with old data.
* **The Solution:** We implemented a **Hybrid Logical Clock (HLC)**. 
  * Every event is tagged with an HLC timestamp (Wall time + Logical Counter + Device ID).
  * HLCs guarantee a **total, deterministic ordering of events**, regardless of clock skew.
  * For Syllabus Tasks, we use an HLC-backed **Last-Writer-Wins (LWW) Register**. The event with the "highest" HLC timestamp always dictates the final state of the task, ensuring both devices converge to the exact same UI state.

## 3. Reward Calculation & Idempotency
Instead of maintaining a fragile `coins` counter in the database (which is prone to double-counting if a sync request is retried due to bad Wi-Fi), **rewards are computed dynamically**.

* **Determinism:** The server calculates `streak`, `coins`, and `todayMinutes` by running a reducer over the user's sorted `focus_session` events.
* **Idempotency:** If the client accidentally syncs the same focus session twice (due to a dropped HTTP connection), the server ignores the duplicate event ID. The calculated rewards remain exactly the same.

## 4. Webhook Exactly-Once Delivery
n8n automations trigger WhatsApp messages for successful focus sessions. We must ensure a student never gets two messages for the same session.

* **Deduplication Table:** The server maintains a `notifications_sent` SQLite table.
* **Atomic Transactions:** When a sync request comes in with a new focus session, the server wraps the check in a database transaction. It inserts the `session_id` into the deduplication table. If the insert succeeds, it fires the n8n webhook. If the session was already synced by another device, the check fails, and no duplicate webhook is fired.

## 5. Built-in Mock WhatsApp
To make this take-home assignment trivial to run and grade without requiring you to install or host an n8n instance, the Express server includes a built-in Mock WhatsApp endpoint (`/api/mock-whatsapp`). 

It perfectly simulates the n8n webhook behavior, logging the "WhatsApp message" to the server console and surfacing it directly in the React Native Dev Panel. The codebase is fully ready for real n8n—you just change the `N8N_WEBHOOK_URL` environment variable.
