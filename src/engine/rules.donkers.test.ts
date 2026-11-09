/**
 * Golden tests from a published master game and Donkers' computer rules (thesis 2003, app. C).
 * RULES.md decisions D9, D12, D13 and D8b.
 */
import { describe, expect, it } from 'vitest';
import { initialPosition } from './board';
import { RAMADHAN_KIJUMBE_1994, matchDonkers, parseDonkers, replayDonkers } from './goldenGames';
import { legalMoves, simulate, status } from './rules';
import { DONKERS, V1, ZANZIBAR, rulesFor } from './ruleset';
import type { MoveResult, Position } from './types';

const blank = (): Position => ({ pits: [new Array(16).fill(0), new Array(16).fill(0)], stock: [0, 0], nyumba: [false, false], toMove: 0, blocked: null });

describe('published game: Ramadhan v Kijumbe, Zanzibar 1994', () => {
  it('parses Donkers notation into our frame', () => {
    expect(parseDonkers('7L*')).toEqual({ pit: 6, dir: -1, takasa: true, house: false });
    expect(parseDonkers('B2L')).toEqual({ pit: 14, dir: 1, takasa: false, house: false });
    expect(parseDonkers('b8R')).toEqual({ pit: 8, dir: -1, takasa: false, house: false });
    expect(parseDonkers('5R>')).toEqual({ pit: 4, dir: 1, takasa: false, house: true });
  });

  for (const [id, rules] of [['donkers', DONKERS], ['zanzibar', ZANZIBAR], ['v1', V1]] as const) {
    it(`replays all 52 plies, each matching exactly one legal turn, under ${id}`, () => {
      const r = replayDonkers(RAMADHAN_KIJUMBE_1994.moves, rules);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.positions).toHaveLength(53);
      // 64 kete throughout; namua ends after 22 moves each; the game is still on when South resigns
      for (const p of r.positions) expect(p.pits[0].concat(p.pits[1]).reduce((a, b) => a + b, 0) + p.stock[0] + p.stock[1]).toBe(64);
      expect(r.positions[44].stock).toEqual([0, 0]);
      expect(status(r.positions[52], undefined, rules).over).toBe(false);
    });
  }

  it('North’s 12th move ends in the nyumba, as the record says', () => {
    const r = replayDonkers(RAMADHAN_KIJUMBE_1994.moves, DONKERS);
    if (!r.ok) throw new Error('replay failed');
    const before = r.positions[23];
    const [c] = matchDonkers(before, '7R*', DONKERS);
    expect((simulate(before, c.move, false, DONKERS) as MoveResult).endReason).toBe('nyumba');
  });

  it('North plays the house (safari) on move 15', () => {
    const r = replayDonkers(RAMADHAN_KIJUMBE_1994.moves, DONKERS);
    if (!r.ok) throw new Error('replay failed');
    const [c] = matchDonkers(r.positions[29], '5R>', DONKERS);
    expect(c.result.safariTaken).toBe(true);
  });
});

describe('Donkers computer rules', () => {
  it('D9: no single-kete namua start while the house is lost and a front pit has 2+', () => {
    const p = blank();
    p.stock = [5, 5];
    p.pits[0][1] = 1;
    p.pits[0][3] = 2;
    p.pits[1][0] = 3; // keeps North's front row non-empty, faces nothing of South's
    const starts = (rules: typeof DONKERS) => new Set(legalMoves(p, rules).map((c) => c.move.pit));
    expect(starts(DONKERS)).toEqual(new Set([3]));
    expect(starts(ZANZIBAR)).toEqual(new Set([1, 3]));
    // ...but allowed while the house is still owned (even with fewer than 6)
    p.nyumba = [true, false];
    expect(starts(DONKERS)).toEqual(new Set([1, 3]));
  });

  it('D12: a lone kichwa may not sow toward the back row', () => {
    const p = blank();
    p.pits[0][0] = 3; // A1 is South's only filled front pit
    p.pits[0][12] = 1;
    p.pits[1][2] = 1;
    p.pits[1][9] = 2;
    const dirs = (rules: typeof DONKERS) => legalMoves(p, rules).filter((c) => c.move.pit === 0).map((c) => c.move.dir).sort();
    expect(dirs(DONKERS)).toEqual([1]);
    expect(dirs(ZANZIBAR)).toEqual([-1, 1]);
  });

  it('D3: no nyumba powers and no taxing in mtaji', () => {
    const p = blank();
    p.nyumba = [true, true];
    p.pits[0][4] = 8;
    p.pits[0][1] = 1;
    p.pits[1][5] = 1;
    p.pits[1][9] = 2;
    const fromHouse = (rules: typeof DONKERS) => legalMoves(p, rules).find((c) => c.move.pit === 4 && c.move.dir === 1)!;
    expect(fromHouse(ZANZIBAR).result.taxed).toBe(true);
    expect(fromHouse(DONKERS).result.taxed).toBe(false);
    expect(fromHouse(DONKERS).result.next.pits[0][4]).toBe(0);
  });

  it('is offered as a ruleset and does not change the meaning of the others', () => {
    expect(rulesFor('donkers')).toBe(DONKERS);
    expect(ZANZIBAR.namuaSingleKete).toBeUndefined();
    expect(V1.kichwaToBack).toBeUndefined();
    expect(legalMoves(initialPosition(), DONKERS)).toHaveLength(4);
  });
});
