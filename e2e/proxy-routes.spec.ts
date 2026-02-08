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
    await expect(page.getByRole('heading', { name: /Latest writing/i })).toBeVisible();
  });
});
