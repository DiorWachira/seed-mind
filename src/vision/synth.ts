/**
 * Synthetic board photos: a Bao board seen in perspective, with wood grain, sunken pits,
 * grey komwe seeds, uneven light and sensor noise. Used for the reader's "try a sample
 * photo" button and for the counting accuracy tests (where the true counts are known).
 */
import { BOARD_CORNERS, apply, homography, invert, type Pt } from './geometry';
import type { Raster } from './count';

export interface SynthOptions {
  width: number;
  height: number;
  /** Seed counts per screen cell [row][col], rows D, C, A, B from the photographer's seat. */
  counts: number[][];
  /** Outer corners of the pit grid in the photo (far-left, far-right, near-right, near-left). */
  corners?: Pt[];
  seed?: number;
  noise?: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_R = 0.085;
const PIT_R = 0.4;
const RIM = 0.22;

/** A pleasant default framing: the board fills most of the frame, seen from a low seat. */
export function defaultCorners(w: number, h: number): Pt[] {
  return [
    { x: w * 0.17, y: h * 0.2 }, { x: w * 0.83, y: h * 0.2 },
    { x: w * 0.93, y: h * 0.82 }, { x: w * 0.07, y: h * 0.82 },
  ];
}

/** Seed centres (board units, relative to the pit centre) for n seeds: a jittered sunflower. */
function layout(n: number, r: () => number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const maxR = PIT_R - SEED_R * 1.1;
  for (let j = 0; j < n; j++) {
    const rad = n === 1 ? 0 : maxR * Math.sqrt((j + 0.5) / Math.max(n, 7));
    const a = j * 2.39996 + r() * 0.25;
    out.push({ x: rad * Math.cos(a) + (r() - 0.5) * 0.02, y: rad * Math.sin(a) + (r() - 0.5) * 0.02 });
  }
  return out;
}

export function synthBoard(o: SynthOptions): Raster {
  const { width: W, height: H } = o;
  const r = rng(o.seed ?? 7);
  const corners = o.corners ?? defaultCorners(W, H);
  const toImg = homography(BOARD_CORNERS, corners);
  const toBoard = invert(toImg);
  const seeds: { x: number; y: number; tone: number }[][] = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
    seeds.push(layout(o.counts[row][col], r).map((p) => ({ x: p.x + col + 0.5, y: p.y + row + 0.5, tone: 0.85 + r() * 0.3 })));
  }
  const noise = o.noise ?? 10;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const b = apply(toBoard, { x: x + 0.5, y: y + 0.5 });
      // light falls off from the top-left window
      const light = 1.08 - 0.25 * (x / W) * 0.6 - 0.25 * (y / H) * 0.4;
      let R: number, G: number, B: number;
      if (b.x < -RIM || b.x > 8 + RIM || b.y < -RIM || b.y > 4 + RIM) {
        // table: pale woven mat
        const weave = ((Math.floor(x / 6) + Math.floor(y / 6)) % 2) * 8;
        R = 206 + weave; G = 194 + weave; B = 170 + weave;
      } else {
        const col = Math.floor(b.x), row = Math.floor(b.y);
        const inGrid = col >= 0 && col < 8 && row >= 0 && row < 4;
        const dx = b.x - (col + 0.5), dy = b.y - (row + 0.5);
        const d = Math.hypot(dx, dy);
        const grain = Math.sin(b.y * 40 + Math.sin(b.x * 3) * 2) * 6;
        R = 92 + grain; G = 58 + grain * 0.7; B = 36 + grain * 0.4;
        if (inGrid && d < PIT_R) {
          // the hollow: darker toward the centre, a lit lower lip
          const depth = 1 - d / PIT_R;
          R = 52 - depth * 14; G = 32 - depth * 9; B = 20 - depth * 6;
          if (dy > 0 && d > PIT_R * 0.85) { R += 22; G += 14; B += 8; }
          for (const s of seeds[row * 8 + col]) {
            const sd = Math.hypot(b.x - s.x, (b.y - s.y) * 1.08);
            if (sd < SEED_R) {
              const k = 1 - sd / SEED_R;
              const hi = (s.x - b.x) + (s.y - b.y) > 0 ? 18 * k : 0;
              const g = (128 + 40 * Math.sqrt(k) + hi) * s.tone;
              R = g; G = g * 1.01; B = g * 0.96;
            }
          }
        }
      }
      const n = (r() - 0.5) * 2 * noise;
      const i = (y * W + x) * 4;
      data[i] = R * light + n;
      data[i + 1] = G * light + n;
      data[i + 2] = B * light + n;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}
