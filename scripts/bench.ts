/**
 * Engine benchmark: nodes per second and depth reached in a fixed time on a fixed set of
 * positions (the opening plus positions reached by seeded random play).
 *
 *   npm run bench            (1 s per position)
 *   npm run bench -- 3000    (3 s per position)
 */
import { initialPosition } from '../src/engine/board';
import { legalMoves, status } from '../src/engine/rules';
import { ZANZIBAR } from '../src/engine/ruleset';
import { search } from '../src/engine/search';
import type { Position } from '../src/engine/types';

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Positions after `plies` random legal moves, from a seeded generator. */
export function samplePositions(): Position[] {
  const out: Position[] = [initialPosition()];
  const plan: [number, number][] = [[1, 6], [2, 14], [3, 22], [4, 30], [5, 40], [6, 52], [7, 64]];
  for (const [seed, plies] of plan) {
    const r = rng(seed);
    let p = initialPosition();
    for (let k = 0; k < plies; k++) {
      const ms = legalMoves(p, ZANZIBAR);
      if (status(p, ms, ZANZIBAR).over) break;
      p = ms[Math.floor(r() * ms.length)].result.next;
    }
    if (!status(p, undefined, ZANZIBAR).over) out.push(p);
  }
  return out;
}

{
  const ms = Number(process.argv[2]) || 1000;
  const ps = samplePositions();
  let nodes = 0;
  let time = 0;
  let depth = 0;
  console.log(`Seed Mind bench · ${ps.length} positions · ${ms} ms each`);
  for (const [k, p] of ps.entries()) {
    const t = performance.now();
    const r = search(p, { maxDepth: 64, timeMs: ms, rules: ZANZIBAR });
    const dt = performance.now() - t;
    nodes += r.nodes;
    time += dt;
    depth += r.depth;
    console.log(`  #${k}  depth ${String(r.depth).padStart(2)}  nodes ${String(r.nodes).padStart(8)}  ${Math.round(r.nodes / (dt / 1000)).toString().padStart(7)} n/s  score ${r.score.toFixed(2)}`);
  }
  console.log(`TOTAL  avg depth ${(depth / ps.length).toFixed(2)}  ${Math.round(nodes / (time / 1000))} n/s`);
}
