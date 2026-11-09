import { dirWord, facing, other, pitName, sameMove } from './board';
import { legalMoves, playTraced } from './rules';
import { DEFAULT_RULES, type RuleOptions } from './ruleset';
import { search } from './search';
import type { Candidate, Move, Position, Side } from './types';

export interface Advice {
  move: Move;
  /** Short headline, e.g. "Place into A4, then sow from the left kichwa." */
  headline: string;
  /** One or two plain sentences on why. */
  why: string;
  score: number;
  depth: number;
  /** Pits (in the mover's own frame) for the board's coach light. */
  startPit: number;
  /** Opponent pits (opponent frame) this move captures from. */
  targets: number[];
  /** Mover pits sown, in order, for the raking light. */
  path: number[];
  /** The expected line, starting with this move. */
  pv: Move[];
  /** Every legal move with its score (kete, mover's view), best first. Answers "why not this move?". */
  scores: { move: Move; score: number }[];
}

const kichwaWord = (k: 0 | 7): string => (k === 0 ? 'left' : 'right');

/** Opponent's best capture after `next`: kete taken and whether it takes our nyumba. */
function worstReply(next: Position, me: Side, rules: RuleOptions): { captured: number; takesHouse: boolean } {
  let captured = 0;
  let takesHouse = false;
  for (const c of legalMoves(next, rules)) {
    if (c.result.kind !== 'capture') continue;
    if (c.result.captured > captured) captured = c.result.captured;
    if (c.result.capturedNyumba && next.nyumba[me]) takesHouse = true;
  }
  return { captured, takesHouse };
}

/** Explains a candidate from `viewer`'s seat (normally the mover). */
export function describe(pos: Position, cand: Candidate, viewer: Side, rules: RuleOptions = DEFAULT_RULES): { headline: string; why: string } {
  const s = pos.toMove;
  const o = other(s);
  const m = cand.move;
  const r = cand.result;
  const name = (i: number) => pitName(viewer, s, i);
  const oname = (i: number) => pitName(viewer, o, i);
  const namua = pos.stock[s] > 0;
  const them = s === viewer ? 'Fundi' : 'you';
  let headline: string;
  const why: string[] = [];

  if (namua && r.kind === 'capture') {
    const j = facing(m.pit);
    headline = `Place into ${name(m.pit)} and capture ${pos.pits[o][j]} from ${oname(j)}.`;
    if (m.kichwa !== null) headline = headline.replace(/\.$/, `, sowing from the ${kichwaWord(m.kichwa)} kichwa.`);
  } else if (namua) {
    headline = r.taxed
      ? `Tax the nyumba: place there and sow two kete ${dirWord(m.dir as 1 | -1)}.`
      : `Place into ${name(m.pit)} and sow ${dirWord(m.dir as 1 | -1)}.`;
  } else if (r.taxed) {
    headline = `Tax the nyumba: sow two kete from ${name(m.pit)} ${dirWord(m.dir as 1 | -1)}.`;
  } else {
    headline = `Lift ${name(m.pit)} (${pos.pits[s][m.pit]}) and sow ${dirWord(m.dir as 1 | -1)}.`;
  }

  if (r.kind === 'capture') {
    why.push(r.captures > 1 ? `The sowing chains ${r.captures} captures for ${r.captured} kete in all.` : `That takes ${r.captured} kete.`);
    if (r.capturedNyumba) why.push('It empties the opposing nyumba, which loses its powers for the rest of the game.');
  } else {
    why.push('No capture is available, so this is a quiet move.');
  }
  if (r.safariTaken) why.push('Taking the safari spends the nyumba to keep the sowing going.');
  else if (r.endReason === 'nyumba') why.push('The sowing stops in the nyumba, which keeps its powers.');
  if (r.endReason === 'blocked') why.push('The sowing stops on the pit takasia protects.');
  if (r.next.blocked != null) why.push(`Takasia: ${them === 'you' ? 'you' : 'Fundi'} may not empty ${oname(r.next.blocked)} on a quiet turn next.`);
  const reply = worstReply(r.next, s, rules);
  const replier = them === 'you' ? 'Your' : 'Fundi’s';
  if (reply.takesHouse) why.push(`Watch out: ${them === 'you' ? 'you' : 'Fundi'} can capture the nyumba next.`);
  else if (reply.captured === 0) why.push(`${them === 'you' ? 'You have' : 'Fundi has'} no capture in reply.`);
  else why.push(`${replier} best reply captures ${reply.captured}.`);
  return { headline, why: why.join(' ') };
}

function lightFor(pos: Position, cand: Candidate, rules: RuleOptions): { path: number[]; targets: number[] } {
  const tr = playTraced(pos, cand.move, rules);
  const path: number[] = [];
  const targets: number[] = [];
  for (const e of tr.events) {
    if (e.t === 'sow' && path.length < 10) path.push(e.pit);
    if (e.t === 'capture') targets.push(e.pit);
  }
  return { path, targets };
}

export function advise(pos: Position, opts = { maxDepth: 5, timeMs: 700 }, rules: RuleOptions = DEFAULT_RULES): Advice | null {
  const r = search(pos, { ...opts, rules });
  if (!r.best) return null;
  const { headline, why } = describe(pos, r.best, pos.toMove, rules);
  const { path, targets } = lightFor(pos, r.best, rules);
  return {
    move: r.best.move, headline, why, score: r.score, depth: r.depth, startPit: r.best.move.pit, targets, path,
    pv: r.pv, scores: r.scores.map((x) => ({ move: x.cand.move, score: x.score })),
  };
}

export interface WhyNot {
  /** Kete given up against the coach's move (>= 0). */
  loss: number;
  verdict: 'best' | 'fine' | 'inaccuracy' | 'mistake' | 'blunder';
  /** One plain sentence comparing the two. */
  summary: string;
  /** What the chosen move does, and why it falls short. */
  chosen: { headline: string; why: string };
  coach: { headline: string; why: string };
}

/** Grades a loss in kete into words (shared by Play and Review). */
export function verdictFor(loss: number): WhyNot['verdict'] {
  if (loss < 0.05) return 'best';
  if (loss < 0.5) return 'fine';
  if (loss < 1.5) return 'inaccuracy';
  if (loss < 4) return 'mistake';
  return 'blunder';
}

/** "Why not this move?": compares a candidate with the coach's pick, using the advice's scores. */
export function whyNot(pos: Position, advice: Advice, cand: Candidate, viewer: Side, rules: RuleOptions = DEFAULT_RULES): WhyNot | null {
  const best = advice.scores[0];
  const mine = advice.scores.find((x) => sameMove(x.move, cand.move));
  if (!best || !mine) return null;
  const loss = Math.max(0, best.score - mine.score);
  const verdict = verdictFor(loss);
  const bestCand = legalMoves(pos, rules).find((c) => sameMove(c.move, best.move));
  const chosen = describe(pos, cand, viewer, rules);
  const coach = bestCand ? describe(pos, bestCand, viewer, rules) : { headline: advice.headline, why: advice.why };
  const k = loss.toFixed(1);
  const decisive = Math.abs(best.score) > 900 || Math.abs(mine.score) > 900;
  let summary: string;
  if (verdict === 'best') summary = 'This is the coach’s move too.';
  else if (decisive && best.score > 900 && mine.score < 900) summary = 'The coach’s move wins by force; this one lets the win slip.';
  else if (decisive && mine.score < -900) summary = 'This move loses by force. The coach’s move holds on.';
  else if (verdict === 'fine') summary = `A good move: within ${k} kete of the coach’s.`;
  else summary = `This gives up about ${k} kete against the coach’s move (${verdict}).`;
  return { loss, verdict, summary, chosen, coach };
}

export interface PlyAnalysis {
  ply: number;
  mover: Side;
  best: Move;
  bestScore: number;
  playedScore: number;
  /** Kete lost versus the best move (>= 0). */
  loss: number;
  /** Evaluation after this ply from South's (seat 0) point of view. */
  evalSouth: number;
  /** The coach's line from this position, starting with its best move. */
  pv: Move[];
  depth: number;
}

/** Scores the played move against the best one at a fixed depth. */
export function analysePly(pos: Position, played: Move, ply: number, opts = { maxDepth: 3, timeMs: 400 }, rules: RuleOptions = DEFAULT_RULES): PlyAnalysis {
  const r = search(pos, { ...opts, rules });
  const best = r.scores[0];
  const mine = r.scores.find((x) => sameMove(x.cand.move, played)) ?? best;
  const loss = Math.max(0, best.score - mine.score);
  const evalSouth = pos.toMove === 0 ? mine.score : -mine.score;
  return { ply, mover: pos.toMove, best: best.cand.move, bestScore: best.score, playedScore: mine.score, loss, evalSouth, pv: r.pv, depth: r.depth };
}
