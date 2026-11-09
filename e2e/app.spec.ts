import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { toShareCode, toText } from '../src/engine/record';
import { fresh, randomGame } from './helpers';

test.describe('overview hero', () => {
  test('reads a pit on hover and opens Play on click', async ({ page }) => {
    await fresh(page);
    await page.goto('#/');
    const board = page.getByRole('group', { name: /Bao opening position/ });
    await board.getByRole('button', { name: 'A5 nyumba, 6 kete' }).hover();
    await expect(page.locator('[data-tour="hero-readout"]')).toContainText('nyumba, the square house');
    await expect(page.locator('[data-tour="hero-coach"]')).not.toContainText('Reading the board');
    await board.getByRole('button', { name: 'C1, 0 kete' }).click();
    await expect(page).toHaveURL(/#\/play$/);
  });
});

test.describe('play', () => {
  test('a move, Fundi’s reply, why-not, look back, take back and resign', async ({ page }) => {
    await fresh(page);
    await page.goto('#/play');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Move 1 · your turn');
    await page.getByRole('button', { name: 'A6, 2 kete' }).click();
    const opts = page.getByRole('group', { name: 'Ways to play this pit' });
    await expect(opts.getByRole('button').first()).toBeVisible();
    // Why not? needs the coach's scores
    await expect(page.locator('[data-tour="play-coach"]')).not.toContainText('Reading the board');
    await opts.getByRole('button', { name: /^Why not this move\?/ }).first().click();
    await expect(page.locator('.whynot')).toContainText(/coach|kete/);
    await opts.getByRole('button', { name: /Sow/ }).first().click();
    // Fundi replies, then it is our turn again
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Move 2 · your turn', { timeout: 20_000 });
    await expect(page.locator('.ledger .ply')).toHaveCount(2);
    // look back at the first ply
    await page.locator('.ledger .ply').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Looking back · after ply 1');
    await page.getByRole('button', { name: 'Back to the game' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Move 2 · your turn');
    // keyboard: ← steps back, End returns
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.history-bar')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.locator('.history-bar')).toHaveCount(0);
    // take back both plies
    await page.getByRole('button', { name: 'Take back' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Move 1 · your turn');
    // resign is two-step
    await page.getByRole('button', { name: 'Resign' }).click();
    await page.getByRole('button', { name: 'Confirm: resign' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fundi won');
    await expect(page.getByRole('status').filter({ hasText: 'You resigned' })).toBeVisible();
  });

  test('pass and play: both seats are human and the board turns', async ({ page }) => {
    await fresh(page);
    await page.goto('#/play');
    await page.getByRole('radio', { name: 'Pass and play' }).check();
    await page.getByRole('button', { name: 'Start a new game' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Move 1 · South to play');
    await page.getByRole('button', { name: 'A6, 2 kete' }).click();
    await page.getByRole('group', { name: 'Ways to play this pit' }).getByRole('button', { name: /Sow/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Move 1 · North to play');
    await expect(page.locator('[data-tour="play-hand"] .who')).toHaveText('North');
    await expect(page.locator('[data-tour="play-level"]')).toHaveCount(0);
  });
});

test.describe('review', () => {
  test('grows rings, opens a ring, and shares the game as a link', async ({ page }) => {
    const g = randomGame(12);
    await fresh(page, { 'seedmind.games': [g] });
    await page.goto(`#/review?id=${g.id}`);
    const rings = page.getByTestId('game-rings');
    await expect(rings).toBeVisible({ timeout: 30_000 });
    await rings.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /^Ply 3 ·/ })).toBeVisible();
    await expect(page.locator('p.line')).toContainText('Coach’s line from here');
    // the share link opens the same game for someone else
    const code = toShareCode(g);
    await page.goto(`#/review?g=${code}`);
    await expect(page.getByText('A shared game. It is not in your games yet.')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Save to my games' }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
  });

  test('imports a text record', async ({ page }) => {
    await fresh(page);
    await page.goto('#/review');
    await expect(page.getByRole('heading', { name: 'No rings yet. Play a game and it grows here.' })).toBeVisible();
    await page.getByPlaceholder('Paste a share link, a text record or JSON').fill(toText(randomGame(4, 9)));
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('game-rings')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('board reader', () => {
  test('counts the seeds in the sample photo and analyses the position', async ({ page }) => {
    await fresh(page);
    await page.goto('#/reader');
    await page.getByRole('button', { name: 'Try a sample photo' }).click();
    await expect(page.getByRole('button', { name: /Corner mark: far left/ })).toBeVisible();
    await page.getByRole('button', { name: 'Count the seeds' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Counted/ })).toBeVisible();
    await expect(page.getByTestId('total-note')).toHaveText('All 64 kete are accounted for. Ready to analyse.');
    // spot-check against the sample position
    await expect(page.getByRole('button', { name: /^A5 nyumba, 7 kete/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^C5, 6 kete/ })).toBeVisible();
    await page.getByRole('button', { name: 'Analyse this position' }).click();
    await expect(page.locator('.card.coach')).toContainText('your best move', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Play on from here' }).click();
    await expect(page).toHaveURL(/#\/play\?new=/);
    await expect(page.getByText('Mtaji · sowing from the board', { exact: false })).toBeVisible();
  });

  test('a corner mark moves with the arrow keys', async ({ page }) => {
    await fresh(page);
    await page.goto('#/reader');
    await page.getByRole('button', { name: 'Try a sample photo' }).click();
    const mark = page.getByRole('button', { name: /Corner mark: near right/ });
    const before = await mark.locator('circle').nth(1).getAttribute('cx');
    await mark.focus();
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(async () => mark.locator('circle').nth(1).getAttribute('cx')).not.toBe(before);
  });
});

test.describe('guide and help', () => {
  test('invite → tour across screens → Esc → never shown again', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('e2e.seeded')) return;
      sessionStorage.setItem('e2e.seeded', '1');
      localStorage.clear();
      localStorage.setItem('seedmind.sound', 'false');
    });
    await page.goto('#/');
    const invite = page.getByTestId('tour-invite');
    await expect(invite).toBeVisible();
    await invite.getByRole('button', { name: 'Start the tour' }).click();
    const tag = page.getByRole('dialog', { name: 'A Bao board' });
    await expect(tag).toBeVisible();
    await expect(page.locator('.tour-kicker')).toContainText('1 / 11');
    await expect(page.locator('#tour-h')).toBeFocused();
    // the target stays clickable through the veil: hover a pit and read it
    await page.getByRole('button', { name: 'A5 nyumba, 6 kete' }).hover();
    await expect(page.locator('[data-tour="hero-readout"]')).toContainText('nyumba');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog', { name: 'The coach light' })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/play$/);
    await expect(page.getByRole('dialog', { name: 'Your move' })).toBeVisible();
    for (let k = 0; k < 4; k++) await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('dialog', { name: 'The game record' })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/review$/);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/reader$/);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/#\/review$/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tour')).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('tour-invite')).toHaveCount(0);
  });

  test('“Not now” dismisses the invite for good', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('e2e.seeded')) return;
      sessionStorage.setItem('e2e.seeded', '1');
      localStorage.clear();
    });
    await page.goto('#/');
    await page.getByTestId('tour-invite').getByRole('button', { name: 'Not now' }).click();
    await page.reload();
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('tour-invite')).toHaveCount(0);
  });

  test('? opens the help drawer; tabs, glossary, rules; Esc closes and returns focus', async ({ page }) => {
    await fresh(page);
    await page.goto('#/play');
    await page.locator('body').press('?');
    const help = page.getByRole('dialog', { name: 'Help' });
    await expect(help).toBeVisible();
    await help.getByRole('tab', { name: 'Words' }).click();
    await expect(help.getByText('the square “house” pit', { exact: false })).toBeVisible();
    await help.getByRole('tab', { name: 'Words' }).press('ArrowRight');
    await expect(help.getByRole('tab', { name: 'Keys' })).toHaveAttribute('aria-selected', 'true');
    await help.getByRole('tab', { name: 'Rules' }).click();
    await expect(help).toContainText('Zanzibar (de Voogt)');
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);
    // "tour this screen" from the Help key
    await page.getByRole('button', { name: 'Help' }).click();
    await page.getByRole('button', { name: 'Tour this screen' }).click();
    await expect(page.getByRole('dialog', { name: 'Your move' })).toBeVisible();
    await expect(page.locator('.tour-kicker')).toContainText('1 / 6');
  });
});

test.describe('language, 404, accessibility', () => {
  test('switches to Kiswahili', async ({ page }) => {
    await fresh(page);
    await page.goto('#/play');
    await page.getByRole('combobox').filter({ hasText: 'English' }).selectOption('sw');
    await expect(page.getByRole('navigation').getByRole('link').nth(1)).toContainText('Cheza na Fundi');
    await expect(page.locator('html')).toHaveAttribute('lang', 'sw');
  });

  test('unknown routes show the empty-pit 404', async ({ page }) => {
    await fresh(page);
    await page.goto('#/nowhere');
    await expect(page.getByRole('heading', { name: 'Nothing was sown here.' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to the overview' }).click();
    await expect(page).toHaveURL(/#\/$/);
  });

  for (const route of ['#/', '#/play', '#/review', '#/reader', '#/nowhere']) {
    test(`no serious axe violations on ${route}`, async ({ page }) => {
      await fresh(page, route === '#/review' ? { 'seedmind.games': [randomGame(6)] } : {});
      await page.goto(route);
      await page.waitForTimeout(1500);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }

  test('works offline after the first visit (service worker)', async ({ page, context }) => {
    await fresh(page);
    await page.goto('#/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every kete counted');
    await context.setOffline(false);
  });
});
