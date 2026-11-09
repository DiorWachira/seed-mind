/** Prints the reader's counting accuracy on synthetic photos (npm run vision). */
import { CONFIDENT, readBoard } from '../src/vision/count';
import { defaultCorners, synthBoard } from '../src/vision/synth';

let exact = 0, total = 0, off1 = 0, flagged = 0, confWrong = 0;
for (let seed = 1; seed <= 12; seed++) {
  let s = seed;
  const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const max = seed % 3 === 0 ? 14 : 9;
  const truth = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => (r() < 0.3 ? 0 : Math.floor(r() * max) + 1)));
  const w = seed % 2 ? 800 : 1200, h = seed % 2 ? 600 : 900;
  const c = defaultCorners(w, h);
  const res = readBoard(synthBoard({ width: w, height: h, counts: truth, corners: c, seed, noise: 6 + seed }), c);
  for (const p of res.pits) {
    total++;
    const t = truth[p.row][p.col];
    if (p.count === t) exact++; else if (Math.abs(p.count - t) === 1) off1++;
    if (p.confidence < CONFIDENT) flagged++; else if (p.count !== t) confWrong++;
  }
}
console.log(`pits ${total} · exact ${(100 * exact / total).toFixed(1)}% · off by one ${(100 * off1 / total).toFixed(1)}% · flagged uncertain ${(100 * flagged / total).toFixed(1)}% · confident but wrong ${(100 * confWrong / total).toFixed(1)}%`);
