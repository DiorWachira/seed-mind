/**
 * Screenshots of every screen and state, in light, dark and phone widths.
 * Needs a running preview server:  npm run build && npx vite preview --port 4173
 *   npm run shots -- <out dir>      (default docs/screenshots)
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { initialPosition, moveNotation } from '../src/engine/board';
import { newGame } from '../src/engine/game';
import { legalMoves, status } from '../src/engine/rules';
import { search } from '../src/engine/search';

const out = process.argv[2] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const base = 'http://localhost:4173/';

/** A believable game: a decent player (South) against a stronger one, so review has turning points. */
function demoGame() {
  const g = newGame(6, 0, initialPosition(), 'zanzibar');
  let p = g.start;
  let s = 7;
  const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let k = 0; k < 40; k++) {
    const ms = legalMoves(p);
    const st = status(p, ms);
    if (st.over) { g.result = { winner: st.winner, reason: st.reason }; break; }
    const c = p.toMove === 0 && r() < 0.35 ? ms[Math.floor(r() * ms.length)] : search(p, { maxDepth: 3, timeMs: 200 }).best!;
    g.moves.push(c.move);
    g.notation.push(moveNotation(c.move, p.stock[p.toMove] > 0 && c.result.kind === 'capture', p.toMove, 0));
    p = c.result.next;
  }
  return g;
}

const game = demoGame();
const errors: string[] = [];
const browser = await chromium.launch();

async function shot(name: string, hash: string, o: { w?: number; h?: number; dark?: boolean; guide?: string; full?: boolean; store?: Record<string, unknown>; act?: (p: Page) => Promise<void> } = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.w ?? 1360, height: o.h ?? 900 }, colorScheme: o.dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, { 'seedmind.guide': o.guide ?? 'done', 'seedmind.sound': false, 'seedmind.level': 3, ...(o.store ?? {}) });
  await page.goto(base + hash);
  await page.waitForTimeout(1500);
  if (o.act) await o.act(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) errors.push(`${name}: horizontal overflow ${over}px`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: o.full ?? false });
  await ctx.close();
}

const playMoves = async (p: Page) => {
  for (let k = 0; k < 3; k++) {
    await p.getByRole('heading', { level: 1 }).filter({ hasText: 'your turn' }).waitFor({ timeout: 20000 });
    const pit = p.locator('.pit-btn:not([disabled])').first();
    await pit.click();
    await p.getByRole('group', { name: 'Ways to play this pit' }).getByRole('button').first().click();
  }
  await p.getByRole('heading', { level: 1 }).filter({ hasText: 'your turn' }).waitFor({ timeout: 20000 });
  await p.locator('[data-tour="play-coach"]').getByRole('button', { name: /^Select/ }).click();
  await p.locator('[data-tour="play-coach"]').getByRole('button', { name: /^Select/ }).waitFor();
  const why = p.getByRole('button', { name: /^Why not this move\?/ });
  await why.last().click();
  await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(200);
};
const review = async (p: Page) => { await p.getByTestId('game-rings').waitFor({ timeout: 60000 }); await p.waitForTimeout(500); };
const reader = async (p: Page) => {
  await p.getByRole('button', { name: 'Try a sample photo' }).click();
  await p.getByRole('button', { name: 'Count the seeds' }).click();
  await p.waitForTimeout(300);
};
const store = { 'seedmind.games': [game] };

await shot('overview', '#/');
await shot('overview-dark', '#/', { dark: true });
await shot('play', '#/play', { act: playMoves });
await shot('play-dark', '#/play', { dark: true, act: playMoves });
await shot('review', `#/review?id=${game.id}`, { store, act: review, full: true });
await shot('review-dark', `#/review?id=${game.id}`, { store, act: review, dark: true });
await shot('reader', '#/reader', { act: reader });
await shot('guide', '#/', { guide: 'new', act: async (p) => { await p.getByRole('button', { name: 'Start the tour' }).click(); await p.waitForTimeout(700); } });
await shot('guide-play', '#/', { guide: 'new', act: async (p) => {
  await p.getByRole('button', { name: 'Start the tour' }).click();
  for (let k = 0; k < 4; k++) { await p.getByRole('button', { name: 'Next' }).click(); await p.waitForTimeout(250); }
  await p.waitForTimeout(800);
} });
await shot('invite', '#/', { guide: 'new', act: async (p) => { await p.getByTestId('tour-invite').waitFor(); } });
await shot('help', '#/play', { act: async (p) => { await p.keyboard.press('?'); await p.getByRole('tab', { name: 'Words' }).click(); await p.waitForTimeout(300); } });
await shot('notfound', '#/nowhere');
await shot('review-empty', '#/review');
await shot('kiswahili', '#/', { store: { 'seedmind.lang': 'sw' } });
await shot('phone-overview', '#/', { w: 390, h: 844, full: true });
await shot('phone-play', '#/play', { w: 390, h: 844 });
await shot('phone-review', `#/review?id=${game.id}`, { w: 390, h: 844, store, act: review });
await shot('phone-guide', '#/', { w: 390, h: 844, guide: 'new', act: async (p) => {
  await p.getByRole('button', { name: 'Start the tour' }).click();
  await p.getByRole('button', { name: 'Next' }).click();
  await p.getByRole('button', { name: 'Next' }).click();
  await p.waitForTimeout(900);
} });
await shot('phone-reader-dark', '#/reader', { w: 390, h: 844, dark: true, act: reader, full: true });
await browser.close();
console.log(errors.length ? errors.join('\n') : 'all screens clean: no console errors, no horizontal overflow');
