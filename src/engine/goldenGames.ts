/**
 * Published Bao games, as move lists in Donkers' notation (thesis "Nosce Hostem", 2003,
 * appendix C, figure C.4). Holes are numbered 1-8 from each player's own left; A/B (a/b) are
 * front/back rows; L/R is the hand's direction (in a namua capture: which kichwa);
 * '*' marks takasa, '**' takasia, '>' playing the house (safari).
 */
import { initialPosition } from './board';
import { legalMoves } from './rules';
import type { RuleOptions } from './ruleset';
import type { Candidate, Move, Position } from './types';

export const RAMADHAN_KIJUMBE_1994 = {
  south: 'Ramadhan',
  north: 'Kijumbe',
  place: 'Zanzibar',
  date: '1994-10-17',
  result: 'North wins (South resigns after move 26)',
  moves: [
    ['7L*', '5R'], ['6R*', '6R*'], ['7R*', '8L*'], ['8R*', '6R*'], ['5R*', '8L*'],
    ['7R*', '6R*'], ['6R*', '8L*'], ['7R*', '6R*'], ['8R*', '7'], ['5L*', '5L'],
    ['3R', '1'], ['5R', '7R*'], ['8', '2'], ['8', '2'], ['3R*', '5R>'],
    ['5R', '3L'], ['8', '6R'], ['4R', '7'], ['5R', '8'], ['5R', '7'],
    ['7', '6L'], ['2', '8'], ['B2L', 'b7R'], ['A7L', 'b8R'], ['A3R', 'a6L'], ['A7L', 'a6L'],
  ] as [string, string][],
};

interface Parsed { pit: number; dir: 1 | -1 | null; takasa: boolean; house: boolean }

/** Parses one Donkers move token for the player to move (holes in that player's own frame). */
export function parseDonkers(tok: string): Parsed {
  const m = /^([AaBb])?([1-8])([LR])?(>)?(\*{0,2})$/.exec(tok.replace(/∗/g, '*').replace(/\s+/g, ''));
  if (!m) throw new Error(`Bad move "${tok}"`);
  const back = m[1] === 'B' || m[1] === 'b';
  const n = Number(m[2]);
  const pit = back ? 16 - n : n - 1;
  // Hand moving left: on the front row toward hole 1 (our -1); on the back row toward B1 (our +1).
  const left = m[3] === 'L';
  const dir = m[3] ? ((left !== back) ? -1 : 1) : null;
  return { pit, dir: dir as 1 | -1 | null, takasa: m[5].length > 0, house: !!m[4] };
}

/** The candidates matching a Donkers token in this position. */
export function matchDonkers(pos: Position, tok: string, rules: RuleOptions): Candidate[] {
  const p = parseDonkers(tok);
  const namua = pos.stock[pos.toMove] > 0;
  return legalMoves(pos, rules).filter((c) => {
    const m: Move = c.move;
    if (m.pit !== p.pit) return false;
    if ((c.result.kind === 'takata') !== p.takasa) return false;
    if (p.house !== (m.safari === true)) return false;
    if (namua && !p.takasa) {
      // namua capture: the letter names the kichwa (omitted when it is forced)
      if (p.dir !== null && m.kichwa !== null && m.kichwa !== (p.dir === -1 ? 0 : 7)) return false;
      return true;
    }
    return p.dir === null || m.dir === p.dir;
  });
}

/** Replays a game; returns the positions reached, or the first ply that could not be matched. */
export function replayDonkers(moves: [string, string][], rules: RuleOptions): { ok: true; positions: Position[] } | { ok: false; ply: number; token: string; matches: number } {
  let pos = initialPosition();
  const positions = [pos];
  const flat = moves.flat();
  for (const [k, tok] of flat.entries()) {
    const cs = matchDonkers(pos, tok, rules);
    const distinct = new Set(cs.map((c) => JSON.stringify(c.result.next)));
    if (distinct.size !== 1) return { ok: false, ply: k, token: tok, matches: distinct.size };
    pos = cs[0].result.next;
    positions.push(pos);
  }
  return { ok: true, positions };
}
