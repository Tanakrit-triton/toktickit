import { expect, test } from "@playwright/test";
import {
  BASE,
  OTHER_REQUESTER,
  REQUESTER,
  enterAs,
  expectApiClosed,
  expectApiOpen,
  startApi,
  fillTicketForm,
  painted,
  stopApi,
} from "./helpers.js";

// E2E-01 .. E2E-05 from docs/lab-02/tests.md section 2.6.
//
// The full stack through a real browser against a real database. These are the
// flows a Requester actually performs, so they are written as journeys rather
// than as assertions about single screens.

test.describe.configure({ mode: "serial" });

let createdTicketNumber = "";
let createdTicketUrl = "";

test("E2E-01: select a Requester, create a Ticket, and find it in My Tickets", async ({ page }) => {
  await enterAs(page, REQUESTER, "/tickets/new");

  const summary = `End to end creation ${Date.now()}`;
  await fillTicketForm(page, summary);
  await page.getByTestId("btn-submit-ticket").click();

  const panel = page.getByTestId("state-created");
  await painted(page, panel, "success panel");

  createdTicketNumber = (await page.locator(".zg-created-number").innerText()).trim();
  // The number is issued by the backend, not chosen by the client (BR-01).
  expect(createdTicketNumber).toMatch(/^TKT-\d{4}-\d{5}$/);

  await page.getByTestId("btn-view-ticket").click();
  await painted(page, page.getByTestId("ticket-detail-screen"), "ticket detail");
  createdTicketUrl = page.url();
  await expect(page.getByTestId("ticket-information")).toContainText(createdTicketNumber);

  // And it is findable afterwards, which is the half that makes creation useful.
  await page.goto(`${BASE}/tickets`);
  await page.getByTestId("field-search").fill(createdTicketNumber);
  await page.waitForTimeout(900);
  const row = page.getByTestId(`ticket-row-${createdTicketNumber}`);
  await painted(page, row, "the created ticket in the list");
  await expect(row).toContainText(summary);
});

test("E2E-02: switching Requester replaces the visible list", async ({ page }) => {
  await enterAs(page, REQUESTER);
  await page.getByTestId("field-search").fill(createdTicketNumber);
  await page.waitForTimeout(900);
  await expect(page.getByTestId(`ticket-row-${createdTicketNumber}`)).toBeVisible();

  await page.getByTestId("btn-change-requester").click();
  await page.getByTestId("field-dev-requester").waitFor({ state: "visible" });

  const value = await page.evaluate((who) => {
    const sel = document.querySelector("[data-testid='field-dev-requester']") as HTMLSelectElement;
    return Array.from(sel.options).find((o) => o.textContent!.includes(who))!.value;
  }, OTHER_REQUESTER);
  await page.getByTestId("field-dev-requester").selectOption(value);
  await page.getByTestId("btn-continue").click();

  await page.getByTestId("my-tickets-screen").waitFor({ state: "visible" });
  await expect(page.getByTestId("shell-requester-name")).toContainText(OTHER_REQUESTER);
  // Requester A's ticket is gone, not merely re-sorted (AC-04, AC-18).
  await expect(page.getByTestId(`ticket-row-${createdTicketNumber}`)).toHaveCount(0);
});

test("E2E-03: another Requester's ticket URL is refused", async ({ page }) => {
  expect(createdTicketUrl, "E2E-01 must have produced a ticket URL").not.toBe("");

  await enterAs(page, OTHER_REQUESTER);
  await page.goto(createdTicketUrl);

  // Typing the URL is the attack this defends against, so it is typed rather
  // than reached by navigation (AC-27, BR-18).
  await painted(page, page.getByTestId("state-detail-failed"), "refusal");
  await expect(page.getByTestId("ticket-information")).toHaveCount(0);

  const body = await page.locator("body").innerText();
  expect(body).not.toContain(createdTicketNumber);
});

test("E2E-04: attachment lifecycle from Ticket Detail", async ({ page }) => {
  await enterAs(page, REQUESTER);
  await page.goto(createdTicketUrl);
  await page.getByTestId("ticket-detail-screen").waitFor({ state: "visible" });

  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  await page.setInputFiles('[data-testid="field-attachments"]', {
    name: "e2e-evidence.png",
    mimeType: "image/png",
    buffer: png,
  });

  const row = page.locator('[data-testid^="attachment-row-"]').first();
  await painted(page, row, "uploaded attachment");
  await expect(row).toContainText("e2e-evidence.png");

  // Download is a real request, not a rendered link that might 404.
  const downloadUrl = await row.locator('[data-testid="btn-download"]').getAttribute("href");
  const requesterId = await page.evaluate(() =>
    JSON.parse(window.sessionStorage.getItem("toktickit.selectedRequester")!).id,
  );
  const download = await page.request.get(downloadUrl!, {
    headers: { "X-Dev-Requester-Id": requesterId },
  });
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("e2e-evidence.png");

  await row.locator('[data-testid="btn-remove"]').click();
  await painted(page, page.getByTestId("removal-modal"), "removal modal");
  await page.getByTestId("field-removal-reason").fill("Removed during the end to end run");
  await page.getByTestId("btn-confirm-removal").click();

  const removed = page.locator('[data-testid^="attachment-row-"]').filter({
    has: page.getByTestId("badge-removed"),
  });
  await painted(page, removed.first(), "removed attachment");
  await expect(removed.first().locator('[data-testid="btn-download"]')).toHaveCount(0);

  // The binary is gone, so even the direct URL cannot serve it (AC-36, DEC-05).
  const afterRemoval = await page.request.get(downloadUrl!, {
    headers: { "X-Dev-Requester-Id": requesterId },
  });
  expect(afterRemoval.status()).toBe(410);
});

test("E2E-05: submission with the backend stopped keeps every entered value", async ({ page }) => {
  await enterAs(page, REQUESTER, "/tickets/new");

  const summary = `Backend down ${Date.now()}`;
  const description = "Typed before the backend was stopped, and it must survive the failure.";
  await fillTicketForm(page, summary, description);

  // Reference data is already loaded, so the failure below is the create call.
  stopApi();
  // Asserted, not assumed: stopping the npm wrapper leaves tsx watch holding
  // the port, and the form would then submit successfully against a healthy
  // API while this test claimed to have proved a failure state.
  await expectApiClosed();

  await page.getByTestId("btn-submit-ticket").click();
  await painted(page, page.getByTestId("state-create-failed"), "failure callout");

  await expect(page.getByTestId("field-summary")).toHaveValue(summary);
  await expect(page.getByTestId("field-description")).toHaveValue(description);
  await expect(page.getByTestId("field-priority")).toHaveValue("HIGH");
  await expect(page.getByTestId("btn-submit-ticket")).toBeEnabled();

  const body = await page.locator("body").innerText();
  for (const leak of [/\b500\b/, /ECONNREFUSED/i, /localhost:3000/]) {
    expect(body).not.toMatch(leak);
  }

  // The test that broke the environment repairs it: every later suite and
  // every screenshot needs the API back.
  startApi();
  await expectApiOpen();
});
