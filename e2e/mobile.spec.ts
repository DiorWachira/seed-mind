import { expect, test } from '@playwright/test';
import { fresh } from './helpers';

test('phone: no sideways scroll on any screen', async ({ page }) => {
  await fresh(page);
  for (const r of ['#/', '#/play', '#/review', '#/reader', '#/nowhere']) {
    await page.goto(r);
    await page.waitForTimeout(600);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `overflow on ${r}`).toBeLessThanOrEqual(0);
  }
});

test('phone: the guide docks its tag to an edge and keeps the target visible', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e.seeded')) return;
    sessionStorage.setItem('e2e.seeded', '1');
    localStorage.clear();
  });
  await page.goto('#/');
  await page.getByTestId('tour-invite').getByRole('button', { name: 'Start the tour' }).click();
  const tag = page.locator('.tour-tag');
  await expect(tag).toHaveClass(/dock-(top|bottom)/);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/#\/play$/);
  const board = await page.locator('[data-tour="play-board"]').boundingBox();
  const card = await tag.boundingBox();
  expect(board && card).toBeTruthy();
  // the tag must not cover the middle of the board
  const mid = board!.y + board!.height / 2;
  expect(mid < card!.y || mid > card!.y + card!.height).toBe(true);
});

test('phone: tap a pit and play a move', async ({ page }) => {
  await fresh(page);
  await page.goto('#/play');
  await page.getByRole('button', { name: 'A6, 2 kete' }).tap();
  await page.getByRole('group', { name: 'Ways to play this pit' }).getByRole('button', { name: /Sow/ }).first().tap();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Move 2 · your turn', { timeout: 20_000 });
});
