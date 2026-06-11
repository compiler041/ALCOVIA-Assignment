/**
 * Hybrid Logical Clock (HLC) implementation.
 * Provides causally-ordered, globally-unique timestamps even when device clocks disagree.
 */

export interface HLCTimestamp {
  ts: number;       // physical time in ms
  counter: number;  // logical counter for ties
  node: string;     // device identifier
}

export function createHLC(node: string): HLCTimestamp {
  return { ts: Date.now(), counter: 0, node };
}

/** Increment local HLC for a new outgoing event */
export function tickHLC(local: HLCTimestamp): HLCTimestamp {
  const wall = Date.now();
  if (wall > local.ts) {
    return { ts: wall, counter: 0, node: local.node };
  }
  return { ts: local.ts, counter: local.counter + 1, node: local.node };
}

/** Merge local HLC with a remote HLC (on receive) */
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
    counter = 0;
  }

  return { ts: pt, counter, node: local.node };
}

/**
 * Compare two HLC timestamps. Returns negative if a < b, positive if a > b, 0 if equal.
 * Order: ts → counter → node (lexicographic)
 */
export function compareHLC(a: HLCTimestamp, b: HLCTimestamp): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.counter !== b.counter) return a.counter - b.counter;
  if (a.node < b.node) return -1;
  if (a.node > b.node) return 1;
  return 0;
}
