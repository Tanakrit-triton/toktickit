import { defineConfig, devices } from "@playwright/test";

// Lab 2 responsive and end-to-end suites (tests.md sections 2.5 and 2.6), and
// the Lab 3 suites (docs/lab-03/tests.md sections 2.12 and 2.13).
// Run from the repository root:  npm run test:e2e
//
// Both suites drive the real stack, so the Vite dev server and the Express API
// must already be running (client on 5173, server on 3000). The webServer block
// below starts the client only; the API is started separately because it needs
// a migrated and seeded database, which the suites do not manage themselves.

// The Lab 3 specs run in the desktop project only. They are kept out of the
// tablet and mobile projects here rather than skipped at run time, so none is
// reported as skipped. The journeys are desktop flows. The responsive suite and
// the evidence spec open their own browser context at each width they capture
// (docs/lab-03/tests.md 2.12), so running them once covers all three.
const LAB3_DESKTOP_ONLY = /lab-03[\\/](authentication|staff-ticket-flow|user-administration|responsive|evidence)\.spec\.ts$/;

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
      testIgnore: LAB3_DESKTOP_ONLY,
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
      testIgnore: LAB3_DESKTOP_ONLY,
    },
  ],
});
