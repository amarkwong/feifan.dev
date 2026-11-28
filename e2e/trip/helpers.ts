import { test as base, expect, type Browser, type BrowserContext, type Page, type APIRequestContext } from '@playwright/test';

export const OWNER = 'owner@local.test';
export const PARTNER = 'partner@local.test';

export type Person = { context: BrowserContext; page: Page; errors: string[] };

/** One browser (own localStorage) signed in as `user`, as Cloudflare Access would do. */
export async function open(browser: Browser, user: string, baseURL: string): Promise<Person> {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-dev-user': user }, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  // Failed network requests are logged as console errors by Chromium; those are asserted explicitly where expected.
  // `navigate-to` is already in lounge/_headers but no browser supports it any more; it only logs this warning.
  const known = (text: string) => text.startsWith('Failed to load resource') || text.includes("Unrecognized Content-Security-Policy directive 'navigate-to'");
  page.on('console', m => { if (m.type() === 'error' && !known(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto('/trip/');
  return { context, page, errors };
}

export const cards = (page: Page) => page.locator('#cards .card');
export const saved = (page: Page) => page.locator('#saved');
export const synced = (page: Page) => expect(saved(page)).toHaveAttribute('data-sync', 'sync');

/** Select Chengdu and add the first suggested activity. Returns the new card count. */
export async function addActivity(page: Page) {
  await page.click('[data-id="chengdu"]', { position: { x: 20, y: 20 } });
  await page.click('[data-tab="activity"]');
  await page.click('.pool-add >> nth=0');
}

export async function serverPlan(request: APIRequestContext, user = OWNER) {
  const res = await request.get('/api/trip/plan', { headers: { 'x-dev-user': user } });
  return { status: res.status(), body: await res.json() };
}

type Fixtures = {
  /** Open the studio as `user` in its own browser context. Closed automatically after the test. */
  join: (user: string) => Promise<Person>;
  /** A bare context (no identity header, nothing opened) that is also closed automatically. */
  bare: (options?: Parameters<Browser['newContext']>[0]) => Promise<BrowserContext>;
  fresh: void;
};

export const test = base.extend<Fixtures>({
  // Every test starts from an empty shared plan.
  fresh: [async ({ request }, use) => { expect((await request.post('/__dev/reset')).status()).toBe(204); await use(); }, { auto: true }],
  join: async ({ browser, baseURL }, use) => {
    const opened: BrowserContext[] = [];
    await use(async user => { const person = await open(browser, user, baseURL!); opened.push(person.context); return person; });
    for (const context of opened) await context.close();
  },
  bare: async ({ browser, baseURL }, use) => {
    const opened: BrowserContext[] = [];
    await use(async options => { const context = await browser.newContext({ baseURL, ...options }); opened.push(context); return context; });
    for (const context of opened) await context.close();
  },
});
export { expect };
