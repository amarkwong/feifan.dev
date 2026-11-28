import { test, expect, open, cards, synced, addActivity, OWNER } from './helpers';

test('the studio loads under the real CSP with the suggested route and no errors', async ({ join }) => {
  const a = await join(OWNER);
  await synced(a.page);
  await expect(a.page.locator('#trip-summary')).toContainText('21 days');
  await expect(a.page.locator('[data-id="china"]')).toBeVisible();
  expect(await cards(a.page).count()).toBeGreaterThan(8);
  expect(a.errors).toEqual([]);
});

test('add, undo, edit notes and delete with confirmation', async ({ join }) => {
  const a = await join(OWNER);
  const page = a.page;
  await synced(page);
  const start = await cards(page).count();

  await addActivity(page);
  await expect(cards(page)).toHaveCount(start + 1);
  await page.click('#undo');
  await expect(cards(page)).toHaveCount(start);

  await page.click('[data-id="xian"]', { position: { x: 20, y: 20 } });
  await page.fill('textarea[name=notes]', 'hello notes');
  await page.click('#edit-form button[type=submit]');
  await expect(page.locator('[data-id="xian"] .card-note')).toHaveText('hello notes');

  await page.click('[data-id="china"]', { position: { x: 20, y: 20 } });
  await page.keyboard.press('Delete');
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.click('#confirm-yes');
  await expect(page.locator('[data-id="china"]')).toHaveCount(0);
  await page.click('#undo');
  await expect(page.locator('[data-id="china"]')).toHaveCount(1);
  expect(a.errors).toEqual([]);
});

test('zoom views and keyboard moves still work', async ({ join }) => {
  const a = await join(OWNER);
  const page = a.page;
  await page.click('#detail');
  await expect(page.locator('#scale-label')).toContainText('px / day');
  await page.click('#fit');
  await expect(page.locator('#scale-label')).toHaveText('Whole trip');
  // Tokyo is the last city and cannot move later, so move a card that has room.
  await addActivity(page);
  const activity = page.locator('#cards .card.activity').first();
  const before = await activity.evaluate(el => (el as HTMLElement).style.top);
  await activity.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.locator('#cards .card.activity').first().evaluate(el => (el as HTMLElement).style.top)).not.toBe(before);
  // A move the plan forbids is refused with a message and nothing changes.
  const tokyo = page.locator('[data-id="tokyo"]');
  const tokyoTop = await tokyo.evaluate(el => (el as HTMLElement).style.top);
  await tokyo.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#toast')).toContainText(/parent dates/i);
  expect(await tokyo.evaluate(el => (el as HTMLElement).style.top)).toBe(tokyoTop);
  expect(a.errors).toEqual([]);
});

test('a city can be renamed in English or local script and receives its matched image', async ({ join }) => {
  const a = await join(OWNER);
  const page = a.page;
  await page.route('https://en.wikipedia.org/w/api.php?**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({query:{pages:{1:{title:'Beijing',thumbnail:{source:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Beijing_skyline.jpg/800px-Beijing_skyline.jpg'}}}}}),
  }));
  await page.click('[data-id="xian"]', { position: { x: 20, y: 20 } });
  await expect(page.locator('input[name=title]')).toBeVisible();
  await page.fill('input[name=title]', '北京');
  await page.click('#edit-form button[type=submit]');
  await expect(page.locator('[data-id="xian"] strong')).toContainText('Beijing · 北京');
  const image=page.locator('[data-id="xian"] img[data-city-photo]');
  await expect(image).toHaveAttribute('src', /upload\.wikimedia\.org/);
  await expect(image).not.toHaveAttribute('hidden', '');
  expect(a.errors).toEqual([]);
});
