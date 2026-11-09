/**
 * Level calibration: each level plays the next one up from the same openings (both colours).
 * Every level should score clearly below 50% against the level above it.
 * Time budgets are scaled (default 0.2x) so a run takes minutes, not hours.
 *
 *   npm run levels                 0.2x time, 10 openings (20 games a pair)
 *   npm run levels -- 0.5 20
 */
import { ZANZIBAR } from '../src/engine/ruleset';
import { LEVELS, chooseMove, search } from '../src/engine/search';
import { elo, match, openings, rng, type Player } from './match-lib';

const scale = Number(process.argv[2]) || 0.2;
const n = Number(process.argv[3]) || 10;
const starts = openings(n);

function levelPlayer(level: number, seed: number): Player {
  const L = LEVELS[level - 1];
  const r = rng(seed);
  return (pos) => {
    if (L.noise === 0) return search(pos, { maxDepth: L.maxDepth, timeMs: Math.max(20, L.timeMs * scale), rules: ZANZIBAR, exactRoot: false }).best!.move;
    // same as chooseMove, with the scaled budget
    const res = chooseMove(pos, level, ZANZIBAR, r);
    return res.best!.move;
  };
}

console.log(`Level ladder · ${scale}x time · ${n * 2} games a pair`);
for (let lv = 1; lv < 9; lv++) {
  const res = match(levelPlayer(lv, lv), levelPlayer(lv + 1, 100 + lv), starts, ZANZIBAR);
  const frac = res.score / res.games;
  console.log(`  level ${lv} vs ${lv + 1}: ${res.score}/${res.games} (${(frac * 100).toFixed(0)}%) · ${elo(frac)} Elo`);
}
