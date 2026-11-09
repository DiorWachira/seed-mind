/**
 * Evaluation tuning by self-play: each candidate plays the reference engine (current EVAL
 * weights, same search) from the same openings. A candidate that scores clearly above 50%
 * is a better set of weights.
 *
 *   npm run tune -- <candidate> [ms] [openings]
 *   candidates: see CANDIDATES below
 */
import { ZANZIBAR } from '../src/engine/ruleset';
import { EVAL, EVAL_V0, type EvalWeights } from '../src/engine/search';
import { elo, engineNew, match, openings } from './match-lib';

const CANDIDATES: Record<string, { weights?: EvalWeights; quiescence?: number }> = {
  v0weights: { weights: EVAL_V0 },
  q1: { quiescence: 1 },
  q2: { quiescence: 2 },
  q3: { quiescence: 3 },
  vuln0: { weights: { ...EVAL, vulnerable: 0 } },
  vuln25: { weights: { ...EVAL, vulnerable: 0.25 } },
  vuln5: { weights: { ...EVAL, vulnerable: 0.5 } },
  vuln1: { weights: { ...EVAL, vulnerable: 1 } },
  inner0: { weights: { ...EVAL, inner: 0 } },
  inner3: { weights: { ...EVAL, inner: 0.3 } },
  house0: { weights: { ...EVAL, houseBase: 0, housePerSeed: 0 } },
  house3: { weights: { ...EVAL, houseBase: 3, housePerSeed: 0.1 } },
  house6: { weights: { ...EVAL, houseBase: 6, housePerSeed: 0.15 } },
  // round 3 combinations
  c_v1: { weights: { ...EVAL, vulnerable: 1 } },
  c_v1h0: { weights: { ...EVAL, vulnerable: 1, houseBase: 0, housePerSeed: 0 } },
  c_v15: { weights: { ...EVAL, vulnerable: 1.5 } },
  c_v1h0i0: { weights: { inner: 0, vulnerable: 1, houseBase: 0, housePerSeed: 0 } },
  c_v1hHalf: { weights: { ...EVAL, vulnerable: 1, houseBase: 0.75, housePerSeed: 0.025 } },
  c_v1q2: { weights: { ...EVAL, vulnerable: 1 }, quiescence: 2 },
  // round 4: against EVAL = vulnerable 1, half house bonus
  r4_fullHouse: { weights: { ...EVAL, houseBase: 1.5, housePerSeed: 0.05 } },
  r4_noHouseNoInner: { weights: { inner: 0, vulnerable: 1, houseBase: 0, housePerSeed: 0 } },
  r4_v125: { weights: { ...EVAL, vulnerable: 1.25 } },
  r4_v075: { weights: { ...EVAL, vulnerable: 0.75 } },
  r4_inner0: { weights: { ...EVAL, inner: 0 } },
  r4_v0: { weights: EVAL_V0 },
};

const name = process.argv[2] ?? 'vuln0';
const ms = Number(process.argv[3]) || 40;
const n = Number(process.argv[4]) || 20;
const cand = CANDIDATES[name];
if (!cand) throw new Error(`unknown candidate ${name}; pick one of ${Object.keys(CANDIDATES).join(', ')}`);
const r = match(engineNew({ timeMs: ms, ...cand }), engineNew({ timeMs: ms }), openings(n), ZANZIBAR);
const frac = r.score / r.games;
console.log(`${name.padEnd(14)} vs reference · ${r.score}/${r.games} (${(frac * 100).toFixed(0)}%) · ${elo(frac) >= 0 ? '+' : ''}${elo(frac)} Elo`);
