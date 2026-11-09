/**
 * New engine vs the 0.2.0 engine.
 *   npm run match                  60 ms a move, 20 openings (40 games)
 *   npm run match -- 150 40        150 ms a move, 40 openings (80 games)
 */
import { ZANZIBAR } from '../src/engine/ruleset';
import { elo, engineNew, engineV0, match, openings } from './match-lib';
const ms = Number(process.argv[2]) || 60;
const n = Number(process.argv[3]) || 20;
const starts = openings(n);
console.log(`New engine vs 0.2.0 engine · ${ms} ms a move · ${n * 2} games`);
const r = match(engineNew({ timeMs: ms }), engineV0(ms), starts, ZANZIBAR, true);
const frac = r.score / r.games;
console.log(`New scores ${r.score}/${r.games} (${(frac * 100).toFixed(0)}%, draws ${r.draws}) · about ${elo(frac) >= 0 ? '+' : ''}${elo(frac)} Elo`);
