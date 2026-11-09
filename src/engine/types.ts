/**
 * Core types for the Bao la Kiswahili engine.
 *
 * Pit indexing is always in the OWNER's own frame (see board.ts):
 *   0..7  = inner (front) row, left to right as the owner sees it
 *   8..15 = outer (back) row, right to left as the owner sees it
 * so stepping +1 around 0..15 is clockwise from the owner's seat.
 */

/** 0 = South (seat at the bottom of the screen), 1 = North. */
export type Side = 0 | 1;

/** +1 = clockwise, -1 = anticlockwise, from the mover's own seat. */
export type Dir = 1 | -1;

export interface Position {
  /** pits[side][i], 16 pits per side in that side's own frame. */
  pits: [number[], number[]];
  /** Kete still in hand (nemo). Namua lasts while the mover has stock. */
  stock: [number, number];
  /** True while that side's nyumba (house) still has its special powers. */
  nyumba: [boolean, boolean];
  toMove: Side;
  /**
   * Takasia: a pit of the side to move (in its own frame) that it may not empty
   * this turn if the turn does not capture. Set by the previous move; null/absent = none.
   */
  blocked?: number | null;
}

/**
 * A full turn. Choices that only arise mid-turn are part of the move,
 * so every legal turn is a distinct, replayable Move.
 */
export interface Move {
  /** Namua: inner pit receiving the seed from hand. Mtaji: pit lifted. */
  pit: number;
  /** Sowing direction. 0 for a namua capture (placing does not sow). */
  dir: Dir | 0;
  /** Kichwa picked for a free choice (first capture from a middle pit). */
  kichwa: 0 | 7 | null;
  /** Safari decision when a capture turn ends in a working nyumba. */
  safari: boolean | null;
}

export type SowEvent =
  | { t: 'place'; side: Side; pit: number }
  | { t: 'lift'; side: Side; pit: number; n: number }
  | { t: 'sow'; side: Side; pit: number }
  | { t: 'capture'; side: Side; pit: number; n: number; kichwa: 0 | 7 }
  | { t: 'end'; side: Side; pit: number; reason: EndReason };

/**
 * empty: last seed fell in an empty pit; nyumba: stopped in the house;
 * blocked: stopped on a takasia-blocked pit; limit: a never-ending sowing (illegal).
 */
export type EndReason = 'empty' | 'nyumba' | 'blocked' | 'limit';

export interface MoveResult {
  next: Position;
  events: SowEvent[];
  /** 'capture' = mtaji turn (starts with a capture), 'takata' = no captures. */
  kind: 'capture' | 'takata';
  captures: number;
  captured: number;
  capturedNyumba: boolean;
  safariTaken: boolean;
  taxed: boolean;
  endPit: number;
  endReason: EndReason;
  sown: number;
}

export interface Decision {
  need: 'kichwa' | 'safari';
}

export interface Candidate {
  move: Move;
  result: MoveResult;
}

export type GameStatus =
  | { over: false }
  | { over: true; winner: Side; reason: 'inner-empty' | 'no-moves' };
