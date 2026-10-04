import { defineConfig, devices } from "@playwright/test";

// Lab 2 responsive and end-to-end suites (tests.md sections 2.5 and 2.6), and
// the Lab 3 suites (docs/lab-03/tests.md sections 2.12 and 2.13).
// Run from the repository root:  npm run test:e2e
//
// Both suites drive the real stack, so the Vite dev server and the Express API
// must already be running (client on 5173, server on 3000). The webServer block
// below starts the client only; the API is started separately because it needs
// a migrated and seeded database, which the suites do not manage themselves.

// The Lab 3 journeys run at desktop only. They are kept out of the tablet and
// mobile projects here rather than skipped at run time, so none is reported as
// skipped. Layout at every width is the responsive suite's job.
const LAB3_JOURNEYS = /lab-03[\\/](authentication|staff-ticket-flow|user-administration)\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  // Stops an API that Lab 2 E2E-05 restarted, so a run leaves no detached process.
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "artifacts/lab-02/playwright-report", open: "never" }]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // ui-spec.md section 10 fixes these three widths. The project names are the
  // filename prefixes used for every captured screenshot.
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1112 } },
      testIgnore: LAB3_JOURNEYS,
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
      testIgnore: LAB3_JOURNEYS,
    },
  ],
});
