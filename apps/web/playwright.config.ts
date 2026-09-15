import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  // The dev server compiles each route on first visit, which can take far
  // longer than Playwright's 5s default the first time a spec reaches a page.
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The app is local-first (OPFS + localStorage), so a dev server is enough.
    // Invoked through the local binary rather than a package manager, so the
    // suite does not depend on pnpm being on PATH.
    command: `npx --no-install next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
