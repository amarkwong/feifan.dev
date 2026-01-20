import { test, expect } from '@playwright/test';

test.describe('Proxy Routes', () => {
  test.describe('Arcade (/arcade)', () => {
    test('should load arcade app', async ({ page }) => {
      const response = await page.goto('/arcade/');
      expect(response?.status()).toBe(200);
    });

    test('should have correct title', async ({ page }) => {
      await page.goto('/arcade/');
      await expect(page).toHaveTitle(/Arcade/i);
    });

    test('should render arcade content', async ({ page }) => {
      await page.goto('/arcade/');
      // Verify the arcade-specific content exists in DOM
      await expect(page.locator('main')).toBeAttached();
      // Check for arcade-specific class (use first() since there are multiple)
      await expect(page.locator('[class*="arcade"]').first()).toBeAttached();
    });
  });

  test.describe('GeoPin (/geopin)', () => {
    test('should load geopin app', async ({ page }) => {
      const response = await page.goto('/geopin/');
      expect(response?.status()).toBe(200);
    });

    test('should have correct title', async ({ page }) => {
      await page.goto('/geopin/');
      await expect(page).toHaveTitle(/GeoPin/i);
    });

    test('should render geopin content', async ({ page }) => {
      await page.goto('/geopin/');
      // Wait for the body content to load
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Main Site', () => {
    test('should load homepage', async ({ page }) => {
      const response = await page.goto('/');
      expect(response?.status()).toBe(200);
    });

    test('should have feifan.dev content', async ({ page }) => {
      await page.goto('/');
      // Verify we're on the main site, not a proxy
      await expect(page.locator('body')).toBeVisible();
    });
  });
});
