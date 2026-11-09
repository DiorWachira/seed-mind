/** Smoke test of a sub-path build (as on GitHub Pages): npx vite-node scripts/check-base.ts <url> */
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://localhost:4174/seed-mind/';
const b = await chromium.launch();
const p = await b.newPage();
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.addInitScript(() => localStorage.setItem('seedmind.guide', '"done"'));
await p.goto(url + '#/play');
await p.getByText(/Searched \d+ plies/).waitFor({ timeout: 20000 });
const sw = await p.evaluate(async () => (await navigator.serviceWorker.ready).scope);
const font = await p.evaluate(() => document.fonts.check('16px "Outfit Variable"'));
console.log('coach answered from the worker; service worker scope', sw, '; Outfit loaded:', font, errs.length ? `errors: ${errs.join(' | ')}` : '; no console errors');
await b.close();
