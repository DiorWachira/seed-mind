/**
 * Phase 1 golden tests: one hand-computed position per rule decision in RULES.md (D1-D8),
 * run under the Zanzibar defaults and, where the rulesets differ, under V1 too.
 * Pit indices are in the owner's frame: 0..7 inner left->right, 8..15 outer right->left.
 */
import { describe, expect, it } from 'vitest';
import { NYUMBA, TOTAL_KETE, facing, initialPosition, sum } from './board';
import { captureTargets, legalMoves, playTraced, simulate, status } from './rules';
import { V1, ZANZIBAR, type RuleOptions } from './ruleset';
import type { Move, MoveResult, Position } from './types';

const blank = (): Position => ({
  pits: [new Array(16).fill(0), new Array(16).fill(0)],
  stock: [0, 0],
  nyumba: [false, false],
  toMove: 0,
  blocked: null,
});
const mv = (pit: number, dir: 1 | -1 | 0 = 0, kichwa: 0 | 7 | null = null, safari: boolean | null = null): Move => ({ pit, dir, kichwa, safari });
const done = (r: ReturnType<typeof simulate>): MoveResult => {
  if ('need' in r) throw new Error(`unexpected decision: ${r.need}`);
  return r;
};

function perft(p: Position, d: number, rules: RuleOptions): number {
  if (d === 0) return 1;
  let n = 0;
  for (const c of legalMoves(p, rules)) n += perft(c.result.next, d - 1, rules);
  return n;
}

describe('D1 kimbi: captures in pits 1, 2, 7, 8 re-enter from the nearest kichwa', () => {
  it.each([[0, 0], [1, 0], [6, 7], [7, 7]] as const)('capture in inner pit %i uses kichwa %i', (pit, kichwa) => {
    const p = blank();
    p.stock = [3, 3];
    p.pits[0][pit] = 1;
    p.pits[1][facing(pit)] = 2;
    const r = playTraced(p, mv(pit));
    const cap = r.events.find((e) => e.t === 'capture');
    expect(cap && cap.t === 'capture' && cap.kichwa).toBe(kichwa);
  });
});

describe('D2 kichwa choice', () => {
  it('namua capture in a middle pit gives a free choice', () => {
    const p = blank();
    p.stock = [3, 3];
    p.pits[0][2] = 1;
    p.pits[1][facing(2)] = 3;
    expect(simulate(p, mv(2))).toEqual({ need: 'kichwa' });
  });

  it('mtaji first capture in a middle pit keeps the sowing direction', () => {
    const p = blank();
    p.pits[0][5] = 2; // sow anticlockwise: A5, A4 -> lands A4 (index 3)
    p.pits[0][3] = 1;
    p.pits[1][facing(3)] = 2;
    p.pits[1][9] = 2;
    // No kichwa decision is asked for: the direction is already set by the sowing.
    const r = done(simulate(p, mv(5, -1)));
    const t = playTraced(p, mv(5, -1));
    const e = t.events.find((x) => x.t === 'capture');
    expect(e && e.t === 'capture' && e.kichwa).toBe(7); // anticlockwise -> right kichwa
    expect(r.kind).toBe('capture');
  });
});

describe('D3 nyumba: works only while it holds 6+, in both stages (Zanzibar)', () => {
  const namuaHouse = (houseSeeds: number): Position => {
    const p = blank();
    p.stock = [5, 5];
    p.nyumba = [true, true];
    p.pits[0][NYUMBA] = houseSeeds;
    p.pits[0][2] = 1; // A3: place -> 2, sow clockwise: A4, A5 (house)
    p.pits[1][12] = 3; // keep north alive without creating markers
    return p;
  };

  it('a house with 5 that receives the last kete (now 6) stops a takasa', () => {
    const r = done(simulate(namuaHouse(5), mv(2, 1), false, ZANZIBAR));
    expect(r.endReason).toBe('nyumba');
    expect(r.next.pits[0][NYUMBA]).toBe(6);
    expect(r.next.nyumba[0]).toBe(true);
  });

  it('a house that would hold only 5 is an ordinary pit: relay sows it and it is lost', () => {
    const r = done(simulate(namuaHouse(4), mv(2, 1), false, ZANZIBAR));
    expect(r.endReason).toBe('empty');
    expect(r.next.pits[0][NYUMBA]).toBe(0);
    expect(r.next.nyumba[0]).toBe(false);
    // V1 had no threshold, so the same move stops in the house there.
    expect(done(simulate(namuaHouse(4), mv(2, 1), false, V1)).endReason).toBe('nyumba');
  });

  const mtajiHouse = (): Position => {
    const p = blank();
    p.nyumba = [true, true];
    p.pits[0][NYUMBA] = 6;
    p.pits[0][2] = 2; // A3 clockwise: A4, A5 (house, 7)
    p.pits[1][8] = 3;
    p.pits[1][1] = 1;
    return p;
  };

  it('in mtaji a quiet sowing that ends in a working house stops there', () => {
    const r = done(simulate(mtajiHouse(), mv(2, 1), false, ZANZIBAR));
    expect(r.endReason).toBe('nyumba');
    expect(r.next.pits[0][NYUMBA]).toBe(7);
  });

  it('V1: the same mtaji sowing relays through the house', () => {
    const r = done(simulate(mtajiHouse(), mv(2, 1), false, V1));
    expect(r.endReason).toBe('empty');
    expect(r.next.nyumba[0]).toBe(false);
  });

  it('in mtaji a capture turn ending in a working house offers safari', () => {
    const p = blank();
    p.nyumba = [true, false];
    p.pits[0][NYUMBA] = 6;
    p.pits[0][5] = 2; // anticlockwise: house (7), index 3 (1 -> 2)
    p.pits[0][3] = 1;
    p.pits[1][facing(3)] = 4; // captured 4, re-sown from the right kichwa: 7, 6, 5, 4 (house)
    p.pits[1][10] = 2;
    expect(simulate(p, mv(5, -1), false, ZANZIBAR)).toEqual({ need: 'safari' });
    const ms = legalMoves(p, ZANZIBAR).filter((c) => c.move.pit === 5 && c.move.dir === -1);
    expect(ms.map((c) => c.move.safari).sort()).toEqual([false, true]);
    expect(done(simulate(p, mv(5, -1), false, V1)).safariTaken).toBe(false);
  });

  it('D3b mtaji taxing: a turn started from a working house sows only two', () => {
    const p = blank();
    p.nyumba = [true, false];
    p.pits[0][NYUMBA] = 8;
    p.pits[1][8] = 3;
    p.pits[1][0] = 1;
    const z = done(simulate(p, mv(NYUMBA, 1), false, ZANZIBAR));
    expect(z.taxed).toBe(true);
    expect(z.next.pits[0][NYUMBA]).toBe(6);
    expect(z.next.nyumba[0]).toBe(true);
    const v = done(simulate(p, mv(NYUMBA, 1), false, V1));
    expect(v.taxed).toBe(false);
    expect(v.next.nyumba[0]).toBe(false);
  });
});

describe('D4 namua taxing only when the house is the only filled inner pit', () => {
  it('excludes the working house while other inner pits hold kete', () => {
    const ms = legalMoves(initialPosition(), ZANZIBAR);
    expect(ms.some((c) => c.move.pit === NYUMBA)).toBe(false);
  });

  it('a house too small to work may be sown like any pit', () => {
    const p = blank();
    p.stock = [4, 4];
    p.nyumba = [true, true];
    p.pits[0][NYUMBA] = 3;
    p.pits[0][6] = 2;
    p.pits[1][12] = 2;
    const ms = legalMoves(p, ZANZIBAR);
    expect(ms.some((c) => c.move.pit === NYUMBA)).toBe(true);
  });
});

describe('D5 never-ending moves are illegal', () => {
  // Found by a random search; the sowing reaches an exact repeated state.
  const p = blank();
  p.pits[0] = [1, 0, 3, 4, 3, 2, 3, 6, 2, 3, 4, 5, 0, 2, 1, 4];
  p.pits[1] = [0, 2, 1, 0, 2, 3, 1, 2, 0, 1, 3, 3, 1, 2, 0, 0];

  it('detects the loop', () => {
    expect(sum(p.pits[0]) + sum(p.pits[1])).toBe(TOTAL_KETE);
    const r = done(simulate(p, mv(13, -1), false, ZANZIBAR));
    expect(r.endReason).toBe('limit');
  });

  it('never offers it as a legal move', () => {
    expect(legalMoves(p, ZANZIBAR).some((c) => c.move.pit === 13 && c.move.dir === -1)).toBe(false);
  });
});

describe('D7 an empty inner row loses at once, even your own', () => {
  it('a player who sows their last inner kete into the back row has lost', () => {
    const p = blank();
    p.pits[0][7] = 2; // only inner pit; clockwise sows into the back row
    p.pits[0][12] = 1;
    p.pits[1][3] = 2;
    p.pits[1][9] = 2;
    const c = legalMoves(p, ZANZIBAR).find((x) => x.move.pit === 7 && x.move.dir === 1);
    expect(c).toBeDefined();
    expect(status(c!.result.next, undefined, ZANZIBAR)).toEqual({ over: true, winner: 1, reason: 'inner-empty' });
  });
});

describe('D8 takasia', () => {
  /** South's quiet move A4 -> leaves exactly one capture (A8 anticlockwise onto A6, taking N's index 2). */
  const setup = (): Position => {
    const p = blank();
    p.pits[0][3] = 2;
    p.pits[0][7] = 2;
    p.pits[0][10] = 2;
    p.pits[1][2] = 2;
    p.pits[1][5] = 4;
    return p;
  };

  it('blocks the lone threatened pit', () => {
    const p = setup();
    expect(legalMoves(p, ZANZIBAR).every((c) => c.result.kind === 'takata')).toBe(true);
    const r = done(simulate(p, mv(3, 1), false, ZANZIBAR));
    expect(r.kind).toBe('takata');
    expect([...captureTargets(r.next, 0, ZANZIBAR)]).toEqual([2]);
    expect(r.next.blocked).toBe(2);
  });

  it('the owner may not start a quiet turn from the blocked pit', () => {
    const next = done(simulate(setup(), mv(3, 1), false, ZANZIBAR)).next;
    const z = legalMoves(next, ZANZIBAR);
    expect(z.length).toBeGreaterThan(0);
    expect(z.every((c) => c.move.pit !== 2)).toBe(true);
    // Without takasia the same pit is playable.
    const v = done(simulate(setup(), mv(3, 1), false, V1)).next;
    expect(v.blocked).toBeNull();
    expect(legalMoves(v, V1).some((c) => c.move.pit === 2)).toBe(true);
  });

  it('is waived when the threatened pit is the owner’s only filled inner pit', () => {
    const p = setup();
    p.pits[1][5] = 0;
    p.pits[1][12] = 4;
    const r = done(simulate(p, mv(3, 1), false, ZANZIBAR));
    expect(r.next.blocked).toBeNull();
  });

  it('a quiet relay that lands on the blocked pit stops there', () => {
    const p = blank();
    p.toMove = 1;
    p.pits[1][6] = 2; // anticlockwise: index 5, index 4 -> lands on 4 (holding 1)
    p.pits[1][4] = 1;
    p.pits[0][9] = 3;
    p.pits[0][0] = 1;
    p.blocked = 4;
    const r = done(simulate(p, mv(6, -1), false, ZANZIBAR));
    expect(r.endReason).toBe('blocked');
    expect(r.next.pits[1][4]).toBe(2);
  });
});

describe('perft (move-generation regression counts from the opening)', () => {
  it.each([['zanzibar', ZANZIBAR], ['v1', V1]] as const)('%s', (_name, rules) => {
    expect([1, 2, 3, 4].map((d) => perft(initialPosition(), d, rules))).toEqual([4, 14, 38, 124]);
  });
});

describe('self-play invariants under both rulesets', () => {
  it.each([['zanzibar', ZANZIBAR], ['v1', V1]] as const)('%s keeps 64 kete and ends', (_name, rules) => {
    let seed = 1234;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let g = 0; g < 30; g++) {
      let p = initialPosition();
      let plies = 0;
      for (; plies < 800; plies++) {
        const ms = legalMoves(p, rules);
        if (status(p, ms, rules).over) break;
        p = ms[Math.floor(rnd() * ms.length)].result.next;
        expect(sum(p.pits[0]) + sum(p.pits[1]) + p.stock[0] + p.stock[1]).toBe(TOTAL_KETE);
        if (p.blocked != null) expect(p.pits[p.toMove][p.blocked]).toBeGreaterThan(0);
      }
      expect(plies).toBeLessThan(800);
    }
  });
});
