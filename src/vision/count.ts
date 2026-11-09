/**
 * Seed counting for the board reader (Phase 5 prototype, classical vision, all on device).
 *
 * 1. The user's four corner marks give a homography from the board plane to the photo.
 * 2. The board is rectified: each pit becomes a CELL x CELL patch (bilinear sampling).
 * 3. Inside each pit, "seed" pixels are bright and grey (komwe) against the dark hollow;
 *    the brightness threshold comes from Otsu's method over all pit pixels.
 * 4. Count = seed area / one seed's area. The single-seed area is self-calibrated from the
 *    median of isolated blobs on this board, so it adapts to seed and board size.
 * 5. Confidence falls when the area sits between two whole counts, when blobs merge into
 *    clumps (big piles), or when the pit is poorly lit. Uncertain pits get a dashed outline.
 */
import { BOARD_CORNERS, apply, boardToImage, homography, type Pt } from './geometry';

export interface Raster { width: number; height: number; data: Uint8ClampedArray }

export interface PitReading {
  /** Screen row 0..3 (D, C, A, B from the photographer's seat) and column 0..7. */
  row: number;
  col: number;
  count: number;
  /** 0..1 */
  confidence: number;
}

export interface Reading {
  pits: PitReading[];
  /** Pixels of one seed in the rectified image (for diagnostics). */
  unitArea: number;
  threshold: number;
}

export const CELL = 48;
/** Radius (fraction of a cell) of the pit area that is analysed; avoids the carved rim. */
const PIT_R = 0.4;
/** Expected seed radius as a fraction of a cell, before self-calibration. */
export const SEED_R = 0.085;
export const CONFIDENT = 0.6;

function sampler(img: Raster) {
  const { width: w, height: h, data: d } = img;
  return (x: number, y: number, out: number[]) => {
    const x0 = Math.max(0, Math.min(w - 2, Math.floor(x)));
    const y0 = Math.max(0, Math.min(h - 2, Math.floor(y)));
    const fx = Math.max(0, Math.min(1, x - x0));
    const fy = Math.max(0, Math.min(1, y - y0));
    for (let c = 0; c < 3; c++) {
      const i00 = (y0 * w + x0) * 4 + c;
      const i10 = i00 + 4;
      const i01 = i00 + w * 4;
      const i11 = i01 + 4;
      out[c] = (d[i00] * (1 - fx) + d[i10] * fx) * (1 - fy) + (d[i01] * (1 - fx) + d[i11] * fx) * fy;
    }
  };
}

function otsu(values: Float32Array | number[]): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

/** Connected-component areas (4-connectivity) of a binary mask. */
function blobs(mask: Uint8Array, w: number, h: number): number[] {
  const seen = new Uint8Array(mask.length);
  const areas: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let a = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      a++;
      const x = j % w, y = (j / w) | 0;
      const nb = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1];
      for (const k of nb) if (k >= 0 && mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
    }
    areas.push(a);
  }
  return areas;
}

/** Reads every pit. `corners` are the outer corners of the 4x8 pit grid: far-left, far-right, near-right, near-left. */
export function readBoard(img: Raster, corners: Pt[]): Reading {
  const h = boardToImage(corners);
  const sample = sampler(img);
  const px = [0, 0, 0];
  const W = CELL, R = PIT_R * CELL, R2 = R * R;
  const lum: Float32Array[] = [];
  const grey: Uint8Array[] = [];
  const all: number[] = [];
  // Rectify each pit's disc.
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      const L = new Float32Array(W * W).fill(-1);
      const G = new Uint8Array(W * W);
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x + 0.5 - W / 2, dy = y + 0.5 - W / 2;
          if (dx * dx + dy * dy > R2) continue;
          const u = c + (x + 0.5) / W, v = r + (y + 0.5) / W;
          const wv = h[6] * u + h[7] * v + h[8];
          sample((h[0] * u + h[1] * v + h[2]) / wv, (h[3] * u + h[4] * v + h[5]) / wv, px);
          const l = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
          const mx = Math.max(px[0], px[1], px[2]), mn = Math.min(px[0], px[1], px[2]);
          L[y * W + x] = l;
          G[y * W + x] = mx > 0 && (mx - mn) / mx < 0.38 ? 1 : 0;
          all.push(l);
        }
      }
      lum.push(L);
      grey.push(G);
    }
  }
  const t = Math.max(70, otsu(all));
  const masks = lum.map((L, k) => {
    const m = new Uint8Array(W * W);
    for (let i = 0; i < L.length; i++) m[i] = L[i] > t && grey[k][i] ? 1 : 0;
    return m;
  });
  // Self-calibrate one seed's area from blobs near the expected size.
  const expected = Math.PI * (SEED_R * CELL) ** 2;
  const singles: number[] = [];
  const blobAreas = masks.map((m) => blobs(m, W, W).filter((a) => a >= expected * 0.15));
  for (const bs of blobAreas) for (const a of bs) if (a > expected * 0.45 && a < expected * 1.6) singles.push(a);
  singles.sort((a, b) => a - b);
  const unit = singles.length >= 5 ? singles[singles.length >> 1] : expected;

  const pits: PitReading[] = [];
  masks.forEach((m, k) => {
    let area = 0;
    for (const v of m) area += v;
    const est = area / unit;
    const count = est < 0.35 ? 0 : Math.max(1, Math.round(est));
    const frac = Math.abs(est - Math.round(est));
    let conf = 1 - 2 * Math.min(0.5, frac);
    const bs = blobAreas[k];
    const clumped = bs.filter((a) => a > unit * 1.6).length;
    if (clumped > 0) conf *= 0.85;
    if (count > 8) conf *= 0.8;
    if (count > 0 && bs.length === count) conf = Math.min(1, conf + 0.2);
    pits.push({ row: (k / 8) | 0, col: k % 8, count, confidence: Math.max(0, Math.min(1, conf)) });
  });
  return { pits, unitArea: unit, threshold: t };
}

/**
 * Guesses the pit-grid corners: finds the board as the largest dark region (wood is darker
 * than a table or floor), takes its extreme points, and insets them by the rim. Returns
 * null when nothing board-like is found; the user then places the corners by hand.
 */
export function findBoard(img: Raster): Pt[] | null {
  const step = Math.max(1, Math.round(Math.max(img.width, img.height) / 240));
  const w = Math.floor(img.width / step), hgt = Math.floor(img.height / step);
  const L = new Float32Array(w * hgt);
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    const i = (y * step * img.width + x * step) * 4;
    L[y * w + x] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  }
  const t = otsu(L);
  const mask = new Uint8Array(w * hgt);
  for (let i = 0; i < L.length; i++) mask[i] = L[i] < t ? 1 : 0;
  // Largest dark component.
  const label = new Int32Array(w * hgt).fill(-1);
  let bestLabel = -1, bestArea = 0, n = 0;
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    let a = 0;
    stack.push(i); label[i] = n;
    while (stack.length) {
      const j = stack.pop()!;
      a++;
      const x = j % w, y = (j / w) | 0;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < hgt - 1 ? j + w : -1]) {
        if (k >= 0 && mask[k] && label[k] < 0) { label[k] = n; stack.push(k); }
      }
    }
    if (a > bestArea) { bestArea = a; bestLabel = n; }
    n++;
  }
  if (bestArea < w * hgt * 0.08) return null;
  // Extreme points along the diagonals give the four outer corners.
  let tl = { s: Infinity, x: 0, y: 0 }, br = { s: -Infinity, x: 0, y: 0 };
  let tr = { s: -Infinity, x: 0, y: 0 }, bl = { s: Infinity, x: 0, y: 0 };
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    if (label[y * w + x] !== bestLabel) continue;
    if (x + y < tl.s) tl = { s: x + y, x, y };
    if (x + y > br.s) br = { s: x + y, x, y };
    if (x - y > tr.s) tr = { s: x - y, x, y };
    if (x - y < bl.s) bl = { s: x - y, x, y };
  }
  const outer = [tl, tr, br, bl].map((p) => ({ x: (p.x + 0.5) * step, y: (p.y + 0.5) * step }));
  // The slab's rim: the pit grid starts about RIM board-units in from the outer edge.
  const RIM = 0.22;
  const H = homography([{ x: -RIM, y: -RIM }, { x: 8 + RIM, y: -RIM }, { x: 8 + RIM, y: 4 + RIM }, { x: -RIM, y: 4 + RIM }], outer);
  return BOARD_CORNERS.map((p) => apply(H, p));
}
