import { clonePosition, initialPosition } from './board';
import { playTraced, status } from './rules';
import { NEW_GAME_RULESET, rulesFor, type RuleOptions, type RulesetId } from './ruleset';
import type { Move, Position, Side } from './types';

export interface GameRecord {
  id: string;
  startedAt: string;
  level: number;
  human: Side;
  /** Ruleset the game is played under. Absent on 0.1.0 saves, which used 'v1'. */
  ruleset?: RulesetId;
  start: Position;
  moves: Move[];
  /** Notation for each ply, from the human's seat. */
  notation: string[];
  result: { winner: Side; reason: ResultReason } | null;
  /** 'fundi' (default): `human` plays Fundi. 'local': pass-and-play, both seats human. */
  mode?: GameMode;
  /** Shared or imported games are kept for review but never resumed in Play. */
  imported?: boolean;
  /** Thinking time used per seat, in ms (only kept while the move clock is on). */
  clock?: [number, number];
}

export type GameMode = 'fundi' | 'local';
export type ResultReason = 'inner-empty' | 'no-moves' | 'resign';

export const gameMode = (g: GameRecord): GameMode => g.mode ?? 'fundi';
export const seatName = (s: Side): string => (s === 0 ? 'South' : 'North');

/** Who sat where, in words, from the record's point of view. */
export function playerName(g: GameRecord, s: Side): string {
  if (gameMode(g) === 'local') return seatName(s);
  return s === g.human ? 'You' : 'Fundi';
}

export function resultText(g: GameRecord): string {
  if (!g.result) return 'In progress';
  const w = g.result.winner;
  const loser = playerName(g, w === 0 ? 1 : 0);
  const why = g.result.reason === 'resign' ? `${loser} resigned` : g.result.reason === 'no-moves' ? `${loser} had no legal move` : `${loser} ran out of front-row kete`;
  const who = playerName(g, w);
  return `${who === 'You' ? 'You won' : `${who} won`} · ${why}`;
}

export function newGame(level: number, human: Side = 0, start: Position = initialPosition(), ruleset: RulesetId = NEW_GAME_RULESET, mode: GameMode = 'fundi'): GameRecord {
  return {
    mode,
    id: `g${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    startedAt: new Date().toISOString(),
    level,
    human,
    ruleset,
    start: clonePosition(start),
    moves: [],
    notation: [],
    result: null,
  };
}

export function gameRules(g: GameRecord): RuleOptions {
  return rulesFor(g.ruleset ?? 'v1');
}

/** Positions before each ply, plus the final one. positions[k] is the board before moves[k]. */
export function replay(g: GameRecord): Position[] {
  const rules = gameRules(g);
  const out: Position[] = [clonePosition(g.start)];
  let p = g.start;
  for (const m of g.moves) {
    p = playTraced(p, m, rules).next;
    out.push(p);
  }
  return out;
}

export function finalStatus(g: GameRecord) {
  const ps = replay(g);
  return status(ps[ps.length - 1], undefined, gameRules(g));
}
