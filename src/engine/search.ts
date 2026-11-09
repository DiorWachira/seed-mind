import { NYUMBA, innerCount, keteOf, other } from './board';
import { moveCode, zobrist } from './hash';
import { captureTargets, houseWorks, legalMoves } from './rules';
import { DEFAULT_RULES, type RuleOptions } from './ruleset';
import type { Candidate, Move, Position, Side } from './types';

/** Scores are in kete (seeds) from the side-to-move's point of view. */
export const WIN = 1000;

/**
 * Evaluation weights, in kete. Tuned by self-play (scripts/tune.ts); see
 * docs/PROJECT_GUIDE.md §5.4 for how and what each term means.
 */
export interface EvalWeights {
  /** Per kete of inner-row difference (front-row seeds are the ones that capture and defend). */
  inner: number;
  /** Bonus for a working nyumba, plus a little per kete in it (capped at 12). */
  houseBase: number;
  housePerSeed: number;
  /** Per kete the other side could capture right now (vulnerable kete), mine minus theirs. */
  vulnerable: number;
}

export const EVAL_V0: EvalWeights = { inner: 0.12, houseBase: 1.5, housePerSeed: 0.05, vulnerable: 0 };
export const EVAL: EvalWeights = { inner: 0, houseBase: 0, housePerSeed: 0, vulnerable: 1 };

function threatened(pos: Position, attacker: Side, rules: RuleOptions): number {
  const victim = pos.pits[other(attacker)];
  let n = 0;
  for (const j of captureTargets(pos, attacker, rules)) n += victim[j];
  return n;
}

/** Static evaluation from `side`'s point of view. */
export function evaluate(pos: Position, side: Side, rules: RuleOptions = DEFAULT_RULES, w: EvalWeights = EVAL): number {
  const opp = other(side);
  const material = keteOf(pos, side) - keteOf(pos, opp);
  const inner = innerCount(pos, side) - innerCount(pos, opp);
  let house = 0;
  if (houseWorks(pos, side, rules)) house += w.houseBase + Math.min(pos.pits[side][NYUMBA], 12) * w.housePerSeed;
  if (houseWorks(pos, opp, rules)) house -= w.houseBase + Math.min(pos.pits[opp][NYUMBA], 12) * w.housePerSeed;
  let v = material + w.inner * inner + house;
  if (w.vulnerable !== 0) v += w.vulnerable * (threatened(pos, side, rules) - threatened(pos, opp, rules));
  return v;
}

class Timeout extends Error {}

interface TTEntry { depth: number; score: number; flag: 0 | 1 | 2; move: number } // flag 0 exact, 1 lower, 2 upper

export interface RootScore { cand: Candidate; score: number }

export interface SearchResult {
  best: Candidate | null;
  score: number;
  depth: number;
  nodes: number;
  /** Root moves with their scores at the deepest completed depth, best first (exact when exactRoot). */
  scores: RootScore[];
  /** Principal variation: the expected line, starting with the best move. */
  pv: Move[];
}

export interface SearchOptions {
  maxDepth: number;
  timeMs: number;
  rules?: RuleOptions;
  /** Exact scores for every root move (coach, review, noisy levels). Off = plain alpha-beta at the root, which goes deeper. Default true. */
  exactRoot?: boolean;
  /** Capture-only extension at the horizon, in plies (0 = off, the default: self-play showed the time is better spent on depth). */
  quiescence?: number;
  weights?: EvalWeights;
}

const TT_LIMIT = 1_500_000;
const MAX_PLY = 128;

export function search(root: Position, opts: SearchOptions): SearchResult {
  const rules = opts.rules ?? DEFAULT_RULES;
  const weights = opts.weights ?? EVAL;
  const exactRoot = opts.exactRoot ?? true;
  const qMax = opts.quiescence ?? 0;
  const deadline = Date.now() + opts.timeMs;
  const tt = new Map<number, TTEntry>();
  const killers = new Int32Array(MAX_PLY * 2).fill(-1);
  let nodes = 0;
  const rootMoves = legalMoves(root, rules);
  if (rootMoves.length === 0) return { best: null, score: -WIN, depth: 0, nodes: 0, scores: [], pv: [] };

  const tick = () => { if ((++nodes & 1023) === 0 && Date.now() > deadline) throw new Timeout(); };

  /** Move ordering: hash move, then the biggest captures (and house captures), then killer moves. */
  const order = (cs: Candidate[], ttMove: number, ply: number): Candidate[] => {
    const k1 = killers[ply * 2];
    const k2 = killers[ply * 2 + 1];
    const keyed = cs.map((c) => {
      const code = moveCode(c.move);
      let s = c.result.captured * 4 + (c.result.capturedNyumba ? 20 : 0);
      if (code === ttMove) s += 1e6;
      else if (code === k1) s += 1e4;
      else if (code === k2) s += 9e3;
      return { c, s };
    });
    keyed.sort((a, b) => b.s - a.s);
    return keyed.map((x) => x.c);
  };

  /** Captures are compulsory, so a position with a capture on is not quiet: play the captures out. */
  const quiesce = (pos: Position, alpha: number, beta: number, ply: number, q: number): number => {
    tick();
    if (innerCount(pos, other(pos.toMove)) === 0) return WIN - ply;
    if (innerCount(pos, pos.toMove) === 0) return -WIN + ply;
    if (q <= 0 || captureTargets(pos, pos.toMove, rules).size === 0) return evaluate(pos, pos.toMove, rules, weights);
    const cs = legalMoves(pos, rules);
    if (cs.length === 0) return -WIN + ply;
    if (cs[0].result.kind !== 'capture') return evaluate(pos, pos.toMove, rules, weights);
    let best = -Infinity;
    for (const c of order(cs, -1, Math.min(ply, MAX_PLY - 1))) {
      const v = -quiesce(c.result.next, -beta, -alpha, ply + 1, q - 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  };

  const negamax = (pos: Position, depth: number, alpha: number, beta: number, ply: number): number => {
    tick();
    // The side that just moved emptied its own inner row: the side to move has won.
    if (innerCount(pos, other(pos.toMove)) === 0) return WIN - ply;
    if (innerCount(pos, pos.toMove) === 0) return -WIN + ply;
    if (depth <= 0) return quiesce(pos, alpha, beta, ply, qMax);
    const key = zobrist(pos);
    const hit = tt.get(key);
    let ttMove = -1;
    if (hit) {
      ttMove = hit.move;
      if (hit.depth >= depth) {
        if (hit.flag === 0) return hit.score;
        if (hit.flag === 1 && hit.score >= beta) return hit.score;
        if (hit.flag === 2 && hit.score <= alpha) return hit.score;
      }
    }
    const cs = legalMoves(pos, rules);
    if (cs.length === 0) return -WIN + ply;
    const kp = Math.min(ply, MAX_PLY - 1);
    const a0 = alpha;
    let best = -Infinity;
    let bestCode = -1;
    for (const c of order(cs, ttMove, kp)) {
      const v = -negamax(c.result.next, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) { best = v; bestCode = moveCode(c.move); }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (c.result.kind !== 'capture' && killers[kp * 2] !== bestCode) {
          killers[kp * 2 + 1] = killers[kp * 2];
          killers[kp * 2] = bestCode;
        }
        break;
      }
    }
    if (tt.size > TT_LIMIT) tt.clear();
    tt.set(key, { depth, score: best, flag: best <= a0 ? 2 : best >= beta ? 1 : 0, move: bestCode });
    return best;
  };

  let scores: RootScore[] = order(rootMoves, -1, 0).map((cand) => ({ cand, score: -evaluate(cand.result.next, cand.result.next.toMove, rules, weights) }));
  scores.sort((a, b) => b.score - a.score);
  let doneDepth = 0;
  for (let d = 1; d <= opts.maxDepth; d++) {
    try {
      let next: RootScore[];
      if (exactRoot) {
        // Full-window scores at the root so every move gets an exact value (needed by coach and review).
        next = scores.map(({ cand }) => ({ cand, score: -negamax(cand.result.next, d - 1, -Infinity, Infinity, 1) }));
      } else {
        let alpha = -Infinity;
        next = [];
        for (const { cand } of scores) {
          const v = -negamax(cand.result.next, d - 1, -Infinity, -alpha, 1);
          next.push({ cand, score: v });
          if (v > alpha) alpha = v;
        }
      }
      next.sort((a, b) => b.score - a.score);
      scores = next;
      doneDepth = d;
      if (Math.abs(scores[0].score) > WIN - 100) break;
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    if (Date.now() > deadline) break;
  }

  // Follow the hash moves from the best root move to recover the expected line.
  const pv: Move[] = [scores[0].cand.move];
  let p = scores[0].cand.result.next;
  const seen = new Set<number>();
  for (let k = 1; k < Math.max(2, doneDepth); k++) {
    const key = zobrist(p);
    const e = tt.get(key);
    if (!e || e.move < 0 || seen.has(key)) break;
    seen.add(key);
    const c = legalMoves(p, rules).find((x) => moveCode(x.move) === e.move);
    if (!c) break;
    pv.push(c.move);
    p = c.result.next;
  }

  return { best: scores[0].cand, score: scores[0].score, depth: doneDepth, nodes, scores, pv };
}

export interface Level {
  level: number;
  name: string;
  gloss: string;
  note: string;
  maxDepth: number;
  timeMs: number;
  /** Random spread added to root scores, in kete. 0 = always the best move. */
  noise: number;
}

export const LEVELS: Level[] = [
  { level: 1, name: 'Mwanafunzi', gloss: 'pupil', note: 'plays legal moves and often misses captures', maxDepth: 1, timeMs: 150, noise: 8 },
  { level: 2, name: 'Mwanafunzi', gloss: 'pupil', note: 'sees one capture ahead', maxDepth: 1, timeMs: 150, noise: 3 },
  { level: 3, name: 'Mchezaji', gloss: 'player', note: 'takes the captures it sees', maxDepth: 2, timeMs: 250, noise: 2 },
  { level: 4, name: 'Mchezaji', gloss: 'player', note: 'looks at your best reply', maxDepth: 3, timeMs: 300, noise: 1 },
  { level: 5, name: 'Hodari', gloss: 'skilled', note: 'protects its nyumba', maxDepth: 4, timeMs: 500, noise: 0.5 },
  { level: 6, name: 'Hodari', gloss: 'skilled', note: 'reads relay sowings to the end', maxDepth: 5, timeMs: 800, noise: 0.2 },
  { level: 7, name: 'Bingwa', gloss: 'champion', note: 'sets traps a few moves out', maxDepth: 6, timeMs: 1200, noise: 0 },
  { level: 8, name: 'Bingwa', gloss: 'champion', note: 'rarely gives up its nyumba', maxDepth: 8, timeMs: 1800, noise: 0 },
  { level: 9, name: 'Fundi', gloss: 'master', note: 'searches as deep as time allows', maxDepth: 30, timeMs: 3000, noise: 0 },
];

export function levelInfo(level: number): Level {
  return LEVELS[Math.max(1, Math.min(9, Math.round(level))) - 1];
}

/** Picks the AI move for a strength level. `rnd` is injectable for tests. */
export function chooseMove(pos: Position, level: number, rules: RuleOptions = DEFAULT_RULES, rnd: () => number = Math.random): SearchResult {
  const L = levelInfo(level);
  const r = search(pos, { maxDepth: L.maxDepth, timeMs: L.timeMs, rules, exactRoot: L.noise > 0 });
  if (L.noise === 0 || r.scores.length < 2) return r;
  let pick = r.scores[0];
  let bestV = -Infinity;
  for (const s of r.scores) {
    const v = s.score + (rnd() - 0.5) * 2 * L.noise;
    if (v > bestV) { bestV = v; pick = s; }
  }
  return { ...r, best: pick.cand, score: pick.score, pv: [pick.cand.move] };
}
