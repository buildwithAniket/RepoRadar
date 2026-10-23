const { test, expect } = require('@playwright/test');

async function load(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__RADAR && window.__RADAR.discs.length > 0);
}

const announcer = (page) => page.locator('#a11y-announcer');
const seconds = (page, selector, prop) =>
  page.evaluate(([s, p]) => parseFloat(getComputedStyle(document.querySelector(s))[p]), [selector, prop]);

test('live announcer reports the focused Repo after navigation', async ({ page }) => {
  await load(page);
  const start = await page.evaluate(() => window.__RADAR.activeIndex);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__RADAR.activeIndex)).toBe(start + 1);
  await expect(announcer(page)).toHaveText(new RegExp(`^Showing repository ${start + 2} of \\d+: .+ by .+\\. Verdict: .+`));
});

test('live announcer reports a theme change', async ({ page }) => {
  await load(page);
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const next = before === 'dark' ? 'light' : 'dark';
  await page.locator('#theme-btn').click();
  await expect(announcer(page)).toHaveText(`Color scheme changed to ${next} mode`);
});

test('reduced motion removes the Tracklist drawer transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await load(page);
  expect(await seconds(page, '#tracklist-drawer', 'transitionDuration')).toBeGreaterThan(0.001);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await seconds(page, '#tracklist-drawer', 'transitionDuration')).toBeLessThanOrEqual(0.001);
});

test('reduced motion still navigates and announces', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  const start = await page.evaluate(() => window.__RADAR.activeIndex);
  await page.keyboard.press('d');
  await expect.poll(() => page.evaluate(() => window.__RADAR.activeIndex)).toBe(start + 1);
  await expect(announcer(page)).toHaveText(/^Showing repository /);
});
