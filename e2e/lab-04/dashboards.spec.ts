import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, BASE, LAB4, guardConsole, signIn } from "./lab4.js";

// E2E-06 to E2E-08 from docs/lab-04/tests.md section 2.10 (AC-24, AC-28,
// AC-40). They read the seeded fixtures (specification.md 7.5) and change
// nothing.

/** Waits until no region of the page is loading. */
async function settled(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15000 });
}

async function metricValue(page: Page, key: string): Promise<number> {
  const text = await page.getByTestId(`metric-value-${key}`).innerText();
  return Number(text.trim());
}

test("E2E-06: Napat follows Waiting for you to the filtered My Tickets; Pimchanok's dashboard is all zeros", async ({ browser }) => {
  const napatContext = await browser.newContext();
  const pimchanokContext = await browser.newContext();
  try {
    const napat = await napatContext.newPage();
    await signIn(napat, LAB4.napat.email);
    await napat.goto(`${BASE}/dashboard`);
    await napat.getByTestId("requester-dashboard-screen").waitFor();
    await settled(napat);
    const waiting = await metricValue(napat, "waitingForMe");
    expect(waiting, "the seed gives Napat a ticket waiting for him").toBeGreaterThan(0);

    await napat.getByTestId("metric-waitingForMe").click();
    await expect(napat).toHaveURL(`${BASE}/tickets?status=WAITING_FOR_REQUESTER`);
    await expect(napat.getByTestId("filter-chip")).toContainText("Showing: Waiting for Requester");
    await settled(napat);
    const rows = napat.locator('[data-testid^="ticket-row-"]');
    await expect(rows).toHaveCount(waiting);
    for (const status of await rows.getByTestId("badge-status").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))) {
      expect(status).toBe("WAITING_FOR_REQUESTER");
    }

    const pimchanok = await pimchanokContext.newPage();
    await signIn(pimchanok, LAB4.pimchanok.email);
    await pimchanok.goto(`${BASE}/dashboard`);
    await pimchanok.getByTestId("requester-dashboard-screen").waitFor();
    await settled(pimchanok);
    for (const key of ["openTickets", "waitingForMe", "updatedRecently", "resolvedRecently"]) {
      await expect(pimchanok.getByTestId(`metric-value-${key}`), key).toHaveText("0");
    }
    await expect(pimchanok.getByTestId("link-create-ticket")).toBeVisible();
  } finally {
    await napatContext.close();
    await pimchanokContext.close();
  }
});

test("E2E-07: Arisa follows Owned by me to the filtered Queue, then an open action to its ticket's Actions Taken", async ({ page }) => {
  await signIn(page, LAB4.arisa.email);
  await page.goto(`${BASE}/staff/dashboard`);
  await page.getByTestId("staff-dashboard-screen").waitFor();
  await settled(page);
  const owned = await metricValue(page, "ownedByMe");
  expect(owned, "the seed gives Arisa owned tickets").toBeGreaterThan(0);

  await page.getByTestId("metric-ownedByMe").click();
  await expect(page).toHaveURL(`${BASE}/staff/queue?owner=me&statusGroup=ACTIVE`);
  await expect(page.getByTestId("filter-chip")).toContainText("Showing: Open tickets");
  await expect(page.getByTestId("queue-count")).toHaveText(`${owned} tickets`);

  await page.getByTestId("nav-dashboard").click();
  await page.getByTestId("staff-dashboard-screen").waitFor();
  await settled(page);
  const item = page.getByTestId("list-myOpenActions").getByRole("link").first();
  const href = await item.getAttribute("href");
  expect(href).toMatch(/^\/staff\/tickets\/[0-9a-f-]{36}#actions$/);
  await item.click();
  await expect(page).toHaveURL(`${BASE}${href}`);
  await page.getByTestId("operations-card").waitFor();
  await settled(page);
  await expect(page.getByTestId("actions-card")).toBeInViewport();
});

/** Every in-app link inside the dashboard screen, without duplicates. */
async function dashboardLinks(page: Page, screen: string): Promise<string[]> {
  const hrefs = await page.getByTestId(screen).locator("a[href^='/']").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  return [...new Set(hrefs)];
}

for (const [role, email, dashboard, screen, nav] of [
  ["Requester", LAB4.napat.email, "/dashboard", "requester-dashboard-screen", ["Dashboard", "My Tickets", "Create Ticket"]],
  ["IT Staff", LAB4.arisa.email, "/staff/dashboard", "staff-dashboard-screen", ["Dashboard", "Ticket Queue"]],
  ["Administrator", ACCOUNTS.admin.email, "/staff/dashboard", "staff-dashboard-screen", ["Dashboard", "Ticket Queue", "User Management"]],
] as const) {
  test(`E2E-08: the ${role} visits every navigation item and dashboard link with no console error and no not-found screen`, async ({ page }) => {
    test.setTimeout(120000);
    const consoleGuard = guardConsole(page);
    await signIn(page, email);
    consoleGuard.signedIn();

    const visit = async (where: string) => {
      await settled(page);
      await expect(page.getByTestId("state-not-found"), where).toHaveCount(0);
      await expect(page.getByTestId("state-forbidden"), where).toHaveCount(0);
      await expect(page.getByTestId("state-list-failed"), where).toHaveCount(0);
    };

    // Navigation items, by clicking them as a user would.
    const main = page.getByRole("navigation", { name: "Main" });
    await expect(main.getByRole("link")).toHaveText([...nav]);
    for (const label of nav) {
      await main.getByRole("link", { name: label, exact: true }).click();
      await visit(`nav ${label}`);
    }

    // Every link on the dashboard: cards, status and priority rows, list items.
    await page.goto(`${BASE}${dashboard}`);
    await page.getByTestId(screen).waitFor();
    await settled(page);
    const links = await dashboardLinks(page, screen);
    expect(links.length, "the dashboard has links to follow").toBeGreaterThan(0);
    for (const href of links) {
      await page.goto(`${BASE}${dashboard}`);
      await page.getByTestId(screen).waitFor();
      await settled(page);
      await page.getByTestId(screen).locator(`a[href="${href}"]`).first().click();
      await expect(page).toHaveURL(`${BASE}${href}`);
      await visit(href);
    }

    await consoleGuard.check(`E2E-08 ${role}`);
  });
}
