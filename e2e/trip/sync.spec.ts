import { test, expect, cards, saved, synced, addActivity, serverPlan, OWNER, PARTNER } from './helpers';

const poll = (page: import('@playwright/test').Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

test('the first visit shares the plan and a second person receives it', async ({ join, request }) => {
  const a = await join(OWNER);
  await synced(a.page);
  expect((await serverPlan(request)).body.version).toBe(1);

  await addActivity(a.page);
  await synced(a.page);
  const withActivity = await cards(a.page).count();
  expect((await serverPlan(request)).body.version).toBe(2);

  const b = await join(PARTNER);
  await synced(b.page);
  await expect(cards(b.page)).toHaveCount(withActivity);
  expect((await serverPlan(request)).body.updatedBy).toBe(OWNER);
  expect([...a.errors, ...b.errors]).toEqual([]);
});

test('changes arrive on the other device without a reload and say who made them', async ({ join }) => {
  const a = await join(OWNER);
  await synced(a.page);
  const b = await join(PARTNER);
  await synced(b.page);
  const before = await cards(a.page).count();

  await addActivity(b.page);
  await synced(b.page);
  await poll(a.page);
  await expect(cards(a.page)).toHaveCount(before + 1);
  await expect(a.page.locator('#toast')).toContainText('Plan updated by partner');
  await synced(a.page);
});

test('simultaneous edits ask which version to keep; the shared version keeps mine on Undo', async ({ join, request }) => {
  const a = await join(OWNER);
  await synced(a.page);
  const b = await join(PARTNER);
  await synced(b.page);
  const base = await cards(a.page).count();

  await addActivity(b.page);          // partner saves first (v2)
  await synced(b.page);
  await a.page.click('[data-id="xian"]', { position: { x: 20, y: 20 } });
  await a.page.fill('textarea[name=notes]', 'owner note');
  await a.page.click('#edit-form button[type=submit]'); // owner saves from stale v1

  await expect(a.page.locator('#sync-dialog')).toBeVisible();
  await expect(a.page.locator('#sync-message')).toContainText('partner saved changes');
  await expect(saved(a.page)).toHaveAttribute('data-sync', 'conflict');
  await a.page.keyboard.press('Escape');                 // a choice is required
  await expect(a.page.locator('#sync-dialog')).toBeVisible();

  await a.page.click('#sync-theirs');
  await expect(cards(a.page)).toHaveCount(base + 1);     // partner's activity is here
  await synced(a.page);
  expect(JSON.stringify((await serverPlan(request)).body.plan)).not.toContain('owner note');

  await a.page.click('#undo');                           // my version comes back and is shared
  await expect(cards(a.page)).toHaveCount(base);
  await synced(a.page);
  expect(JSON.stringify((await serverPlan(request)).body.plan)).toContain('owner note');
  expect([...a.errors, ...b.errors]).toEqual([]);
});

test('keeping mine replaces the shared plan', async ({ join, request }) => {
  const a = await join(OWNER);
  await synced(a.page);
  const b = await join(PARTNER);
  await synced(b.page);
  const base = await cards(a.page).count();

  await addActivity(b.page);
  await synced(b.page);
  await a.page.click('[data-id="xian"]', { position: { x: 20, y: 20 } });
  await a.page.fill('textarea[name=notes]', 'owner wins');
  await a.page.click('#edit-form button[type=submit]');
  await expect(a.page.locator('#sync-dialog')).toBeVisible();
  await a.page.click('#sync-mine');

  await synced(a.page);
  await expect(cards(a.page)).toHaveCount(base);
  const {body} = await serverPlan(request);
  expect(JSON.stringify(body.plan)).toContain('owner wins');
  expect(body.plan.items.length).toBe(base);
  expect(body.version).toBe(3);
});

test('offline edits are kept and shared when the connection returns', async ({ join, request }) => {
  const a = await join(OWNER);
  await synced(a.page);
  const before = await cards(a.page).count();

  await a.context.setOffline(true);
  await addActivity(a.page);
  await expect(saved(a.page)).toHaveAttribute('data-sync', 'offline');
  await expect(cards(a.page)).toHaveCount(before + 1);
  expect((await serverPlan(request)).body.plan.items.length).toBe(before);

  await a.context.setOffline(false);
  await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await synced(a.page);
  expect((await serverPlan(request)).body.plan.items.length).toBe(before + 1);
});

test('edits made offline survive a reload and are shared on the next visit', async ({ join, request }) => {
  const a = await join(OWNER);
  await synced(a.page);
  const before = await cards(a.page).count();
  await a.context.setOffline(true);
  await addActivity(a.page);
  await expect(saved(a.page)).toHaveAttribute('data-sync', 'offline');
  await a.context.setOffline(false);
  await a.page.reload();
  await synced(a.page);                                  // same base version, so it pushes rather than asking
  await expect(cards(a.page)).toHaveCount(before + 1);
  expect((await serverPlan(request)).body.plan.items.length).toBe(before + 1);
});

test('a signed-in account that is not an editor can plan locally but nothing is shared', async ({ join, request }) => {
  const a = await join(OWNER);
  await synced(a.page);
  const stranger = await join('friend@local.test');
  await expect(saved(stranger.page)).toHaveAttribute('data-sync', 'denied');
  const before = await cards(stranger.page).count();
  await addActivity(stranger.page);
  await expect(cards(stranger.page)).toHaveCount(before + 1);
  await expect(saved(stranger.page)).toHaveAttribute('data-sync', 'denied');
  expect((await serverPlan(request)).body.version).toBe(1);
  expect((await request.get('/api/trip/plan', { headers: { 'x-dev-user': 'friend@local.test' } })).status()).toBe(403);
  expect(stranger.errors).toEqual([]);
});

test('without the API the page is a plain local planner', async ({ bare }) => {
  const context = await bare();
  await context.route('**/api/trip/plan*', route => route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Not found</h1>' }));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/trip/');
  await expect(saved(page)).toHaveText('Saved on this device');
  const before = await cards(page).count();
  await addActivity(page);
  await expect(cards(page)).toHaveCount(before + 1);
  await expect(saved(page)).not.toHaveAttribute('data-sync', /.+/);
  expect(errors).toEqual([]);
});

test('a device with its own saved plan is asked before it joins an existing shared plan', async ({ join, bare, request }) => {
  const a = await join(OWNER);
  await synced(a.page);
  // Partner has already planned alone in this browser before the shared plan existed here.
  const context = await bare({ extraHTTPHeaders: { 'x-dev-user': PARTNER } });
  await context.route('**/api/trip/plan*', route => route.fulfill({ status: 404, contentType: 'text/html', body: 'x' }));
  const page = await context.newPage();
  await page.goto('/trip/');
  await addActivity(page);
  await context.unroute('**/api/trip/plan*');
  await page.reload();
  await expect(page.locator('#sync-dialog')).toBeVisible();
  await expect(page.locator('#sync-message')).toContainText('this device has a different saved plan');
  await page.click('#sync-theirs');
  await synced(page);
  expect((await serverPlan(request)).body.version).toBe(1);
});
