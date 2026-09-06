import { expect, type Locator, type Page } from "@playwright/test";
import { execSync, spawn } from "node:child_process";

// Shared helpers for the Lab 2 end-to-end and responsive suites.

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5174";
export const API = process.env.E2E_API_URL ?? "http://localhost:3000";

/** Pimchanok Sonthi owns no tickets and is the empty-list fixture for AC-24. */
export const EMPTY_REQUESTER = "Pimchanok Sonthi";
export const REQUESTER = "Siriporn Meesuk";
export const OTHER_REQUESTER = "Napat Chaiwong";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
} as const;

/**
 * Asserts a locator is visible, has real painted area, and sits inside the
 * viewport, scrolling to it first.
 *
 * A screenshot whose subject is below the fold proves nothing, and DOM-only
 * checks pass against a loading skeleton. Both failure modes have bitten this
 * sprint, so evidence goes through here.
 */
export async function painted(page: Page, locator: Locator, what: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await expect(locator, `${what} should be visible`).toBeVisible({ timeout: 15000 });
  const box = await locator.boundingBox();
  expect(box, `${what} should have a box`).not.toBeNull();
  expect(box!.height, `${what} should have painted height`).toBeGreaterThan(4);
  expect(box!.width, `${what} should have painted width`).toBeGreaterThan(4);
  const viewport = page.viewportSize();
  expect(box!.y, `${what} should be within the viewport`).toBeLessThan(viewport!.height);
}

/** Selects a Development Requester if the selector is showing. */
export async function enterAs(page: Page, name: string, path = "/tickets"): Promise<void> {
  await page.goto(`${BASE}${path}`);
  await page
    .locator('[data-testid="field-dev-requester"], [data-testid="my-tickets-screen"], [data-testid="create-ticket-screen"], [data-testid="ticket-detail-screen"]')
    .first()
    .waitFor({ state: "visible", timeout: 25000 });

  const selector = page.getByTestId("field-dev-requester");
  if (await selector.isVisible().catch(() => false)) {
    const value = await page.evaluate((who) => {
      const sel = document.querySelector("[data-testid='field-dev-requester']") as HTMLSelectElement;
      return Array.from(sel.options).find((o) => o.textContent!.includes(who))!.value;
    }, name);
    await selector.selectOption(value);
    await page.getByTestId("btn-continue").click();
  }
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

export async function fillTicketForm(
  page: Page,
  summary: string,
  description = "Reported end to end with enough detail to satisfy the twenty character minimum.",
): Promise<void> {
  await page.getByTestId("field-category").selectOption({ index: 1 });
  await page.getByTestId("field-related-system").selectOption({ index: 1 });
  await page.getByTestId("field-priority").selectOption("HIGH");
  await page.getByTestId("field-summary").fill(summary);
  await page.getByTestId("field-description").fill(description);
}

/**
 * Stops whatever is listening on the API port, by PID.
 *
 * Stopping the npm wrapper leaves the tsx watch child holding the port, so a
 * test that assumed the wrapper's death meant the server was gone would assert
 * a failure state against a healthy API and capture a false green.
 */
export function stopApi(): void {
  execSync(
    "powershell -NoProfile -Command \"Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }\"",
    { stdio: "ignore" },
  );
}

/** Polls until the API port refuses connections, or fails the test. */
export async function expectApiClosed(timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(1000) });
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("port 3000 is still accepting connections; the failure state would be a false pass");
}


/**
 * Restarts the API, detached so it outlives the test process.
 *
 * E2E-05 has to stop the real server to prove the failure state, which leaves
 * the environment broken for every later suite and for the screenshots. The
 * test that breaks it is the test that repairs it.
 */
export function startApi(): void {
  const child = spawn("npm", ["run", "dev"], {
    cwd: "server",
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();
}

/** Polls until the API answers again. */
export async function expectApiOpen(timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error("the API did not come back on port 3000");
}

/** No horizontal page scrolling at any width (AC-39). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the page must not scroll horizontally").toBeLessThanOrEqual(1);
}
