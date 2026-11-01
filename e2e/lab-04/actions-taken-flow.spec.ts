import { expect, test, type Page } from "@playwright/test";
import { deactivate, freshPassword, uniqueEmail } from "../lab-03/helpers.js";
import {
  ACCOUNTS,
  BASE,
  LAB4,
  apiSession,
  guardConsole,
  openStaffTicket,
  runId,
  signIn,
  actionAtNextMinute,
  ticketInProgress,
} from "./lab4.js";

// E2E-01 and E2E-02 from docs/lab-04/tests.md section 2.10 (AC-01, AC-02,
// AC-03, AC-11). Each test files its own ticket through the API, so no test
// depends on a seeded ticket or on an earlier run.

/** The action row on the desktop table, found by its description. */
const actionRow = (page: Page, description: string) =>
  page.getByTestId("actions-card").locator('[data-testid^="action-row-"]').filter({ hasText: description });

async function saveDialog(page: Page) {
  const dialog = page.getByTestId("action-dialog");
  await dialog.getByTestId("btn-save-action").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("callout-success")).toContainText("Action saved.");
}

test("E2E-01: Wichai records an action performed by Arisa, Arisa completes it, Wichai edits its notes, the Requester reads it", async ({ browser }) => {
  const ticket = await ticketInProgress(`E2E-01 projector signal ${runId()}`);
  const description = `Reseat the projector's HDMI input board ${runId()}`;
  const result = "Input board reseated; the signal held for a full 50-minute lecture.";
  const notes = "projector-input-board.jpg";

  const wichaiContext = await browser.newContext();
  const arisaContext = await browser.newContext();
  const requesterContext = await browser.newContext();
  try {
    // Wichai records the action for Arisa (AC-01, AC-02).
    const wichai = await wichaiContext.newPage();
    await signIn(wichai, ACCOUNTS.staff.email);
    await openStaffTicket(wichai, ticket.id);
    await wichai.getByTestId("btn-record-action").click();
    const create = wichai.getByTestId("action-dialog");
    await actionAtNextMinute(wichai);
    await create.getByTestId("field-action-description").fill(description);
    await create.getByTestId("field-action-status").selectOption("IN_PROGRESS");
    await create.getByTestId("field-action-performer").selectOption({ label: LAB4.arisa.fullName });
    await saveDialog(wichai);

    const recorded = actionRow(wichai, description);
    await expect(recorded).toContainText(LAB4.arisa.fullName);
    await expect(recorded).toContainText(`Recorded by ${ACCOUNTS.staff.fullName}`);
    await expect(recorded.getByTestId("badge-action-status")).toHaveAttribute("data-status", "IN_PROGRESS");
    // Recording an action does not change the Ticket Owner (AC-02).
    await expect(wichai.getByTestId("ticket-owner")).toHaveText(ACCOUNTS.staff.fullName);

    // Arisa completes it with a result.
    const arisa = await arisaContext.newPage();
    await signIn(arisa, LAB4.arisa.email);
    await openStaffTicket(arisa, ticket.id);
    await actionRow(arisa, description).locator('[data-testid^="btn-edit-action-"]').click();
    const complete = arisa.getByTestId("action-dialog");
    await complete.getByTestId("field-action-status").selectOption("COMPLETED");
    await complete.getByTestId("field-action-result").fill(result);
    await saveDialog(arisa);
    await expect(actionRow(arisa, description).getByTestId("badge-action-status")).toHaveAttribute("data-status", "COMPLETED");

    // Wichai edits the attachment notes on the completed action (BR-16).
    await openStaffTicket(wichai, ticket.id);
    await actionRow(wichai, description).locator('[data-testid^="btn-edit-action-"]').click();
    const edit = wichai.getByTestId("action-dialog");
    // COMPLETED: status and performer are read-only text, not controls (AC-08).
    await expect(edit.locator('select[data-testid="field-action-status"]')).toHaveCount(0);
    await expect(edit.locator('select[data-testid="field-action-performer"]')).toHaveCount(0);
    await edit.getByTestId("field-attachment-notes").fill(notes);
    await saveDialog(wichai);

    // The Requester sees the same action, read-only (AC-11).
    const requester = await requesterContext.newPage();
    await signIn(requester, ACCOUNTS.requester.email);
    await requester.goto(`${BASE}/tickets/${ticket.id}`);
    const card = requester.getByTestId("actions-card");
    await expect(card.getByRole("heading", { name: "Work done on your ticket" })).toBeVisible();
    const row = card.locator('[data-testid^="action-row-"]').filter({ hasText: description });
    await expect(row).toContainText(LAB4.arisa.fullName);
    await expect(row.getByTestId("badge-action-status")).toHaveText("✓ Completed");
    await row.locator('[data-testid^="btn-action-details-"]').click();
    await expect(card).toContainText(result);
    await expect(card).toContainText(notes);
    await expect(card.getByTestId("btn-record-action")).toHaveCount(0);
    await expect(card.locator('[data-testid^="btn-edit-action-"]')).toHaveCount(0);
  } finally {
    await wichaiContext.close();
    await arisaContext.close();
    await requesterContext.close();
  }
});

test("E2E-02: a performer deactivated while the dialog is open is refused under Performed by, and nothing is saved", async ({ page }) => {
  const ticket = await ticketInProgress(`E2E-02 inactive performer ${runId()}`);
  const email = uniqueEmail("performer");
  const fullName = `E2E Performer ${runId()}`;
  const description = `Collect the projector's error log ${runId()}`;

  const admin = await apiSession(ACCOUNTS.admin.email);
  try {
    const created = await admin.send("POST", "/admin/users", {
      fullName,
      email,
      role: "IT_STAFF",
      isActive: true,
      initialPassword: freshPassword(),
    });
    expect(created.status, "creating the performer").toBe(201);

    const consoleGuard = guardConsole(page);
    await signIn(page, ACCOUNTS.staff.email);
    consoleGuard.signedIn();
    await openStaffTicket(page, ticket.id);
    await page.getByTestId("btn-record-action").click();
    const dialog = page.getByTestId("action-dialog");
    await actionAtNextMinute(page);
    await dialog.getByTestId("field-action-description").fill(description);
    await dialog.getByTestId("field-action-performer").selectOption({ label: fullName });

    // The performer is deactivated after being chosen, before Save (AC-03).
    await deactivate(admin, email);
    consoleGuard.expect({ method: "POST", url: `${BASE}/api/v1/staff/tickets/${ticket.id}/actions`, status: 422 });
    await dialog.getByTestId("btn-save-action").click();

    const performer = dialog.getByTestId("field-action-performer");
    await expect(performer).toHaveAttribute("aria-invalid", "true");
    await expect(performer).toHaveAccessibleDescription("Choose an active IT Staff or Administrator user.");
    await expect(performer).toBeFocused();
    // The input is kept (ui-spec 4.4).
    await expect(dialog.getByTestId("field-action-description")).toHaveValue(description);

    const actions = (await admin.get(`/tickets/${ticket.id}/actions`)) as { description: string }[];
    expect(actions.map((a) => a.description)).not.toContain(description);
    await consoleGuard.check("E2E-02");
  } finally {
    await admin.dispose();
  }
});
