import { test, expect, cards, synced, serverPlan } from './helpers';
import type { Page } from '@playwright/test';
import { OWNER } from './helpers';

// 1x1 PNG, used both as a stand-in for Wikimedia thumbnails and as an "uploaded photo".
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function addHotel(page: Page) {
  await page.click('[data-id="chengdu"]', { position: { x: 20, y: 20 } });
  await page.click('[data-tab="hotel"]');
  await page.click('.pool-add >> nth=0');
  await expect(page.locator('input[name=brand]')).toBeVisible();
}
async function addFlight(page: Page) {
  await page.click('[data-id="chengdu"]', { position: { x: 20, y: 20 } });
  await page.click('[data-tab="logistics"]');
  await page.click('.pool-add >> nth=0'); // Flight
  await expect(page.locator('input[name=flightNo]')).toBeVisible();
}
const apply = (page: Page) => page.click('#edit-form button[type=submit]');

test.describe('stays', () => {
  test('hotel details are editable and shown on the card', async ({ join }) => {
    const { page, errors } = await join(OWNER);
    await synced(page);
    await addHotel(page);
    await page.fill('input[name=brand]', 'Park Hyatt');
    await page.fill('input[name=title]', 'Park Hyatt Chengdu');
    await page.fill('input[name=roomType]', 'King');
    await page.fill('input[name=price]', '650');
    await page.selectOption('select[name=currency]', 'CNY');
    await page.fill('input[name=confirmation]', 'AB12CD');
    await page.fill('input[name=bookingUrl]', 'https://hyatt.example/booking');
    await page.check('input[name=booked]');
    await apply(page);

    const card = page.locator('#cards .card.hotel');
    await expect(card.locator('.card-kind')).toContainText('Park Hyatt');
    await expect(card.locator('strong')).toContainText('Park Hyatt Chengdu');
    await expect(card.locator('.card-meta')).toContainText('CNY 650/night');
    await expect(card.locator('.card-meta')).toContainText('✓ booked');
    await synced(page);
    await page.reload();
    await synced(page);
    await page.click('#cards .card.hotel', { position: { x: 20, y: 20 } });
    await expect(page.locator('input[name=confirmation]')).toHaveValue('AB12CD');
    await expect(page.locator('input[name=bookingUrl]')).toHaveValue('https://hyatt.example/booking');
    expect(errors).toEqual([]);
  });

  test('a booking link must be https', async ({ join }) => {
    const { page } = await join(OWNER);
    await addHotel(page);
    await page.evaluate(() => { (document.querySelector('input[name=bookingUrl]') as HTMLInputElement).type = 'text'; });
    await page.fill('input[name=bookingUrl]', 'javascript:alert(1)');
    await apply(page);
    await expect(page.locator('#toast')).toContainText('https://');
    await expect(page.locator('#cards .card.hotel .card-meta')).not.toContainText('booked');
  });

  test('finding a photo by brand offers free-licensed candidates and keeps the choice', async ({ join, request }) => {
    const { page, errors } = await join(OWNER);
    await page.route('https://upload.wikimedia.org/**', route => route.fulfill({ contentType: 'image/png', body: PNG }));
    await synced(page);
    await addHotel(page);
    await page.fill('input[name=brand]', 'Park Hyatt');
    await page.fill('input[name=title]', 'Tokyo');
    await page.click('#photo-find');
    const candidates = page.locator('#photo-candidates .candidate');
    await expect(candidates).toHaveCount(1);          // the non-free logo and the off-host image are filtered out
    await candidates.first().click();
    await expect(page.locator('#photo-box img')).toBeVisible();
    await expect(page.locator('#photo-box')).toContainText('Jane Doe & Co · CC BY-SA 4.0');
    await expect(page.locator('#photo-box a')).toHaveAttribute('href', /commons\.wikimedia\.org/);
    await apply(page);
    await expect(page.locator('#cards .card.hotel .hotel-photo')).toHaveAttribute('src', /upload\.wikimedia\.org/);
    await synced(page);
    const plan = (await serverPlan(request)).body.plan;
    expect(plan.items.find((i: any) => i.kind === 'Hotel').image.credit).toBe('Jane Doe & Co · CC BY-SA 4.0');
    expect(errors).toEqual([]);                        // includes any CSP violation for the thumbnail
  });

  test('no match explains itself, and the search needs a name', async ({ join }) => {
    const { page } = await join(OWNER);
    await addHotel(page);
    await page.fill('input[name=title]', 'Hotel');
    await page.click('#photo-find');
    await expect(page.locator('#photo-candidates')).toContainText('Type a brand or hotel name first');
    await page.fill('input[name=brand]', 'Nowhere Inn');
    await page.click('#photo-find');
    await expect(page.locator('#photo-candidates')).toContainText('No free-licensed photo found for “Nowhere Inn”');
  });

  test('an uploaded photo is shrunk, stored, shown, and can be removed', async ({ join }) => {
    const { page, errors } = await join(OWNER);
    await synced(page);
    await addHotel(page);
    await page.setInputFiles('#photo-upload', { name: 'room.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('#photo-box')).toContainText('Your photo');
    await apply(page);
    await expect(page.locator('#cards .card.hotel .hotel-photo')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    await page.click('#photo-clear');
    await apply(page);
    await expect(page.locator('#cards .card.hotel .hotel-photo')).toHaveCount(0);
    await page.click('#undo');                          // removal is undoable
    await expect(page.locator('#cards .card.hotel .hotel-photo')).toHaveCount(1);

    await page.setInputFiles('#photo-upload', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.locator('#photo-candidates')).toContainText('Choose a JPG, PNG or WebP');
    expect(errors).toEqual([]);
  });
});

test.describe('flights', () => {
  test('a flight number fills airline, airports and times, then updates the card', async ({ join, request }) => {
    const { page, errors } = await join(OWNER);
    await synced(page);
    await addFlight(page);
    await page.fill('input[name=flightNo]', 'sq 246');
    await page.click('#flight-lookup');
    await expect(page.locator('#flight-status')).toContainText('Singapore Airlines SQ246: BNE 09:35 → SIN 15:20 · 7h 45m');
    await expect(page.locator('#flight-status')).toContainText('lookups left today');
    await expect(page.locator('input[name=depAirport]')).toHaveValue('BNE');
    await expect(page.locator('input[name=arrAirport]')).toHaveValue('SIN');
    await expect(page.locator('input[name=airlineName]')).toHaveValue('Singapore Airlines');
    await expect(page.locator('input[name=hours]')).toHaveValue('8');
    await expect(page.locator('input[name=date]')).toHaveValue(/T09:30$/);

    await apply(page);
    const card = page.locator('#cards .card.travel:has(.flight-line)'); // the starter route also has a "Flight home" card
    await expect(card.locator('.flight-line')).toContainText('SQ246 · BNE 09:35 → SIN 15:20');
    await expect(card.locator('.airline')).toHaveText('SQ');
    await expect(card.locator('.airline')).toHaveCSS('background-color', 'rgb(26, 43, 95)'); // painted despite the no-inline-style CSP
    await expect(card.locator('.card-meta')).toContainText('8h');
    await synced(page);
    const flight = (await serverPlan(request)).body.plan.items.find((i: any) => i.flightNo === 'SQ246');
    expect(flight).toMatchObject({ flightNo: 'SQ246', depAirport: 'BNE', arrAirport: 'SIN', airlineName: 'Singapore Airlines' });
    expect(errors).toEqual([]);
  });

  test('unknown numbers and bad input are explained without changing the card', async ({ join }) => {
    const { page } = await join(OWNER);
    await addFlight(page);
    await page.fill('input[name=flightNo]', 'hello');
    await page.click('#flight-lookup');
    await expect(page.locator('#flight-status')).toContainText('Enter a flight number like SQ246');
    await page.fill('input[name=flightNo]', 'XX999');
    await page.click('#flight-lookup');
    await expect(page.locator('#flight-status')).toContainText('No flight XX999 found');
    await expect(page.locator('input[name=depAirport]')).toHaveValue('');
  });

  test('flight details can be typed by hand and are normalised', async ({ join }) => {
    const { page } = await join(OWNER);
    await addFlight(page);
    await page.fill('input[name=flightNo]', 'cz 306');
    await expect(page.locator('input[name=airlineName]')).toHaveValue('China Southern Airlines');
    await page.fill('input[name=depAirport]', 'bne');
    await page.fill('input[name=arrAirport]', 'can');
    await page.fill('input[name=depLocal]', '2026-12-30T11:00');
    await page.fill('input[name=arrLocal]', '2026-12-30T18:30');
    await apply(page);
    await expect(page.locator('#cards .card.travel .flight-line')).toContainText('CZ306 · BNE 11:00 → CAN 18:30');

    // The edited card stays selected after Apply, so its editor is still open.
    await expect(page.locator('input[name=flightNo]')).toHaveValue('CZ306');   // really the card we just edited
    await page.fill('input[name=flightNo]', 'hello');
    await apply(page);
    await expect(page.locator('#toast')).toContainText('Flight numbers look like');
    await page.fill('input[name=flightNo]', 'CZ306');
    await page.fill('input[name=depAirport]', 'BN');
    await apply(page);
    await expect(page.locator('#toast')).toContainText('three letters');
  });

  test('rail and transfer cards do not show flight fields', async ({ join }) => {
    const { page } = await join(OWNER);
    await page.click('[data-id="chengdu"]', { position: { x: 20, y: 20 } });
    await page.click('[data-tab="logistics"]');
    await page.click('.pool-add >> nth=1'); // Railway
    await expect(page.locator('input[name=departure]')).toBeVisible();
    await expect(page.locator('input[name=flightNo]')).toHaveCount(0);
  });
});
