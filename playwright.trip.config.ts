import { defineConfig } from '@playwright/test';

// Local tests for the Lounge trip studio and its shared-plan API.
// Starts scripts/trip-dev-server.mjs (static files + the real Worker on SQLite).
//   npm run test:trip
const port = Number(process.env.TRIP_PORT || 8787);

export default defineConfig({
  testDir: './e2e/trip',
  // Every test shares one dev-server database, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/trip-dev-server.mjs',
    url: `http://127.0.0.1:${port}/trip/`,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
