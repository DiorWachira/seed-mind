/**
 * Engine matches. Plays engines against each other from seeded openings, both colours,
 * and reports the score. Used for strength checks, eval tuning and level calibration.
 *
 * Library: see match.ts (runner), tune.ts and levels.ts.
 */
import { initialPosition } from '../src/engine/board';
import { legalMoves, status } from '../src/engine/rules';
import { ZANZIBAR, type RuleOptions } from '../src/engine/ruleset';
import { search, type SearchOptions } from '../src/engine/search';
import type { Move, Position, Side } from '../src/engine/types';
import { search as searchV0 } from './search_v0';

export type Player = (pos: Position) => Move;

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Openings: the start position plus 2..5 random plies, so games differ. */
export function openings(n: number, rules: RuleOptions = ZANZIBAR): Position[] {
  const out: Position[] = [];
  for (let k = 0; out.length < n; k++) {
    const r = rng(1000 + k);
    let p = initialPosition();
    const plies = 2 + (k % 4);
    for (let j = 0; j < plies; j++) {
      const ms = legalMoves(p, rules);
      if (ms.length === 0) break;
      p = ms[Math.floor(r() * ms.length)].result.next;
    }
    if (!status(p, undefined, rules).over) out.push(p);
  }
  return out;
}

/** Plays one game; returns the winning seat (or null after maxPlies, adjudicated as a draw). */
export function playGame(start: Position, players: [Player, Player], rules: RuleOptions = ZANZIBAR, maxPlies = 300): Side | null {
  let p = start;
  for (let k = 0; k < maxPlies; k++) {
    const ms = legalMoves(p, rules);
    const st = status(p, ms, rules);
    if (st.over) return st.winner;
    const m = players[p.toMove](p);
    const c = ms.find((x) => x.move.pit === m.pit && x.move.dir === m.dir && x.move.kichwa === m.kichwa && x.move.safari === m.safari);
    if (!c) throw new Error('illegal move from player');
    p = c.result.next;
  }
  return null;
}

/** A vs B over every opening with both colours. Returns A's score (win 1, draw 0.5). */
export function match(a: Player, b: Player, starts: Position[], rules: RuleOptions = ZANZIBAR, log = false): { score: number; games: number; draws: number } {
  let score = 0;
  let draws = 0;
  starts.forEach((s, k) => {
    for (const aSeat of [0, 1] as Side[]) {
      const players: [Player, Player] = aSeat === 0 ? [a, b] : [b, a];
      const w = playGame(s, players, rules);
      if (w === null) { score += 0.5; draws++; } else if (w === aSeat) score += 1;
    }
    if (log) process.stdout.write(`\r  ${k + 1}/${starts.length} openings · A ${score}/${(k + 1) * 2}`);
  });
  if (log) process.stdout.write('\n');
  return { score, games: starts.length * 2, draws };
}

export const engineNew = (o: Partial<SearchOptions> = {}): Player => (pos) =>
  search(pos, { maxDepth: 64, timeMs: 60, exactRoot: false, ...o }).best!.move;
export const engineV0 = (timeMs: number): Player => (pos) => searchV0(pos, { maxDepth: 64, timeMs }).best!.move;

/** Elo difference implied by a score fraction. */
export const elo = (frac: number): number => {
  const f = Math.min(0.99, Math.max(0.01, frac));
  return Math.round(-400 * Math.log10(1 / f - 1));
};

