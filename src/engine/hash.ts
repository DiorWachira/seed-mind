/**
 * Zobrist hashing for positions. Two independent 32-bit hashes are combined into one
 * 52-bit number, so it can key a plain Map with a negligible collision rate.
 * The hash is computed from scratch (32 table lookups), which is far cheaper than
 * building the old string key and needs no incremental bookkeeping in simulate().
 */
import type { Move, Position } from './types';

const MAX_SEEDS = 65;

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const r = mulberry(0x5eed);
const table = (n: number): [Uint32Array, Uint32Array] => {
  const a = new Uint32Array(n);
  const b = new Uint32Array(n);
  for (let i = 0; i < n; i++) { a[i] = r(); b[i] = r(); }
  return [a, b];
};

/** [side][pit][count] flattened: ((side * 16 + pit) * MAX_SEEDS + count). */
const [PA, PB] = table(2 * 16 * MAX_SEEDS);
/** [side][stock 0..64]. */
const [SA, SB] = table(2 * MAX_SEEDS);
/** nyumba bits (4 combos), side to move (2), blocked pit (17 incl. none). */
const [XA, XB] = table(4 + 2 + 17);

export function zobrist(pos: Position): number {
  let a = 0;
  let b = 0;
  for (let s = 0; s < 2; s++) {
    const p = pos.pits[s];
    const base = s * 16;
    for (let i = 0; i < 16; i++) {
      const n = p[i];
      if (n === 0) continue;
      const k = (base + i) * MAX_SEEDS + (n < MAX_SEEDS ? n : MAX_SEEDS - 1);
      a ^= PA[k];
      b ^= PB[k];
    }
    const st = pos.stock[s];
    if (st > 0) {
      const k = s * MAX_SEEDS + Math.min(st, MAX_SEEDS - 1);
      a ^= SA[k];
      b ^= SB[k];
    }
  }
  const ny = (+pos.nyumba[0]) | ((+pos.nyumba[1]) << 1);
  a ^= XA[ny]; b ^= XB[ny];
  a ^= XA[4 + pos.toMove]; b ^= XB[4 + pos.toMove];
  const bl = pos.blocked ?? 16;
  a ^= XA[6 + bl]; b ^= XB[6 + bl];
  // 32 bits of a, 20 bits of b: an exact integer below 2^53.
  return (a >>> 0) * 1048576 + (b & 0xfffff);
}

/** Packs a Move into a small integer (for the transposition table and killer slots). */
export function moveCode(m: Move): number {
  const k = m.kichwa === null ? 0 : m.kichwa === 0 ? 1 : 2;
  const s = m.safari === null ? 0 : m.safari ? 2 : 1;
  return m.pit | ((m.dir + 1) << 4) | (k << 6) | (s << 8);
}

/** Inverse of moveCode. */
export function moveFromCode(code: number): Move {
  const k = (code >> 6) & 3;
  const s = (code >> 8) & 3;
  return {
    pit: code & 15,
    dir: (((code >> 4) & 3) - 1) as Move['dir'],
    kichwa: k === 0 ? null : k === 1 ? 0 : 7,
    safari: s === 0 ? null : s === 2,
  };
}
