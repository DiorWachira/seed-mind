/**
 * Bao la Kiswahili rules. RULES.md is the spec: it gives the sources and the decisions (D#)
 * taken where they disagree. Switchable decisions live in RuleOptions (ruleset.ts).
 */
import { NYUMBA, facing, innerCount, other } from './board';
import { DEFAULT_RULES, type RuleOptions } from './ruleset';
import type { Candidate, Decision, Dir, EndReason, GameStatus, Move, MoveResult, Position, Side, SowEvent } from './types';

/** Hard backstop: more kete than this sown in one turn counts as never-ending. */
export const SOW_LIMIT = 4000;
/** After this many kete sown, start checking for an exact repeated state (D5). */
const CYCLE_CHECK_AFTER = 160;

const isDecision = (x: unknown): x is Decision => typeof x === 'object' && x !== null && 'need' in x;

/** Does `side`'s nyumba have its powers right now? (D3) */
export function houseWorks(pos: Position, side: Side, rules: RuleOptions = DEFAULT_RULES): boolean {
  return pos.nyumba[side]
    && pos.pits[side][NYUMBA] >= rules.nyumbaMinSeeds
    && (rules.nyumbaStages === 'both' || pos.stock[side] > 0);
}

/**
 * Opponent pits (opponent's frame) that `side` could capture if it were to move now.
 * Used for takasia (D8). Mirrors the capture tests in simulate().
 */
export function captureTargets(pos: Position, side: Side, rules: RuleOptions = DEFAULT_RULES): Set<number> {
  const me = pos.pits[side];
  const op = pos.pits[other(side)];
  const out = new Set<number>();
  if (pos.stock[side] > 0) {
    for (let i = 0; i < 8; i++) if (me[i] > 0 && op[facing(i)] > 0) out.add(facing(i));
    return out;
  }
  const taxHouse = rules.mtajiTaxing && houseWorks(pos, side, rules);
  for (let i = 0; i < 16; i++) {
    const n = i === NYUMBA && taxHouse ? 2 : me[i];
    if (n < 2 || n > 15) continue;
    for (const d of [1, -1]) {
      const p = (((i + d * n) % 16) + 16) % 16;
      if (p < 8 && me[p] > 0 && op[facing(p)] > 0) out.add(facing(p));
    }
  }
  return out;
}

/** Takasia exemptions (D8): the owner's working nyumba, its only filled inner pit, its only inner pit with 2+. */
function takasiaExempt(pos: Position, owner: Side, q: number, rules: RuleOptions): boolean {
  const p = pos.pits[owner];
  if (q === NYUMBA && (rules.takasiaHouse === 'pit' || houseWorks(pos, owner, rules))) return true;
  let filled = 0;
  let multi = 0;
  for (let i = 0; i < 8; i++) {
    if (p[i] > 0) filled++;
    if (p[i] > 1) multi++;
  }
  if (filled === 1 && p[q] > 0) return true;
  if (multi === 1 && p[q] > 1) return true;
  return false;
}

/**
 * Plays one full turn for pos.toMove. Returns a Decision when the move leaves a
 * mid-turn choice (kichwa or safari) open, so callers can branch on it.
 * Does not check legality; use legalMoves for that.
 */
export function simulate(pos: Position, move: Move, trace = false, rules: RuleOptions = DEFAULT_RULES): MoveResult | Decision {
  const s = pos.toMove;
  const o = other(s);
  const me = pos.pits[s].slice();
  const op = pos.pits[o].slice();
  const stock: [number, number] = [pos.stock[0], pos.stock[1]];
  const nyumba: [boolean, boolean] = [pos.nyumba[0], pos.nyumba[1]];
  const events: SowEvent[] = [];
  const namua = stock[s] > 0;
  const blocked = pos.blocked ?? null;

  let sown = 0;
  let captures = 0;
  let captured = 0;
  let capturedNyumba = false;
  let safariTaken = false;
  let taxed = false;

  const myHouse = (): boolean =>
    nyumba[s] && me[NYUMBA] >= rules.nyumbaMinSeeds && (rules.nyumbaStages === 'both' || namua);
  /** D13: the stop/safari choice in a capture turn (threshold may differ from the takasa stop). */
  const safariHouse = (): boolean =>
    nyumba[s] && me[NYUMBA] >= (rules.safariMinSeeds ?? rules.nyumbaMinSeeds) && (rules.nyumbaStages === 'both' || namua);

  const lift = (p: number, n: number): void => {
    me[p] -= n;
    if (p === NYUMBA && me[p] === 0) nyumba[s] = false;
    if (trace) events.push({ t: 'lift', side: s, pit: p, n });
  };

  /** Sows n seeds one by one starting with the pit after `from`. Returns the last pit. */
  const sowAfter = (from: number, n: number, d: Dir): number => {
    let q = from;
    for (let k = 0; k < n; k++) {
      q = (q + d + 16) % 16;
      me[q]++;
      sown++;
      if (trace) events.push({ t: 'sow', side: s, pit: q });
      if (sown > SOW_LIMIT) break;
    }
    return q;
  };

  /**
   * Capture from my inner pit i. `cur` is the current sowing direction (0 if none yet).
   * Kichwa/kimbi captures re-enter from the nearest kichwa; middle captures keep the current
   * direction, or give a free kichwa choice when there is no direction yet (D1, D2).
   */
  const capture = (i: number, cur: Dir | 0): { land: number; dir: Dir } | Decision => {
    let k: 0 | 7;
    if (i <= 1) k = 0;
    else if (i >= 6) k = 7;
    else if (cur === 0) {
      if (move.kichwa === null) return { need: 'kichwa' };
      k = move.kichwa;
    } else k = cur === 1 ? 0 : 7;
    const j = facing(i);
    const n = op[j];
    op[j] = 0;
    if (j === NYUMBA && nyumba[o]) {
      nyumba[o] = false;
      capturedNyumba = true;
    }
    captures++;
    captured += n;
    if (trace) events.push({ t: 'capture', side: o, pit: j, n, kichwa: k });
    const d: Dir = k === 0 ? 1 : -1;
    // The first captured seed goes into the kichwa itself.
    const land = sowAfter((k - d + 16) % 16, n, d);
    return { land, dir: d };
  };

  let p: number;
  let dir: Dir;
  let kind: 'capture' | 'takata';

  if (namua) {
    p = move.pit;
    stock[s]--;
    me[p]++;
    if (trace) events.push({ t: 'place', side: s, pit: p });
    if (op[facing(p)] > 0) {
      kind = 'capture';
      const r = capture(p, 0);
      if (isDecision(r)) return r;
      p = r.land;
      dir = r.dir;
    } else {
      kind = 'takata';
      dir = move.dir as Dir;
      let n: number;
      if (p === NYUMBA && myHouse()) {
        // Taxing: only two kete leave the house, which keeps its powers.
        n = 2;
        taxed = true;
        me[p] -= 2;
        if (trace) events.push({ t: 'lift', side: s, pit: p, n: 2 });
      } else {
        n = me[p];
        lift(p, n);
      }
      p = sowAfter(p, n, dir);
    }
  } else {
    dir = move.dir as Dir;
    let n: number;
    if (move.pit === NYUMBA && rules.mtajiTaxing && myHouse()) {
      n = 2;
      taxed = true;
      me[NYUMBA] -= 2;
      if (trace) events.push({ t: 'lift', side: s, pit: NYUMBA, n: 2 });
    } else {
      n = me[move.pit];
      lift(move.pit, n);
    }
    p = sowAfter(move.pit, n, dir);
    // A first sowing of more than 15 kete wraps the whole loop: always takata.
    kind = n <= 15 && p < 8 && me[p] > 1 && op[facing(p)] > 0 ? 'capture' : 'takata';
  }

  let endReason: EndReason = 'empty';
  let seen: Set<string> | null = null;

  for (;;) {
    if (sown > SOW_LIMIT) { endReason = 'limit'; break; }
    if (me[p] === 1) { endReason = 'empty'; break; }
    if (kind === 'capture' && p < 8 && op[facing(p)] > 0) {
      const r = capture(p, dir);
      if (isDecision(r)) return r;
      p = r.land;
      dir = r.dir;
      continue;
    }
    if (p === NYUMBA && kind === 'capture' && safariHouse()) {
      if (move.safari === null) return { need: 'safari' };
      if (!move.safari) { endReason = 'nyumba'; break; }
      nyumba[s] = false;
      safariTaken = true;
    } else if (p === NYUMBA && kind === 'takata' && myHouse()) {
      endReason = 'nyumba';
      break;
    }
    // Takasia: a non-capturing relay may not lift the blocked pit (D8).
    if (kind === 'takata' && p === blocked) { endReason = 'blocked'; break; }
    // Never-ending move detection (D5): the turn is deterministic from here,
    // so an exact repeat of this state means it would loop forever.
    if (sown > CYCLE_CHECK_AFTER) {
      seen ??= new Set();
      const key = `${me.join(',')}|${op.join(',')}|${p}|${dir}|${kind}|${+nyumba[0]}${+nyumba[1]}`;
      if (seen.has(key)) { endReason = 'limit'; break; }
      seen.add(key);
    }
    const n = me[p];
    lift(p, n);
    p = sowAfter(p, n, dir);
  }

  if (trace) events.push({ t: 'end', side: s, pit: p, reason: endReason });
  const pits: [number[], number[]] = s === 0 ? [me, op] : [op, me];
  const next: Position = { pits, stock, nyumba, toMove: o, blocked: null };

  // Takasia (D8): after a non-capturing turn that leaves the mover exactly one capture,
  // the opponent may not empty that threatened pit on its next non-capturing turn.
  if (rules.takasia !== 'off' && kind === 'takata' && endReason !== 'limit' && (rules.takasia === 'always' || !namua)) {
    const targets = captureTargets(next, s, rules);
    if (targets.size === 1) {
      const q = targets.values().next().value as number;
      if (!takasiaExempt(next, o, q, rules)) next.blocked = q;
    }
  }

  return { next, events, kind, captures, captured, capturedNyumba, safariTaken, taxed, endPit: p, endReason, sown };
}

/** Expands open decisions into concrete moves; drops never-ending sowings. */
function expand(pos: Position, m: Move, out: Candidate[], rules: RuleOptions): void {
  const r = simulate(pos, m, false, rules);
  if (isDecision(r)) {
    if (r.need === 'kichwa') {
      expand(pos, { ...m, kichwa: 0 }, out, rules);
      expand(pos, { ...m, kichwa: 7 }, out, rules);
    } else {
      expand(pos, { ...m, safari: false }, out, rules);
      expand(pos, { ...m, safari: true }, out, rules);
    }
    return;
  }
  if (r.endReason === 'limit') return;
  out.push({ move: m, result: r });
}

/** Every legal turn for pos.toMove, with its outcome. Captures are compulsory. */
export function legalMoves(pos: Position, rules: RuleOptions = DEFAULT_RULES): Candidate[] {
  const s = pos.toMove;
  const me = pos.pits[s];
  const op = pos.pits[other(s)];
  const blocked = pos.blocked ?? null;
  const out: Candidate[] = [];

  if (pos.stock[s] > 0) {
    const filled: number[] = [];
    for (let i = 0; i < 8; i++) if (me[i] > 0) filled.push(i);
    const markers = filled.filter((i) => op[facing(i)] > 0);
    if (markers.length > 0) {
      for (const i of markers) expand(pos, { pit: i, dir: 0, kichwa: null, safari: null }, out, rules);
      if (out.length > 0) return out;
    }
    // Takasa. A working house (counting the placed kete) is only taxed when it is the only filled inner pit (D4).
    const houseOnly = filled.length === 1 && filled[0] === NYUMBA;
    const houseWouldWork = pos.nyumba[s] && me[NYUMBA] + 1 >= rules.nyumbaMinSeeds;
    let starts = filled.filter((i) => !(i === NYUMBA && houseWouldWork && !houseOnly));
    // D9: no single-kete start while another front pit has 2+, unless the house is still owned.
    if (rules.namuaSingleKete && !pos.nyumba[s]) {
      const multi = starts.filter((i) => me[i] > 1);
      if (multi.length > 0) starts = multi;
    }
    const free = starts.filter((i) => i !== blocked);
    for (const i of free.length > 0 ? free : starts) {
      expand(pos, { pit: i, dir: 1, kichwa: null, safari: null }, out, rules);
      expand(pos, { pit: i, dir: -1, kichwa: null, safari: null }, out, rules);
    }
    return noKichwaSuicide(pos, out, rules);
  }

  const all: Candidate[] = [];
  for (let i = 0; i < 16; i++) {
    if (me[i] < 2) continue;
    expand(pos, { pit: i, dir: 1, kichwa: null, safari: null }, all, rules);
    expand(pos, { pit: i, dir: -1, kichwa: null, safari: null }, all, rules);
  }
  const caps = all.filter((c) => c.result.kind === 'capture');
  if (caps.length > 0) return caps;
  // Takasia: skip the blocked pit unless nothing else is left (D8).
  const unblocked = all.filter((c) => c.move.pit !== blocked);
  const pool = unblocked.length > 0 ? unblocked : all;
  // A non-capturing turn must start from the inner row when it can.
  const inner = pool.filter((c) => c.move.pit < 8);
  return noKichwaSuicide(pos, inner.length > 0 ? inner : pool, rules);
}

/**
 * D12 (Donkers 2.4a, 3.5b): when a lone kichwa is the only filled front pit, a takasa from it
 * may not sow toward the back row, which would empty the front row.
 */
function noKichwaSuicide(pos: Position, cs: Candidate[], rules: RuleOptions): Candidate[] {
  if (rules.kichwaToBack !== 'illegal') return cs;
  const me = pos.pits[pos.toMove];
  let filled = -1;
  for (let i = 0; i < 8; i++) {
    if (me[i] === 0) continue;
    if (filled >= 0) return cs;
    filled = i;
  }
  if (filled !== 0 && filled !== 7) return cs;
  const towardBack = filled === 0 ? -1 : 1;
  const kept = cs.filter((c) => !(c.move.pit === filled && c.move.dir === towardBack && c.result.kind === 'takata'));
  return kept.length > 0 ? kept : cs;
}

/**
 * Game status for the side to move. A player whose inner row is empty has lost,
 * including a player who has just emptied their own (D7).
 */
export function status(pos: Position, moves?: Candidate[], rules: RuleOptions = DEFAULT_RULES): GameStatus {
  const s = pos.toMove;
  const o = other(s);
  if (innerCount(pos, o) === 0) return { over: true, winner: s, reason: 'inner-empty' };
  if (innerCount(pos, s) === 0) return { over: true, winner: o, reason: 'inner-empty' };
  const ms = moves ?? legalMoves(pos, rules);
  if (ms.length === 0) return { over: true, winner: o, reason: 'no-moves' };
  return { over: false };
}

/** Plays a move with a full event trace (for animation). Throws if the move is not fully specified. */
export function playTraced(pos: Position, move: Move, rules: RuleOptions = DEFAULT_RULES): MoveResult {
  const r = simulate(pos, move, true, rules);
  if (isDecision(r)) throw new Error(`Move needs a ${r.need} decision`);
  return r;
}

export function isNamua(pos: Position): boolean {
  return pos.stock[pos.toMove] > 0;
}
