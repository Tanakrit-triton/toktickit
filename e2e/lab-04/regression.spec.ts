import { expect, test } from "@playwright/test";
import { fillTicketForm } from "../lab-02/helpers.js";
import { deactivate, freshPassword, uniqueEmail } from "../lab-03/helpers.js";
import { ACCOUNTS, BASE, LAB4, apiSession, runId, signIn } from "./lab4.js";

// E2E-09 from docs/lab-04/tests.md section 2.10 (AC-36): one representative
// Lab 2 and Lab 3 flow per role on the Lab 4 product, through the UI.

test.describe.configure({ mode: "serial" });

let ticket = { id: "", ticketNumber: "", summary: "" };

test("E2E-09 Requester: create a ticket, upload, download, and comment", async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage();
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`${BASE}/tickets/new`);
    const summary = `E2E-09 regression ${runId()}`;
    await fillTicketForm(page, summary);
    await page.getByTestId("btn-submit-ticket").click();
    await expect(page.getByTestId("state-created")).toBeVisible();
    const ticketNumber = (await page.locator(".zg-created-number").innerText()).trim();
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{5}$/);

    await page.getByTestId("btn-view-ticket").click();
    await expect(page.getByTestId("ticket-information")).toContainText(ticketNumber);
    const id = page.url().split("/tickets/")[1];

    const filename = `e2e-09-${runId()}.png`;
    await page.setInputFiles('[data-testid="field-attachments"]', {
      name: filename,
      mimeType: "image/png",
      buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
    });
    const row = page.locator('[data-testid^="attachment-row-"]').filter({ hasText: filename });
    await expect(row).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), row.getByTestId("btn-download").click()]);
    expect(download.suggestedFilename()).toBe(filename);
    expect(await download.failure()).toBeNull();

    const comment = `The projector also flickers on the backup laptop ${runId()}`;
    await page.getByTestId("field-comment-body").fill(comment);
    await page.getByTestId("btn-post-comment").click();
    await expect(page.getByTestId("comments-card").locator('[data-testid^="comment-item-"]').filter({ hasText: comment })).toBeVisible();

    ticket = { id, ticketNumber, summary };
  } finally {
    await context.close();
  }
});

test("E2E-09 IT Staff: claim, assign, add an Internal Note, and transition", async ({ page }) => {
  expect(ticket.id, "the Requester step must have created the ticket").not.toBe("");
  await signIn(page, ACCOUNTS.staff.email);
  await page.goto(`${BASE}/staff/queue`);
  await page.getByTestId("field-search").fill(ticket.ticketNumber);
  const row = page.getByTestId(`queue-row-${ticket.ticketNumber}`);
  await expect(row).toBeVisible();
  await row.getByRole("link").first().click();
  const status = page.getByTestId("operations-card").getByTestId("badge-status");
  await expect(status).toHaveAttribute("data-status", "NEW");

  await page.getByTestId("btn-claim").click();
  await expect(page.getByTestId("ticket-owner")).toHaveText(ACCOUNTS.staff.fullName);
  await expect(status).toHaveAttribute("data-status", "OPEN");

  // The claim's follow-up re-fetch resets "Assign to" to "Choose a person"
  // (StaffTicketDetail: each re-fetch shows the server's values again). A
  // choice made before it lands is wiped, so the choice is repeated until the
  // visible state holds: Arisa selected and Assign enabled.
  await expect(async () => {
    await page.getByTestId("field-assignee").selectOption({ label: LAB4.arisa.fullName });
    await expect(page.getByTestId("btn-assign")).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await page.getByTestId("btn-assign").click();
  await expect(page.getByTestId("ticket-owner")).toHaveText(LAB4.arisa.fullName);

  const note = `Same model failed in CB2301 last term ${runId()}`;
  await page.getByTestId("tab-notes").click();
  await page.getByTestId("field-note-body").fill(note);
  await page.getByTestId("btn-post-note").click();
  await expect(page.locator('[data-testid^="note-item-"]').filter({ hasText: note })).toBeVisible();

  await page.getByTestId("btn-transition-IN_PROGRESS").click();
  await expect(status).toHaveAttribute("data-status", "IN_PROGRESS");
});

test("E2E-09 Administrator: create a user, then deactivate it", async ({ page }) => {
  const email = uniqueEmail("regression");
  const fullName = `E2E Regression ${runId()}`;
  try {
    await signIn(page, ACCOUNTS.admin.email);
    await page.goto(`${BASE}/admin/users`);
    await page.getByTestId("btn-create-user").click();
    const dialog = page.getByTestId("user-dialog");
    await dialog.getByTestId("field-full-name").fill(fullName);
    await dialog.getByTestId("field-user-email").fill(email);
    await dialog.getByTestId("field-role").selectOption("REQUESTER");
    await dialog.getByTestId("field-initial-password").fill(freshPassword());
    await dialog.getByTestId("btn-save-user").click();
    await expect(page.getByTestId("callout-success")).toContainText("User saved.");

    await page.getByTestId("field-search").fill(email);
    const row = page.getByTestId(`user-row-${email}`);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Edit ${fullName}` }).click();
    await page.getByTestId("user-dialog").getByTestId("field-active").uncheck();
    await page.getByTestId("user-dialog").getByTestId("btn-save-user").click();
    await expect(page.getByTestId("callout-success")).toContainText("User saved.");
    await expect(row.getByTestId("badge-account-status")).toHaveText(/Inactive/);
  } finally {
    // Leaves no active account behind even if a step failed (L3 tests.md section 1).
    const admin = await apiSession(ACCOUNTS.admin.email);
    try {
      const users = (await admin.get(`/admin/users?q=${encodeURIComponent(email)}`)) as { email: string; isActive: boolean }[];
      if (users.some((u) => u.email === email && u.isActive)) await deactivate(admin, email);
    } finally {
      await admin.dispose();
    }
  }
});
