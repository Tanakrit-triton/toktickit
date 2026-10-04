import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, BASE, apiSession, createTicket, signIn } from "./helpers.js";

// E2E-03, E2E-04, E2E-05, and E2E-09 from docs/lab-03/tests.md section 2.13.
//
// Each test creates its own ticket through the Requester API, so no test
// depends on a seeded ticket's state or on an earlier run. Staff and the
// Requester use separate browser contexts, so each holds only its own session.

const runId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** The status in the operations card, by its machine value (ui-spec 7.1). */
const opsStatus = (page: Page) => page.getByTestId("operations-card").getByTestId("badge-status");

/** Finds a ticket in the queue by number and returns its desktop row. */
async function queueRow(page: Page, ticketNumber: string) {
  await page.goto(`${BASE}/staff/queue`);
  await page.getByTestId("staff-queue-screen").waitFor();
  await page.getByTestId("field-search").fill(ticketNumber);
  const row = page.getByTestId(`queue-row-${ticketNumber}`);
  await expect(row).toBeVisible({ timeout: 15000 });
  return row;
}

test("E2E-03: claim, IT Priority, start, comment and note, appears resolved, resolve, close", async ({ browser }) => {
  const requesterApi = await apiSession(ACCOUNTS.requester.email);
  const ticket = await createTicket(requesterApi, `E2E-03 staff flow ${runId()}`);
  await requesterApi.dispose();

  const comment = `Public reply for the Requester ${runId()}`;
  const note = `Internal note for staff only ${runId()}`;

  const staffContext = await browser.newContext();
  const requesterContext = await browser.newContext();
  try {
    const staff = await staffContext.newPage();
    await signIn(staff, ACCOUNTS.staff.email);

    await (await queueRow(staff, ticket.ticketNumber)).getByRole("link").first().click();
    await staff.getByTestId("staff-ticket-detail-screen").getByTestId("operations-card").waitFor();
    await expect(opsStatus(staff)).toHaveAttribute("data-status", "NEW");

    // Claim: owner becomes the actor and NEW becomes OPEN (AC-35).
    await staff.getByTestId("btn-claim").click();
    await expect(staff.getByTestId("ticket-owner")).toHaveText(ACCOUNTS.staff.fullName);
    await expect(opsStatus(staff)).toHaveAttribute("data-status", "OPEN");

    // Raise IT Priority (AC-38).
    await staff.getByTestId("field-it-priority").selectOption("URGENT");
    await staff.getByTestId("btn-save-it-priority").click();
    await expect(staff.getByTestId("btn-save-it-priority")).toBeDisabled();
    await expect(staff.getByTestId("field-it-priority")).toHaveValue("URGENT");

    // Start work (AC-39).
    await staff.getByTestId("btn-transition-IN_PROGRESS").click();
    await expect(opsStatus(staff)).toHaveAttribute("data-status", "IN_PROGRESS");

    // A Public Comment and an Internal Note (AC-46). Asserted on the posted
    // items, not on the text, which the composer also holds until it clears.
    await staff.getByTestId("field-comment-body").fill(comment);
    await staff.getByTestId("btn-post-comment").click();
    await expect(staff.locator('[data-testid^="comment-item-"]').filter({ hasText: comment })).toBeVisible();

    await staff.getByTestId("tab-notes").click();
    await staff.getByTestId("field-note-body").fill(note);
    await staff.getByTestId("btn-post-note").click();
    await expect(staff.locator('[data-testid^="note-item-"]').filter({ hasText: note })).toBeVisible();
    await expect(staff.getByTestId("tab-notes")).toHaveText("Internal Notes (1)");

    // The Requester sees the comment and never the note (AC-47).
    const requester = await requesterContext.newPage();
    await signIn(requester, ACCOUNTS.requester.email);
    await requester.goto(`${BASE}/tickets/${ticket.id}`);
    const comments = requester.getByTestId("comments-card");
    await expect(comments.locator('[data-testid^="comment-item-"]').filter({ hasText: comment })).toBeVisible();
    await expect(requester.locator("body")).not.toContainText(note);
    await expect(requester.locator('[data-testid^="note-item-"]')).toHaveCount(0);

    // The Requester indicates "appears resolved"; the status does not change (BR-43).
    await requester.getByTestId("btn-appears-resolved").click();
    await requester.getByTestId("confirm-dialog").getByTestId("btn-confirm").click();
    await expect(requester.getByTestId("resolution-panel").getByTestId("indicator-appears-resolved")).toBeVisible();

    // Staff see the indicator on the queue row: the only test of a non-null
    // value in the queue (tests.md, CMN-09 note), then on Staff Detail (AC-26).
    const row = await queueRow(staff, ticket.ticketNumber);
    await expect(row.getByTestId("indicator-appears-resolved")).toBeVisible();
    await expect(row.getByTestId("badge-status")).toHaveAttribute("data-status", "IN_PROGRESS");

    await staff.goto(`${BASE}/staff/tickets/${ticket.id}`);
    await expect(staff.getByTestId("indicator-appears-resolved")).toBeVisible();

    // Resolve, then Close, each through its confirmation (AC-39, BR-37).
    await staff.getByTestId("btn-transition-RESOLVED").click();
    await staff.getByTestId("confirm-dialog").getByTestId("btn-confirm").click();
    await expect(opsStatus(staff)).toHaveAttribute("data-status", "RESOLVED");

    await staff.getByTestId("btn-transition-CLOSED").click();
    await staff.getByTestId("confirm-dialog").getByTestId("btn-confirm").click();
    await expect(opsStatus(staff)).toHaveAttribute("data-status", "CLOSED");
    await expect(staff.getByTestId("conversation-card")).toContainText("This ticket is closed.");
  } finally {
    await staffContext.close();
    await requesterContext.close();
  }
});

test("E2E-04: a Requester is refused the staff queue and the notes, with no note text", async ({ page }) => {
  const requesterApi = await apiSession(ACCOUNTS.requester.email);
  const ticket = await createTicket(requesterApi, `E2E-04 boundaries ${runId()}`);
  await requesterApi.dispose();

  // A real note on the Requester's own ticket, so a leak would have text to show.
  const note = `Staff-only note ${runId()}`;
  const staffApi = await apiSession(ACCOUNTS.staff.email);
  try {
    expect((await staffApi.send("POST", `/tickets/${ticket.id}/notes`, { body: note })).status).toBe(201);
  } finally {
    await staffApi.dispose();
  }

  await signIn(page, ACCOUNTS.requester.email);
  await page.goto(`${BASE}/staff/queue`);
  await expect(page.getByTestId("state-forbidden")).toBeVisible();
  await expect(page.getByTestId("queue-table")).toHaveCount(0);

  // The page's own session, typed requests (AC-16, AC-04).
  const queue = await page.request.get(`${BASE}/api/v1/staff/tickets`);
  expect(queue.status()).toBe(403);

  const notes = await page.request.get(`${BASE}/api/v1/tickets/${ticket.id}/notes`);
  expect(notes.status()).toBe(403);
  expect(await notes.text()).not.toContain(note);
});

test("E2E-05: the real Download control on Requester Detail and Staff Detail", async ({ browser }) => {
  const requesterApi = await apiSession(ACCOUNTS.requester.email);
  const ticket = await createTicket(requesterApi, `E2E-05 download ${runId()}`);
  await requesterApi.dispose();

  const filename = `e2e-download-${runId()}.png`;
  const requesterContext = await browser.newContext({ acceptDownloads: true });
  const staffContext = await browser.newContext({ acceptDownloads: true });
  try {
    const requester = await requesterContext.newPage();
    await signIn(requester, ACCOUNTS.requester.email);
    await requester.goto(`${BASE}/tickets/${ticket.id}`);
    await requester.setInputFiles('[data-testid="field-attachments"]', {
      name: filename,
      mimeType: "image/png",
      buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
    });
    const requesterRow = requester.locator('[data-testid^="attachment-row-"]').filter({ hasText: filename });
    await expect(requesterRow).toBeVisible();

    // A click on the control the user sees, not a request built from its href (AC-23, D-25).
    const [fromRequester] = await Promise.all([
      requester.waitForEvent("download"),
      requesterRow.getByTestId("btn-download").click(),
    ]);
    expect(fromRequester.suggestedFilename()).toBe(filename);
    expect(await fromRequester.failure()).toBeNull();

    const staff = await staffContext.newPage();
    await signIn(staff, ACCOUNTS.staff.email);
    await staff.goto(`${BASE}/staff/tickets/${ticket.id}`);
    const staffRow = staff.locator('[data-testid^="attachment-row-"]').filter({ hasText: filename });
    await expect(staffRow).toBeVisible();

    const [fromStaff] = await Promise.all([staff.waitForEvent("download"), staffRow.getByTestId("btn-download").click()]);
    expect(fromStaff.suggestedFilename()).toBe(filename);
    expect(await fromStaff.failure()).toBeNull();
  } finally {
    await requesterContext.close();
    await staffContext.close();
  }
});

test("E2E-09: Staff cancel a ticket with a reason, then reopen it with a reason", async ({ page }) => {
  const requesterApi = await apiSession(ACCOUNTS.requester.email);
  const ticket = await createTicket(requesterApi, `E2E-09 cancel and reopen ${runId()}`);
  await requesterApi.dispose();

  await signIn(page, ACCOUNTS.staff.email);
  await page.goto(`${BASE}/staff/tickets/${ticket.id}`);
  await expect(opsStatus(page)).toHaveAttribute("data-status", "NEW");

  await page.getByTestId("btn-transition-CANCELLED").click();
  const cancel = page.getByTestId("confirm-dialog");
  await cancel.getByTestId("field-dialog-reason").fill("Duplicate of another report, cancelled by E2E-09.");
  await cancel.getByTestId("btn-confirm").click();
  await expect(opsStatus(page)).toHaveAttribute("data-status", "CANCELLED");
  await expect(opsStatus(page)).toHaveText("Cancelled");

  await page.getByTestId("btn-transition-REOPENED").click();
  const reopen = page.getByTestId("confirm-dialog");
  await reopen.getByTestId("field-dialog-reason").fill("Not a duplicate after all, reopened by E2E-09.");
  await reopen.getByTestId("btn-confirm").click();
  await expect(opsStatus(page)).toHaveAttribute("data-status", "REOPENED");
  await expect(opsStatus(page)).toHaveText("Reopened");
});
