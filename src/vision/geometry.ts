/**
 * Projective geometry for the board reader: a homography maps the flat board
 * (u across 0..8 columns, v down 0..4 rows, seen from the photographer's seat)
 * onto the photo, from four corner correspondences.
 */
export interface Pt { x: number; y: number }
/** Row-major 3x3 matrix with h[8] = 1. */
export type H = number[];

/** Solves A x = b (n x n) by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('Corners are degenerate');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Homography taking src[i] to dst[i] (4 points each). */
export function homography(src: Pt[], dst: Pt[]): H {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return [...solve(A, b), 1];
}

export function apply(h: H, p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function invert(h: H): H {
  const [a, b, c, d, e, f, g, k, i] = h;
  const A = e * i - f * k, B = -(d * i - f * g), C = d * k - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Singular homography');
  const m = [
    A, -(b * i - c * k), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * k - b * g), a * e - b * d,
  ].map((x) => x / det);
  return m.map((x) => x / m[8]);
}

/** Board-plane corners in the order the user marks them: far-left, far-right, near-right, near-left. */
export const BOARD_CORNERS: Pt[] = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 0, y: 4 }];

/** Board plane (columns, rows) → photo pixels. */
export const boardToImage = (corners: Pt[]): H => homography(BOARD_CORNERS, corners);
