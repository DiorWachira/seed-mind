import { describe, expect, it } from 'vitest';
import { NYUMBA, TOTAL_KETE, cellAt, facing, initialPosition, keteOf, pitName, sum } from './board';
import { legalMoves, playTraced, simulate, status } from './rules';
import type { Move, Position } from './types';

const empty = (): Position => ({
  pits: [new Array(16).fill(0), new Array(16).fill(0)],
  stock: [0, 0],
  nyumba: [false, false],
  toMove: 0,
});
const mv = (pit: number, dir: 1 | -1 | 0 = 0, kichwa: 0 | 7 | null = null, safari: boolean | null = null): Move => ({ pit, dir, kichwa, safari });
const total = (p: Position) => sum(p.pits[0]) + sum(p.pits[1]) + p.stock[0] + p.stock[1];

describe('board geometry', () => {
  it('starts with 64 kete, 10 on the board per side and 22 in hand', () => {
    const p = initialPosition();
    expect(total(p)).toBe(TOTAL_KETE);
    expect(sum(p.pits[0])).toBe(10);
    expect(p.pits[0][NYUMBA]).toBe(6);
    expect(p.pits[0][5]).toBe(2);
    expect(p.pits[0][6]).toBe(2);
  });

  it('places the two nyumba diagonally, not facing each other', () => {
    expect(facing(NYUMBA)).toBe(3);
    // South's A5 is column 5; North's nyumba appears in column 4 of row C.
    expect(cellAt(0, 2, 4)).toEqual([0, NYUMBA]);
    expect(cellAt(0, 1, 3)).toEqual([1, NYUMBA]);
  });

  it('names pits from the viewer seat', () => {
    expect(pitName(0, 0, 0)).toBe('A1');
    expect(pitName(0, 0, 8)).toBe('B8');
    expect(pitName(0, 0, 15)).toBe('B1');
    expect(pitName(0, 1, NYUMBA)).toBe('C4');
    expect(pitName(0, 1, 8)).toBe('D1');
  });
});

describe('namua', () => {
  it('has no captures at the start, so the first move is a takasa', () => {
    const ms = legalMoves(initialPosition());
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((c) => c.result.kind === 'takata')).toBe(true);
    // The working nyumba may not be taxed while A6 and A7 hold seeds.
    expect(ms.some((c) => c.move.pit === NYUMBA)).toBe(false);
  });

  it('forces a capture when one exists', () => {
    const p = empty();
    p.stock = [5, 5];
    p.pits[0][2] = 1; // A3, a capture spot
    p.pits[0][5] = 3; // A6, no capture
    p.pits[1][facing(2)] = 4;
    const ms = legalMoves(p);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((c) => c.move.pit === 2 && c.result.kind === 'capture')).toBe(true);
  });

  it('re-sows a kimbi capture from the nearest kichwa', () => {
    const p = empty();
    p.stock = [5, 5];
    p.pits[0][1] = 1; // A2 is a left kimbi
    p.pits[1][facing(1)] = 3;
    const r = playTraced(p, mv(1));
    expect(r.captured).toBe(3);
    // 3 seeds sown from the left kichwa: A1, A2, A3. A3 was empty, so the turn ends there.
    expect(r.next.pits[0].slice(0, 3)).toEqual([1, 3, 1]);
    expect(r.endPit).toBe(2);
    expect(r.endReason).toBe('empty');
  });

  it('offers a kichwa choice for a middle capture', () => {
    const p = empty();
    p.stock = [5, 5];
    p.pits[0][3] = 1;
    p.pits[1][facing(3)] = 2;
    expect(simulate(p, mv(3))).toEqual({ need: 'kichwa' });
    const ms = legalMoves(p);
    expect(ms.map((c) => c.move.kichwa).sort()).toEqual([0, 7]);
  });

  it('stops a takasa that ends in the working nyumba', () => {
    const p = empty();
    p.stock = [5, 5];
    p.nyumba = [true, false];
    p.pits[0][NYUMBA] = 6;
    p.pits[0][2] = 1; // A3 + placed seed = 2, sown clockwise: A4, A5 (nyumba)
    const r = playTraced(p, mv(2, 1));
    expect(r.kind).toBe('takata');
    expect(r.endReason).toBe('nyumba');
    expect(r.next.pits[0][NYUMBA]).toBe(7);
    expect(r.next.nyumba[0]).toBe(true);
  });

  it('taxes the nyumba by two when it is the only filled inner pit', () => {
    const p = empty();
    p.stock = [5, 5];
    p.nyumba = [true, false];
    p.pits[0][NYUMBA] = 6;
    const ms = legalMoves(p);
    expect(ms.length).toBe(2);
    const r = playTraced(p, mv(NYUMBA, 1));
    expect(r.taxed).toBe(true);
    expect(r.next.pits[0][NYUMBA]).toBe(5); // 6 + 1 placed - 2 sown
    expect(r.next.nyumba[0]).toBe(true);
  });

  it('offers safari when a capture turn ends in the working nyumba', () => {
    const p = empty();
    p.stock = [5, 5];
    p.nyumba = [true, false];
    p.pits[0][0] = 1; // capture at A1 (kimbi)
    p.pits[1][facing(0)] = 5; // 5 kete sown from A1: A1..A5
    p.pits[0][NYUMBA] = 6;
    expect(simulate(p, mv(0))).toEqual({ need: 'safari' });
    const stop = playTraced(p, mv(0, 0, null, false));
    expect(stop.endReason).toBe('nyumba');
    expect(stop.next.nyumba[0]).toBe(true);
    const go = playTraced(p, mv(0, 0, null, true));
    expect(go.safariTaken).toBe(true);
    expect(go.next.nyumba[0]).toBe(false);
  });
});

describe('mtaji', () => {
  it('only allows pits with two or more kete', () => {
    const p = empty();
    p.pits[0][0] = 1;
    p.pits[0][3] = 2;
    p.pits[1][0] = 2;
    const ms = legalMoves(p);
    expect(ms.every((c) => c.move.pit === 3)).toBe(true);
  });

  it('captures when the first lap ends in an occupied inner pit facing seeds', () => {
    const p = empty();
    p.pits[0][2] = 2; // A3 sown clockwise: A4, A5
    p.pits[0][4] = 1;
    p.pits[1][facing(4)] = 3;
    p.pits[1][9] = 2;
    const ms = legalMoves(p);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((c) => c.result.kind === 'capture')).toBe(true);
    const r = playTraced(p, mv(2, 1));
    expect(r.captured).toBe(3);
  });

  it('treats a first sowing of more than 15 kete as takata', () => {
    const p = empty();
    p.pits[0][0] = 16;
    p.pits[0][1] = 1;
    p.pits[1][facing(1)] = 5;
    const r = simulate(p, mv(0, 1));
    expect('need' in r).toBe(false);
    if (!('need' in r)) expect(r.kind).toBe('takata');
  });

  it('prefers inner-row starts for a takata turn', () => {
    const p = empty();
    p.pits[0][2] = 2;
    p.pits[0][10] = 3;
    p.pits[1][12] = 2;
    const ms = legalMoves(p);
    expect(ms.every((c) => c.move.pit < 8)).toBe(true);
  });
});

describe('game end', () => {
  it('loses with an empty inner row', () => {
    const p = empty();
    p.pits[0][10] = 4;
    p.pits[1][2] = 2;
    expect(status(p)).toEqual({ over: true, winner: 1, reason: 'inner-empty' });
  });

  it('keeps 64 kete and always ends in random self-play', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let g = 0; g < 40; g++) {
      let p = initialPosition();
      let plies = 0;
      for (; plies < 600; plies++) {
        const ms = legalMoves(p);
        if (status(p, ms).over) break;
        const c = ms[Math.floor(rnd() * ms.length)];
        p = c.result.next;
        expect(total(p)).toBe(TOTAL_KETE);
        expect(keteOf(p, 0) + keteOf(p, 1)).toBe(TOTAL_KETE);
        expect(p.pits[0].every((x) => x >= 0) && p.pits[1].every((x) => x >= 0)).toBe(true);
      }
      expect(plies).toBeLessThan(600);
    }
  });
});
