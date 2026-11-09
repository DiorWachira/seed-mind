import type { Page } from '@playwright/test';
import { initialPosition, moveNotation } from '../src/engine/board';
import { newGame, type GameRecord } from '../src/engine/game';
import { legalMoves, status } from '../src/engine/rules';

/** Every test except the guide's starts with the guide already seen, sound off and a quick Fundi. */
export async function fresh(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript((kv) => {
    if (sessionStorage.getItem('e2e.seeded')) return;
    sessionStorage.setItem('e2e.seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, { 'seedmind.guide': 'done', 'seedmind.sound': false, 'seedmind.level': 1, ...extra });
}

/** A game of `plies` plies (or fewer if it ends) played by a seeded random player. */
export function randomGame(plies = 14, seed = 3): GameRecord {
  let s = seed;
  const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const g = newGame(2, 0, initialPosition(), 'zanzibar');
  let p = g.start;
  for (let k = 0; k < plies; k++) {
    const ms = legalMoves(p);
    const st = status(p, ms);
    if (st.over) { g.result = { winner: st.winner, reason: st.reason }; break; }
    const c = ms[Math.floor(r() * ms.length)];
    g.moves.push(c.move);
    g.notation.push(moveNotation(c.move, p.stock[p.toMove] > 0 && c.result.kind === 'capture', p.toMove, 0));
    p = c.result.next;
  }
  return g;
}
