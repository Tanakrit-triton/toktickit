import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  BASE,
  apiSession,
  openStaffTicket,
  recordAction,
  runId,
  signIn,
  ticketInProgress,
} from "./lab4.js";

// E2E-03 to E2E-05 from docs/lab-04/tests.md section 2.10 (AC-14, AC-15,
// AC-18, AC-21, AC-22, AC-23). E2E-05 reads the history E2E-03 produced, so the
// file runs in order.

test.describe.configure({ mode: "serial" });

const opsStatus = (page: Page) => page.getByTestId("operations-card").getByTestId("badge-status");
const resolve = (page: Page) => page.getByTestId("btn-transition-RESOLVED");

let resolvedTicket = { id: "", ticketNumber: "" };

async function editAction(page: Page, description: string, change: (dialog: ReturnType<Page["getByTestId"]>) => Promise<void>) {
  await page.getByTestId("actions-card").locator('[data-testid^="action-row-"]').filter({ hasText: description })
    .locator('[data-testid^="btn-edit-action-"]').click();
  const dialog = page.getByTestId("action-dialog");
  await change(dialog);
  await dialog.getByTestId("btn-save-action").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("callout-success")).toContainText("Action saved.");
}

test("E2E-03: Resolve stays disabled with its reason until every action is done and every follow-up cleared; then resolve and close", async ({ page }) => {
  const ticket = await ticketInProgress(`E2E-03 resolution gate ${runId()}`);
  const open = "Replace the lamp in the lecture theatre projector";
  const followed = "Cleaned the projector's air filter";
  const staffApi = await apiSession(ACCOUNTS.staff.email);
  try {
    await recordAction(staffApi, ticket.id, { description: open, status: "IN_PROGRESS" });
    await recordAction(staffApi, ticket.id, {
      description: followed,
      status: "COMPLETED",
      result: "Filter cleaned; fan noise is lower.",
      followUpRequired: true,
      followUpNote: "Check the filter again after one week of lectures.",
    });
  } finally {
    await staffApi.dispose();
  }

  await signIn(page, ACCOUNTS.staff.email);
  await openStaffTicket(page, ticket.id);

  // Blocked: disabled, with the reason as text and as its description (AC-22).
  const notice = page.getByTestId("notice-resolution-blocked");
  await expect(resolve(page)).toBeDisabled();
  await expect(notice).toContainText("Can't resolve yet: 1 action(s) open, 1 follow-up(s) outstanding.");
  await expect(resolve(page)).toHaveAccessibleDescription(/Can't resolve yet/);
  await expect(notice.getByRole("link", { name: "Go to Actions Taken" })).toHaveAttribute("href", "#actions");

  // Completing the open action leaves the follow-up: still blocked (AC-14).
  await editAction(page, open, async (dialog) => {
    await dialog.getByTestId("field-action-status").selectOption("COMPLETED");
    await dialog.getByTestId("field-action-result").fill("New lamp fitted; brightness back to normal.");
  });
  await expect(notice).toContainText("Can't resolve yet: 0 action(s) open, 1 follow-up(s) outstanding.");
  await expect(resolve(page)).toBeDisabled();

  // Clearing the follow-up removes the last blocker (AC-15).
  await editAction(page, followed, async (dialog) => {
    await dialog.getByTestId("field-follow-up-required").uncheck();
  });
  await expect(notice).toHaveCount(0);
  await expect(resolve(page)).toBeEnabled();

  await resolve(page).click();
  await page.getByTestId("confirm-dialog").getByTestId("btn-confirm").click();
  await expect(opsStatus(page)).toHaveAttribute("data-status", "RESOLVED");
  await expect(page.getByTestId("resolved-at")).toContainText("Resolved on");

  await page.getByTestId("btn-transition-CLOSED").click();
  await page.getByTestId("confirm-dialog").getByTestId("btn-confirm").click();
  await expect(opsStatus(page)).toHaveAttribute("data-status", "CLOSED");
  // resolvedAt is kept on close (AC-17).
  await expect(page.getByTestId("resolved-at")).toContainText("Resolved on");

  resolvedTicket = ticket;
});

test("E2E-04: a second screen's stale Resolve is refused with Reload, and Reload shows the first screen's change", async ({ browser }) => {
  const ticket = await ticketInProgress(`E2E-04 stale screen ${runId()}`);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const a = await contextA.newPage();
    const b = await contextB.newPage();
    await signIn(a, ACCOUNTS.staff.email);
    await signIn(b, ACCOUNTS.staff.email);
    await openStaffTicket(a, ticket.id);
    await openStaffTicket(b, ticket.id);
    await expect(b.getByTestId("field-it-priority")).toHaveValue("HIGH");

    // A raises IT Priority; B's screen still holds the old version.
    await a.getByTestId("field-it-priority").selectOption("URGENT");
    await a.getByTestId("btn-save-it-priority").click();
    await expect(a.getByTestId("btn-save-it-priority")).toBeDisabled();
    await expect(a.getByTestId("field-it-priority")).toHaveValue("URGENT");

    // B resolves from the stale screen (AC-18, AC-21).
    await resolve(b).click();
    const confirm = b.getByTestId("confirm-dialog");
    await confirm.getByTestId("btn-confirm").click();
    // The message shows in the dialog's text line (ui-spec 5); the user closes
    // the dialog to reach Reload.
    await expect(confirm).toContainText("This ticket was changed by someone else.");
    await confirm.getByTestId("btn-dialog-cancel").click();
    await expect(confirm).toHaveCount(0);
    const conflict = b.getByTestId("callout-conflict");
    await expect(conflict).toContainText("This ticket was changed by someone else.");
    await expect(opsStatus(b)).toHaveAttribute("data-status", "IN_PROGRESS");
    // The screen does not change under the user until Reload (ui-spec 5).
    await expect(b.getByTestId("field-it-priority")).toHaveValue("HIGH");

    await b.getByTestId("btn-reload-ticket").click();
    await expect(b.getByTestId("field-it-priority")).toHaveValue("URGENT");
    await expect(b.getByTestId("callout-conflict")).toHaveCount(0);
    await expect(opsStatus(b)).toHaveAttribute("data-status", "IN_PROGRESS");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("E2E-05: History lists E2E-03 oldest first; the Requester sees no History and no Internal Notes", async ({ browser }) => {
  expect(resolvedTicket.id, "E2E-03 must have produced its ticket").not.toBe("");
  const staffContext = await browser.newContext();
  const requesterContext = await browser.newContext();
  try {
    const staff = await staffContext.newPage();
    await signIn(staff, ACCOUNTS.staff.email);
    await openStaffTicket(staff, resolvedTicket.id);
    await staff.getByTestId("tab-history").click();
    const items = staff.locator('[data-testid^="history-item-"]');
    await expect(items.last()).toContainText("changed status from Resolved to Closed.");
    const lines = await items.allInnerTexts();

    // Oldest first (AC-23): each step appears after the one before it.
    const order = [
      "claimed the ticket.",
      "changed status from Open to In Progress.",
      "recorded an action.",
      "completed an action.",
      "edited an action (follow-up).",
      "changed status from In Progress to Resolved.",
      "changed status from Resolved to Closed.",
    ];
    let previous = -1;
    for (const sentence of order) {
      const at = lines.findIndex((line, i) => i > previous && line.includes(sentence));
      expect(at, `"${sentence}" after entry ${previous}`).toBeGreaterThan(previous);
      previous = at;
    }
    for (const line of lines) expect(line).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} (Wichai Prasert|System) /);

    // The Requester's view of the same ticket (AC-23, AC-11).
    const requester = await requesterContext.newPage();
    await signIn(requester, ACCOUNTS.requester.email);
    await requester.goto(`${BASE}/tickets/${resolvedTicket.id}`);
    await expect(requester.getByTestId("actions-card")).toBeVisible();
    await expect(requester.getByTestId("tab-history")).toHaveCount(0);
    await expect(requester.getByTestId("tab-notes")).toHaveCount(0);
    await expect(requester.locator('[data-testid^="history-item-"]')).toHaveCount(0);
    await expect(requester.locator("body")).not.toContainText("changed status from");
  } finally {
    await staffContext.close();
    await requesterContext.close();
  }
});
