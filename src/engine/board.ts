import type { Dir, Move, Position, Side } from './types';

/** Nyumba: 5th inner pit from the owner's left (4th from the right). */
export const NYUMBA = 4;
/** Left kichwa starts a clockwise sowing, right kichwa an anticlockwise one. */
export const LEFT_KICHWA = 0;
export const RIGHT_KICHWA = 7;
export const TOTAL_KETE = 64;

export const isInner = (i: number): boolean => i >= 0 && i < 8;

/** The opponent's inner pit facing my inner pit i (their left is my right). */
export const facing = (i: number): number => 7 - i;

/** Kimbi = each kichwa and the pit beside it. Captures there force the nearest kichwa. */
export const isKimbi = (i: number): boolean => i === 0 || i === 1 || i === 6 || i === 7;

export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

export function innerCount(pos: Position, side: Side): number {
  let n = 0;
  for (let i = 0; i < 8; i++) n += pos.pits[side][i];
  return n;
}

export function keteOf(pos: Position, side: Side): number {
  return sum(pos.pits[side]) + pos.stock[side];
}

/** Standard Bao la Kiswahili start: 6 in the nyumba, 2 in each of the two pits to its right, 22 in hand. */
export function initialPosition(): Position {
  const half = (): number[] => {
    const p = new Array<number>(16).fill(0);
    p[NYUMBA] = 6;
    p[5] = 2;
    p[6] = 2;
    return p;
  };
  return { pits: [half(), half()], stock: [22, 22], nyumba: [true, true], toMove: 0, blocked: null };
}

export function clonePosition(pos: Position): Position {
  return {
    pits: [pos.pits[0].slice(), pos.pits[1].slice()],
    stock: [pos.stock[0], pos.stock[1]],
    nyumba: [pos.nyumba[0], pos.nyumba[1]],
    toMove: pos.toMove,
    blocked: pos.blocked ?? null,
  };
}

export function positionKey(pos: Position): string {
  return `${pos.toMove}|${pos.pits[0].join(',')}|${pos.pits[1].join(',')}|${pos.stock[0]},${pos.stock[1]}|${+pos.nyumba[0]}${+pos.nyumba[1]}|${pos.blocked ?? ''}`;
}

/**
 * Screen layout seen from `viewer`'s seat (viewer at the bottom).
 * Rows top to bottom: opponent outer (D), opponent inner (C), own inner (A), own outer (B).
 * Returns [side, pit] for row r (0..3), column c (0..7 from the viewer's left).
 */
export function cellAt(viewer: Side, r: number, c: number): [Side, number] {
  const opp = other(viewer);
  switch (r) {
    case 0: return [opp, 8 + c];
    case 1: return [opp, 7 - c];
    case 2: return [viewer, c];
    default: return [viewer, 15 - c];
  }
}

/** Human pit names seen from `viewer`'s seat: A/B own inner/outer, C/D opponent inner/outer, columns 1-8 from the viewer's left. */
export function pitName(viewer: Side, side: Side, i: number): string {
  if (side === viewer) return i < 8 ? `A${i + 1}` : `B${16 - i}`;
  return i < 8 ? `C${8 - i}` : `D${i - 7}`;
}

export const dirWord = (d: Dir): string => (d === 1 ? 'clockwise' : 'anticlockwise');
/** On the inner row, clockwise travels to the mover's right. */
export const dirArrow = (d: Dir): string => (d === 1 ? '→' : '←');

export function sameMove(a: Move, b: Move): boolean {
  return a.pit === b.pit && a.dir === b.dir && a.kichwa === b.kichwa && a.safari === b.safari;
}

/**
 * Compact notation seen from `viewer`'s seat, e.g. "A4×L", "A6→", "C3←", "B3←·safari".
 * Arrows show which way the sowing travels along the mover's inner row as the viewer sees it;
 * L/R name the kichwa on the viewer's left or right.
 */
export function moveNotation(m: Move, namuaCapture: boolean, mover: Side, viewer: Side): string {
  const flip = mover !== viewer;
  let s = pitName(viewer, mover, m.pit);
  if (namuaCapture) s += '×';
  else if (m.dir !== 0) s += dirArrow((flip ? -m.dir : m.dir) as Dir);
  if (m.kichwa !== null) s += (m.kichwa === 0) !== flip ? 'L' : 'R';
  if (m.safari === true) s += '·safari';
  return s;
}
