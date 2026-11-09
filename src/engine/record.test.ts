import { describe, expect, it } from 'vitest';
import { initialPosition } from './board';
import { advise, whyNot } from './coach';
import { newGame, replay, resultText, type GameRecord } from './game';
import { moveCode, moveFromCode, zobrist } from './hash';
import { fromShareCode, parseGame, positionFromText, positionToText, toJSON, toShareCode, toText } from './record';
import { legalMoves, status } from './rules';
import { V1 } from './ruleset';
import { search } from './search';
import type { Position } from './types';

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

/** A finished (or 160-ply) random game, so imports cover namua, mtaji, kichwa and safari moves. */
function randomGame(seed: number, ruleset: 'zanzibar' | 'v1' = 'zanzibar'): GameRecord {
  const g = newGame(4, 0, initialPosition(), ruleset);
  const r = rng(seed);
  let p = g.start;
  for (let k = 0; k < 160; k++) {
    const ms = legalMoves(p, ruleset === 'v1' ? V1 : undefined);
    if (status(p, ms, ruleset === 'v1' ? V1 : undefined).over) break;
    const c = ms[Math.floor(r() * ms.length)];
    g.moves.push(c.move);
    p = c.result.next;
  }
  return g;
}

describe('hash', () => {
  it('moveCode round-trips every legal move shape', () => {
    for (let s = 1; s <= 5; s++) {
      for (const m of randomGame(s).moves) expect(moveFromCode(moveCode(m))).toEqual(m);
    }
  });

  it('zobrist tells positions apart and is stable', () => {
    const a = initialPosition();
    const b = initialPosition();
    expect(zobrist(a)).toBe(zobrist(b));
    b.toMove = 1;
    expect(zobrist(a)).not.toBe(zobrist(b));
    const c = initialPosition();
    c.blocked = 3;
    expect(zobrist(a)).not.toBe(zobrist(c));
    const seen = new Set<number>();
    const g = randomGame(9);
    for (const p of replay(g)) seen.add(zobrist(p));
    expect(seen.size).toBe(g.moves.length + 1);
  });
});

describe('game records', () => {
  it('round-trips through JSON, text notation and share codes', () => {
    for (let s = 1; s <= 6; s++) {
      const g = randomGame(s, s % 2 ? 'zanzibar' : 'v1');
      const ends = replay(g).at(-1)!;
      for (const text of [toJSON(g), toText(g), toShareCode(g)]) {
        const back = parseGame(text);
        expect(back.moves).toEqual(g.moves);
        expect(back.ruleset).toBe(g.ruleset);
        expect(back.imported).toBe(true);
        expect(replay(back).at(-1)).toEqual(ends);
      }
    }
  });

  it('keeps a non-standard start (board reader positions)', () => {
    const start: Position = initialPosition();
    start.pits[0][2] = 3;
    start.stock[0] = 19;
    const g = newGame(5, 0, start, 'zanzibar');
    expect(positionFromText(positionToText(start))).toEqual(start);
    const ms = legalMoves(start);
    g.moves.push(ms[0].move);
    expect(parseGame(toText(g)).start).toEqual(start);
    expect(fromShareCode(toShareCode(g)).start).toEqual(start);
  });

  it('reads a full share link and rejects junk with a plain message', () => {
    const g = randomGame(3);
    expect(parseGame(`https://example.org/seed-mind/#/review?g=${toShareCode(g)}`).moves).toHaveLength(g.moves.length);
    expect(() => parseGame('not a game')).toThrow(/damaged|incomplete/);
    expect(() => parseGame('[Ruleset "zanzibar"]\n\n1. B8→')).toThrow(/not legal/);
  });

  it('writes readable text with tags and numbered moves', () => {
    const t = toText(randomGame(2));
    expect(t).toContain('[Ruleset "zanzibar"]');
    expect(t).toContain('[Start "standard"]');
    expect(t).toMatch(/\n1\. A\d/);
  });

  it('describes results in words, including resignation', () => {
    const g = newGame(5);
    g.result = { winner: 1, reason: 'resign' };
    expect(resultText(g)).toBe('Fundi won · You resigned');
    const l = newGame(5, 0, undefined, 'zanzibar', 'local');
    l.result = { winner: 0, reason: 'inner-empty' };
    expect(resultText(l)).toBe('South won · North ran out of front-row kete');
  });
});

describe('search extras', () => {
  it('returns a principal variation that starts with the best move and is playable', () => {
    const p = initialPosition();
    const r = search(p, { maxDepth: 5, timeMs: 2000 });
    expect(r.pv.length).toBeGreaterThanOrEqual(2);
    expect(r.pv[0]).toEqual(r.best!.move);
    let q = p;
    for (const m of r.pv) {
      const c = legalMoves(q).find((x) => moveCode(x.move) === moveCode(m));
      expect(c).toBeDefined();
      q = c!.result.next;
    }
  });

  it('answers "why not this move?" with the kete given up', () => {
    const p = initialPosition();
    const a = advise(p, { maxDepth: 3, timeMs: 2000 })!;
    expect(a.scores.length).toBe(legalMoves(p).length);
    const cands = legalMoves(p);
    const best = cands.find((c) => moveCode(c.move) === moveCode(a.move))!;
    expect(whyNot(p, a, best, 0)!.verdict).toBe('best');
    const worst = cands.find((c) => moveCode(c.move) === moveCode(a.scores.at(-1)!.move))!;
    const w = whyNot(p, a, worst, 0)!;
    expect(w.loss).toBeCloseTo(a.scores[0].score - a.scores.at(-1)!.score, 6);
    expect(w.coach.headline).toBe(a.headline);
  });
});
