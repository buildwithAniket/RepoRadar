const { test, expect } = require('@playwright/test');

const EMPTY_EDITION = '2026-08-28';

async function load(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__RADAR && window.__RADAR.discs.length > 0);
  // The Docket holds placeholder text until the intro animation populates it.
  await expect(page.locator('#docket-title')).not.toHaveText('hermes-agent');
  return errors;
}

const title = (page) => page.locator('#docket-title');
const activeIndex = (page) => page.evaluate(() => window.__RADAR.activeIndex);

// Navigation animates; wait for the bridge index to settle on the expected value, then for the Docket to follow.
async function step(page, key, expected) {
  await page.keyboard.press(key);
  await expect.poll(() => activeIndex(page)).toBe(expected);
  await page.waitForTimeout(1200);
}

test('loads with no console errors and a Disc on the stage', async ({ page }) => {
  const errors = await load(page);
  expect(await page.evaluate(() => window.__RADAR.discs.length)).toBeGreaterThan(0);
  await expect(title(page)).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('arrow keys change the Docket Repo', async ({ page }) => {
  await load(page);
  const first = await title(page).textContent();
  const start = await activeIndex(page);
  await step(page, 'ArrowRight', start + 1);
  await expect(title(page)).not.toHaveText(first);
  await step(page, 'ArrowLeft', start);
  await expect(title(page)).toHaveText(first);
});

test('A and D keys change the Docket Repo', async ({ page }) => {
  await load(page);
  const first = await title(page).textContent();
  const start = await activeIndex(page);
  await step(page, 'd', start + 1);
  await expect(title(page)).not.toHaveText(first);
  await step(page, 'a', start);
  await expect(title(page)).toHaveText(first);
});

test('clicking a Filmstrip frame switches the Edition, including an empty one', async ({ page }) => {
  await load(page);
  const target = await page.evaluate((empty) => {
    const dates = [...document.querySelectorAll('.film-frame')].map((f) => f.dataset.date);
    return dates.find((d) => d !== window.__RADAR.activeDate && d !== empty);
  }, EMPTY_EDITION);
  await page.locator(`.film-frame[data-date="${target}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__RADAR.activeDate)).toBe(target);

  await page.locator(`.film-frame[data-date="${EMPTY_EDITION}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__RADAR.activeDate)).toBe(EMPTY_EDITION);
  await expect(page.locator('.scrubber-empty-label')).toBeVisible();
});

test('t opens the Tracklist and Esc closes it', async ({ page }) => {
  await load(page);
  await page.keyboard.press('t');
  await expect(page.locator('#tracklist-drawer')).toHaveAttribute('aria-hidden', 'false');
  expect(await page.evaluate(() => window.__RADAR.isTracklistOpen())).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#tracklist-drawer')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => window.__RADAR.isTracklistOpen())).toBe(false);
});

test('Tracklist search and verdict pills filter rows', async ({ page }) => {
  await load(page);
  await page.keyboard.press('t');
  const rows = page.locator('.tracklist-row');
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);

  await page.locator('#tracklist-search-input').fill('zzzz-no-such-repo');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#tracklist-reset-btn')).toBeVisible();
  await page.locator('#tracklist-reset-btn').click();
  await expect(rows).toHaveCount(total);

  const pill = page.locator('.tracklist-filter-pill[data-verdict="fit"]');
  const fitCount = Number(await page.locator('#pill-count-fit').textContent());
  await pill.click();
  await expect(pill).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(fitCount);
});

test('theme toggle flips the theme', async ({ page }) => {
  await load(page);
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const before = await theme();
  await page.locator('#theme-btn').click();
  const after = await theme();
  expect(after).not.toBe(before);
  expect(['dark', 'light']).toContain(after);
});
