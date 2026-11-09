import { describe, expect, it } from 'vitest';
import { readBoard, findBoard, CONFIDENT } from './count';
import { apply, boardToImage, homography, invert } from './geometry';
import { defaultCorners, synthBoard } from './synth';

function counts(seed: number, max = 9): number[][] {
  let s = seed;
  const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => (r() < 0.3 ? 0 : Math.floor(r() * max) + 1)));
}

describe('geometry', () => {
  it('maps the four corners exactly and inverts', () => {
    const c = defaultCorners(640, 480);
    const h = boardToImage(c);
    const p = apply(h, { x: 8, y: 4 });
    expect(p.x).toBeCloseTo(c[2].x, 6);
    expect(p.y).toBeCloseTo(c[2].y, 6);
    const back = apply(invert(h), { x: 300, y: 200 });
    const again = apply(h, back);
    expect(again.x).toBeCloseTo(300, 6);
    expect(again.y).toBeCloseTo(200, 6);
    expect(() => homography([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], c)).toThrow();
  });
});

describe('seed counting on synthetic photos', () => {
  it('counts most pits exactly, and is confident where it is right', () => {
    let exact = 0, total = 0, confidentWrong = 0;
    for (const seed of [1, 2, 3]) {
      const truth = counts(seed);
      const corners = defaultCorners(800, 600);
      const img = synthBoard({ width: 800, height: 600, counts: truth, corners, seed });
      const r = readBoard(img, corners);
      for (const p of r.pits) {
        total++;
        if (p.count === truth[p.row][p.col]) exact++;
        else if (p.confidence >= CONFIDENT) confidentWrong++;
      }
    }
    expect(exact / total).toBeGreaterThanOrEqual(0.9);
    expect(confidentWrong / total).toBeLessThanOrEqual(0.05);
  });

  it('finds the board outline close to the true corners', () => {
    const corners = defaultCorners(800, 600);
    const img = synthBoard({ width: 800, height: 600, counts: counts(4), corners, seed: 4 });
    const found = findBoard(img);
    expect(found).not.toBeNull();
    found!.forEach((p, i) => {
      expect(Math.hypot(p.x - corners[i].x, p.y - corners[i].y)).toBeLessThan(800 * 0.04);
    });
  });
});
