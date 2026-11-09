import { describe, expect, it } from 'vitest';
import { facing, initialPosition } from './board';
import { advise, analysePly, describe as explain } from './coach';
import { gameRules, newGame, replay } from './game';
import { V1 } from './ruleset';
import { legalMoves } from './rules';
import { LEVELS, chooseMove, search } from './search';
import type { Position } from './types';

const empty = (): Position => ({
  pits: [new Array(16).fill(0), new Array(16).fill(0)],
  stock: [0, 0],
  nyumba: [false, false],
  toMove: 0,
});

describe('search', () => {
  it('returns a legal move from the start position', () => {
    const p = initialPosition();
    const r = search(p, { maxDepth: 3, timeMs: 2000 });
    expect(r.best).not.toBeNull();
    expect(r.depth).toBeGreaterThanOrEqual(1);
    expect(legalMoves(p).some((c) => c.move.pit === r.best!.move.pit)).toBe(true);
  });

  it('takes the bigger capture when it is clearly better', () => {
    const p = empty();
    p.pits[0][2] = 2; p.pits[0][4] = 1; p.pits[1][facing(4)] = 9; // A3 cw lands A5, takes 9
    p.pits[0][13] = 2; p.pits[0][11] = 1; // a decoy back-row sowing
    p.pits[1][9] = 3; p.pits[1][0] = 1; p.pits[1][7] = 2;
    const r = search(p, { maxDepth: 2, timeMs: 2000 });
    expect(r.best!.result.captured).toBe(9);
  });

  it('respects the time budget', () => {
    const t = Date.now();
    search(initialPosition(), { maxDepth: 30, timeMs: 300 });
    expect(Date.now() - t).toBeLessThan(1500);
  });

  it('has nine levels and level 1 can play off the best move', () => {
    expect(LEVELS).toHaveLength(9);
    const r = chooseMove(initialPosition(), 1, undefined, () => 0.99);
    expect(r.best).not.toBeNull();
  });
});

describe('coach', () => {
  it('advises and explains a move in plain words', () => {
    const a = advise(initialPosition(), { maxDepth: 2, timeMs: 1000 });
    expect(a).not.toBeNull();
    expect(a!.headline.length).toBeGreaterThan(10);
    expect(a!.path.length).toBeGreaterThan(0);
  });

  it('describes a namua capture with its target pit', () => {
    const p = empty();
    p.stock = [3, 3];
    p.pits[0][1] = 1;
    p.pits[1][facing(1)] = 4;
    const c = legalMoves(p)[0];
    expect(explain(p, c, 0).headline).toContain('capture 4 from C2');
  });

  it('scores the best move with zero loss', () => {
    const p = initialPosition();
    const r = search(p, { maxDepth: 2, timeMs: 1000 });
    const a = analysePly(p, r.best!.move, 0, { maxDepth: 2, timeMs: 1000 });
    expect(a.loss).toBe(0);
  });
});

describe('game record', () => {
  it('replays recorded moves', () => {
    const g = newGame(3);
    let p = g.start;
    for (let k = 0; k < 6; k++) {
      const c = legalMoves(p)[0];
      g.moves.push(c.move);
      p = c.result.next;
    }
    const ps = replay(g);
    expect(ps).toHaveLength(7);
    expect(ps[6]).toEqual(p);
  });

  it('replays a 0.1.0 save (no ruleset field) under the V1 rules it was played with', () => {
    const g = newGame(3, 0, undefined, 'v1');
    delete g.ruleset;
    expect(gameRules(g)).toBe(V1);
    let p = g.start;
    for (let k = 0; k < 30; k++) {
      const ms = legalMoves(p, V1);
      if (ms.length === 0) break;
      g.moves.push(ms[k % ms.length].move);
      p = ms[k % ms.length].result.next;
    }
    expect(replay(g)[g.moves.length]).toEqual(p);
    expect(newGame(3).ruleset).toBe('donkers');
  });
});
