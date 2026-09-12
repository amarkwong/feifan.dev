import { test, expect } from '@playwright/test';

test.describe('Site routes', () => {
  test('homepage loads', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
  });

  test('homepage renders profile content', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Feifan/i);
    await expect(page.getByRole('link', { name: /Read field notes/i })).toBeVisible();
  });

  test('thoughts page loads', async ({ page }) => {
    const response = await page.goto('/thoughts');
    expect(response?.status()).toBe(200);
  });

  test('thoughts page renders writing section', async ({ page }) => {
    await page.goto('/thoughts');
    await expect(page.getByRole('heading', { name: 'Thoughts.', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /EnergyHub, a side project/ }).click();
    await expect(page.getByRole('heading', { name: 'EnergyHub, a side project to reduce your electricity bill' })).toBeVisible();
    await expect(page.getByText('Not yet published.', { exact: true })).toBeVisible();
  });
});

test('career roles still switch after client navigation', async ({ page }) => {
  await page.goto('/thoughts');
  await page.getByRole('link', { name: 'Experience', exact: true }).click();
  await page.locator('[data-career="2"]').click();
  await expect(page.locator('[data-panel="2"]')).toBeVisible();
  await expect(page.locator('[data-panel="0"]')).toBeHidden();
});
