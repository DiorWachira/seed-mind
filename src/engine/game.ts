import { clonePosition, initialPosition } from './board';
import { playTraced, status } from './rules';
import { rulesFor, type RuleOptions, type RulesetId } from './ruleset';
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
  result: { winner: Side; reason: string } | null;
}

export function newGame(level: number, human: Side = 0, start: Position = initialPosition(), ruleset: RulesetId = 'zanzibar'): GameRecord {
  return {
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
