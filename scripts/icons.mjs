// Renders the PWA icons from public/favicon.svg (run: node scripts/icons.mjs).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await page.setViewportSize({ width: size, height: size });
  // A wood ground with the ring mark inside the maskable safe zone (80%).
  await page.setContent(`<html><body style="margin:0;background:#4E2E1C;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${Math.round(size * 0.78)}px;height:${Math.round(size * 0.78)}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: `public/${name}` });
}
await browser.close();
console.log('icons written');
