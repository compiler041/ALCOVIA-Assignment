/**
 * Hybrid Logical Clock (HLC) implementation for Alcovia.
 *
 * An HLC combines a physical wall-clock timestamp with a logical counter
 * and a node identifier. This gives us causally-ordered, globally-unique
 * timestamps even when device clocks are slightly skewed.
 */

export interface HLCTimestamp {
  /** Physical time in milliseconds (Date.now()-style) */
  ts: number;
  /** Logical counter – breaks ties when ts values are equal */
  counter: number;
  /** Node / device identifier */
  node: string;
}

/**
 * Compare two HLC timestamps.
 * Order: first by physical ts, then by counter, then by node (lexicographic).
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareHLC(a: HLCTimestamp, b: HLCTimestamp): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.counter !== b.counter) return a.counter - b.counter;
  if (a.node < b.node) return -1;
  if (a.node > b.node) return 1;
  return 0;
}

/**
 * Merge a local HLC with a received remote HLC.
 *
 * Algorithm (Kulkarni et al.):
 *   pt = max(local.ts, remote.ts, Date.now())
 *   if pt === local.ts === remote.ts  → counter = max(local.counter, remote.counter) + 1
 *   else if pt === local.ts           → counter = local.counter + 1
 *   else if pt === remote.ts          → counter = remote.counter + 1
 *   else (pt === wall)                → counter = 0
 *   node stays as the local node
 */
export function mergeHLC(local: HLCTimestamp, remote: HLCTimestamp): HLCTimestamp {
  const wall = Date.now();
  const pt = Math.max(local.ts, remote.ts, wall);

  let counter: number;

  if (pt === local.ts && pt === remote.ts) {
    counter = Math.max(local.counter, remote.counter) + 1;
  } else if (pt === local.ts) {
    counter = local.counter + 1;
  } else if (pt === remote.ts) {
    counter = remote.counter + 1;
  } else {
    // wall clock is ahead of both → reset counter
    counter = 0;
  }

  return { ts: pt, counter, node: local.node };
}

/**
 * Create a fresh "send" / local-tick HLC from the current local state.
 */
export function tickHLC(local: HLCTimestamp): HLCTimestamp {
  const wall = Date.now();
  if (wall > local.ts) {
    return { ts: wall, counter: 0, node: local.node };
  }
  return { ts: local.ts, counter: local.counter + 1, node: local.node };
}

/**
 * Create an initial HLC for a given node.
 */
export function createHLC(node: string): HLCTimestamp {
  return { ts: Date.now(), counter: 0, node };
}
