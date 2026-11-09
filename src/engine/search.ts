import { NYUMBA, innerCount, keteOf, other, positionKey } from './board';
import { houseWorks, legalMoves } from './rules';
import { DEFAULT_RULES, type RuleOptions } from './ruleset';
import type { Candidate, Position, Side } from './types';

/** Scores are in kete (seeds) from the side-to-move's point of view. */
export const WIN = 1000;

/** Static evaluation from `side`'s point of view. */
export function evaluate(pos: Position, side: Side, rules: RuleOptions = DEFAULT_RULES): number {
  const opp = other(side);
  const material = keteOf(pos, side) - keteOf(pos, opp);
  const inner = innerCount(pos, side) - innerCount(pos, opp);
  let house = 0;
  if (houseWorks(pos, side, rules)) house += 1.5 + Math.min(pos.pits[side][NYUMBA], 12) * 0.05;
  if (houseWorks(pos, opp, rules)) house -= 1.5 + Math.min(pos.pits[opp][NYUMBA], 12) * 0.05;
  return material + 0.12 * inner + house;
}

class Timeout extends Error {}

interface TTEntry { depth: number; score: number; flag: 0 | 1 | 2 } // 0 exact, 1 lower, 2 upper

export interface RootScore { cand: Candidate; score: number }

export interface SearchResult {
  best: Candidate | null;
  score: number;
  depth: number;
  nodes: number;
  /** Every root move with its score at the deepest completed depth, best first. */
  scores: RootScore[];
}

export interface SearchOptions {
  maxDepth: number;
  timeMs: number;
  rules?: RuleOptions;
}

export function search(root: Position, opts: SearchOptions): SearchResult {
  const rules = opts.rules ?? DEFAULT_RULES;
  const deadline = Date.now() + opts.timeMs;
  const tt = new Map<string, TTEntry>();
  let nodes = 0;
  const rootMoves = legalMoves(root, rules);
  if (rootMoves.length === 0) return { best: null, score: -WIN, depth: 0, nodes: 0, scores: [] };

  const order = (cs: Candidate[]): Candidate[] =>
    cs.slice().sort((a, b) => b.result.captured - a.result.captured || +b.result.capturedNyumba - +a.result.capturedNyumba);

  const negamax = (pos: Position, depth: number, alpha: number, beta: number, ply: number): number => {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) throw new Timeout();
    // The side that just moved emptied its own inner row: the side to move has won.
    if (innerCount(pos, other(pos.toMove)) === 0) return WIN - ply;
    if (innerCount(pos, pos.toMove) === 0) return -WIN + ply;
    if (depth === 0) return evaluate(pos, pos.toMove, rules);
    const key = positionKey(pos);
    const hit = tt.get(key);
    if (hit && hit.depth >= depth) {
      if (hit.flag === 0) return hit.score;
      if (hit.flag === 1 && hit.score >= beta) return hit.score;
      if (hit.flag === 2 && hit.score <= alpha) return hit.score;
    }
    const cs = legalMoves(pos, rules);
    if (cs.length === 0) return -WIN + ply;
    const a0 = alpha;
    let best = -Infinity;
    for (const c of order(cs)) {
      const v = -negamax(c.result.next, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    tt.set(key, { depth, score: best, flag: best <= a0 ? 2 : best >= beta ? 1 : 0 });
    return best;
  };

  let scores: RootScore[] = order(rootMoves).map((cand) => ({ cand, score: -evaluate(cand.result.next, cand.result.next.toMove, rules) }));
  scores.sort((a, b) => b.score - a.score);
  let doneDepth = 0;
  for (let d = 1; d <= opts.maxDepth; d++) {
    try {
      // Full-window scores at the root so every move gets an exact value (needed by coach and review).
      const next: RootScore[] = scores.map(({ cand }) => ({ cand, score: -negamax(cand.result.next, d - 1, -Infinity, Infinity, 1) }));
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
  return { best: scores[0].cand, score: scores[0].score, depth: doneDepth, nodes, scores };
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
  { level: 4, name: 'Mchezaji', gloss: 'player', note: 'looks at your best reply', maxDepth: 2, timeMs: 300, noise: 0.8 },
  { level: 5, name: 'Hodari', gloss: 'skilled', note: 'protects its nyumba', maxDepth: 3, timeMs: 500, noise: 0.4 },
  { level: 6, name: 'Hodari', gloss: 'skilled', note: 'reads relay sowings to the end', maxDepth: 4, timeMs: 800, noise: 0.15 },
  { level: 7, name: 'Bingwa', gloss: 'champion', note: 'sets traps a few moves out', maxDepth: 5, timeMs: 1200, noise: 0 },
  { level: 8, name: 'Bingwa', gloss: 'champion', note: 'rarely gives up its nyumba', maxDepth: 7, timeMs: 1800, noise: 0 },
  { level: 9, name: 'Fundi', gloss: 'master', note: 'searches as deep as time allows', maxDepth: 30, timeMs: 3000, noise: 0 },
];

export function levelInfo(level: number): Level {
  return LEVELS[Math.max(1, Math.min(9, Math.round(level))) - 1];
}

/** Picks the AI move for a strength level. `rnd` is injectable for tests. */
export function chooseMove(pos: Position, level: number, rules: RuleOptions = DEFAULT_RULES, rnd: () => number = Math.random): SearchResult {
  const L = levelInfo(level);
  const r = search(pos, { maxDepth: L.maxDepth, timeMs: L.timeMs, rules });
  if (L.noise === 0 || r.scores.length < 2) return r;
  let pick = r.scores[0];
  let bestV = -Infinity;
  for (const s of r.scores) {
    const v = s.score + (rnd() - 0.5) * 2 * L.noise;
    if (v > bestV) { bestV = v; pick = s; }
  }
  return { ...r, best: pick.cand, score: pick.score };
}
