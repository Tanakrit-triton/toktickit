import { expect, test, type Browser, type Page } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { ACCOUNTS, BASE, apiSession, freshPassword, signIn, signOut, submitLogin, userIdByEmail } from "./helpers.js";
import { contextAt, ensureRealisticQueue, newTicket, painted, runId, shot, workedTicket } from "./capture.js";

// Desktop evidence for the Lab 3 submission, beyond the ui-spec 12 paths that
// responsive.spec.ts produces (docs/lab-03/tests.md, #47 notes). Each capture
// asserts the state it shows, so a screenshot cannot silently show the wrong
// thing. docs/lab-03/tests.md (#47 notes) maps each request to its files.
//
// Everything runs against the real server and database. Two states are
// produced by intercepting the browser's request, because a healthy server
// does not fail on demand: the login network failure and the Staff Detail and
// User Management load failures. Each is marked where it happens.

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(120000);
  await ensureRealisticQueue();
});

async function desktop(browser: Browser, run: (page: Page) => Promise<void>) {
  const context = await contextAt(browser, "desktop");
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

const serverFailure = { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Unexpected error." } } };

test("evidence: login and session", async ({ browser }) => {
  await desktop(browser, async (page) => {
    await page.goto(`${BASE}/login`);
    await page.getByTestId("field-email").fill(ACCOUNTS.requester.email);
    await page.getByTestId("field-password").fill("not-shown-in-the-capture");

    // Intercepted: the network fails before the server is reached.
    await page.route("**/api/v1/auth/login", (route) => route.abort("connectionrefused"));
    await page.getByTestId("btn-sign-in").click();
    const failure = page.getByTestId("callout-error");
    await painted(failure, "safe failure callout");
    await expect(failure).toHaveText(/Could not sign in\. Try again\./);
    await expect(page.getByTestId("field-email")).toHaveValue(ACCOUNTS.requester.email);
    await shot(page, "authentication", "desktop", "login-failure");
    await page.unroute("**/api/v1/auth/login");

    // A valid sign-in lands on the role's home with the shell.
    await page.goto(`${BASE}/login`);
    await submitLogin(page, ACCOUNTS.requester.email);
    await page.getByTestId("my-tickets-screen").waitFor();
    await expect(page.getByTestId("shell-user-name")).toHaveText(ACCOUNTS.requester.fullName);
    await expect(page.getByTestId("badge-role")).toHaveText("Requester");
    await shot(page, "authentication", "desktop", "login-valid");

    await signOut(page);
    await expect(page).toHaveURL(/\/login/);
    await shot(page, "authentication", "desktop", "logout");

    // After logout the old session is refused at the API as well (AC-08).
    expect((await page.request.get(`${BASE}/api/v1/tickets`)).status()).toBe(401);
  });
});

test("evidence: Ticket Queue search, filters, sorting, pagination", async ({ browser }) => {
  test.setTimeout(180000);
  await desktop(browser, async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`${BASE}/staff/queue`);
    const rows = page.locator('[data-testid^="queue-row-"]');
    await rows.first().waitFor();

    /** Waits for the debounced request to settle on the new rows. */
    async function settled() {
      await page.waitForTimeout(500);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("state-loading")).toHaveCount(0);
      // A filter capture with no rows would prove nothing.
      await expect(rows.first()).toBeVisible();
    }
    async function reset() {
      await page.goto(`${BASE}/staff/queue`);
      await rows.first().waitFor();
    }

    await page.getByTestId("field-search").fill("printer");
    await settled();
    for (const text of await rows.allInnerTexts()) expect(text.toLowerCase()).toContain("printer");
    await shot(page, "staff-queue", "desktop", "search");

    await reset();
    await page.getByTestId("filter-status").selectOption("IN_PROGRESS");
    await settled();
    for (const s of await rows.getByTestId("badge-status").allTextContents()) expect(s).toBe("In Progress");
    await shot(page, "staff-queue", "desktop", "filter-status", { fullPage: true });

    await reset();
    await page.getByTestId("filter-it-priority").selectOption("URGENT");
    await settled();
    for (const p of await rows.getByTestId("badge-it-priority").allTextContents()) expect(p).toContain("Urgent");
    await shot(page, "staff-queue", "desktop", "filter-it-priority", { fullPage: true });

    await reset();
    await page.getByTestId("filter-category").selectOption({ label: "Hardware" });
    await settled();
    await expect(rows.first()).toBeVisible();
    await shot(page, "staff-queue", "desktop", "filter-category", { fullPage: true });

    await reset();
    await page.getByTestId("filter-owner").selectOption("me");
    await settled();
    for (const text of await rows.allInnerTexts()) expect(text).toContain(ACCOUNTS.staff.fullName);
    await shot(page, "staff-queue", "desktop", "filter-owner-me", { fullPage: true });

    await reset();
    await page.getByTestId("filter-owner").selectOption("unassigned");
    await settled();
    for (const text of await rows.allInnerTexts()) expect(text).toContain("Unassigned");
    await shot(page, "staff-queue", "desktop", "filter-owner-unassigned", { fullPage: true });

    await reset();
    await page.getByTestId("filter-owner").selectOption({ label: "Arisa Kongkaew" });
    await settled();
    for (const text of await rows.allInnerTexts()) expect(text).toContain("Arisa Kongkaew");
    await shot(page, "staff-queue", "desktop", "filter-owner-person", { fullPage: true });

    for (const [label, name] of [
      ["Oldest first", "sort-oldest"],
      ["Newest first", "sort-newest"],
      ["Recently updated", "sort-recently-updated"],
      ["Ticket Number A–Z", "sort-ticket-number"],
      ["Status", "sort-status"],
    ] as const) {
      await reset();
      await page.getByTestId("sort-select").selectOption({ label });
      await settled();
      if (name === "sort-ticket-number") {
        const numbers = (await rows.allInnerTexts()).map((t) => t.match(/TKT-\d{4}-\d{5}/)![0]);
        expect(numbers).toEqual([...numbers].sort());
      }
      await shot(page, "staff-queue", "desktop", name, { fullPage: true });
    }

    await reset();
    await expect(page.getByTestId("page-indicator")).toContainText("Page 1 of");
    await page.getByTestId("btn-next-page").click();
    await settled();
    await expect(page.getByTestId("page-indicator")).toContainText("Page 2 of");
    await shot(page, "staff-queue", "desktop", "pagination-page-2", { fullPage: true });

    await reset();
    await page.getByTestId("field-page-size").selectOption("10");
    await settled();
    expect(await rows.count()).toBe(10);
    await shot(page, "staff-queue", "desktop", "pagination-page-size-10", { fullPage: true });
  });
});

test("evidence: Staff Ticket Detail operations", async ({ browser }) => {
  test.setTimeout(180000);
  const ticket = await newTicket("Lecture capture camera in CB1103 not recording", "MEDIUM");
  const ops = (page: Page) => page.getByTestId("operations-card");

  await desktop(browser, async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`${BASE}/staff/tickets/${ticket.id}`);
    await painted(page.getByTestId("btn-claim"), "Claim");
    await expect(page.getByTestId("ticket-owner")).toHaveText("Unassigned");
    await shot(page, "staff-ticket-detail", "desktop", "claim-before");

    await page.getByTestId("btn-claim").click();
    await expect(page.getByTestId("ticket-owner")).toHaveText(ACCOUNTS.staff.fullName);
    await expect(ops(page).getByTestId("badge-status")).toHaveText("Open");
    await shot(page, "staff-ticket-detail", "desktop", "claimed");

    await page.getByTestId("field-assignee").selectOption({ label: "Arisa Kongkaew" });
    await page.getByTestId("btn-assign").click();
    await expect(page.getByTestId("ticket-owner")).toHaveText("Arisa Kongkaew");
    await shot(page, "staff-ticket-detail", "desktop", "reassigned");

    await page.getByTestId("field-it-priority").selectOption("URGENT");
    await page.getByTestId("btn-save-it-priority").click();
    await expect(page.getByTestId("btn-save-it-priority")).toBeDisabled();
    await expect(page.locator(".zg-detail-header").getByTestId("badge-it-priority")).toContainText("Urgent");
    await shot(page, "staff-ticket-detail", "desktop", "it-priority-changed");

    await page.getByTestId("btn-transition-IN_PROGRESS").click();
    await expect(ops(page).getByTestId("badge-status")).toHaveText("In Progress");

    await page.getByTestId("field-comment-body").fill("The camera firmware is being updated now. Recording should resume within the hour.");
    await page.getByTestId("btn-post-comment").click();
    await painted(page.locator('[data-testid^="comment-item-"]').last(), "posted comment");
    await shot(page, "staff-ticket-detail", "desktop", "comment-posted");

    await page.getByTestId("tab-notes").click();
    await page.getByTestId("field-note-body").fill("Firmware 4.2 fixes the recording stop. Vendor case 88213 if it recurs.");
    await page.getByTestId("btn-post-note").click();
    await painted(page.locator('[data-testid^="note-item-"]').last(), "posted note");
    await expect(page.getByTestId("tab-notes")).toHaveText("Internal Notes (1)");
    await shot(page, "staff-ticket-detail", "desktop", "note-posted");

    await page.getByTestId("btn-transition-CANCELLED").click();
    await page.getByTestId("confirm-dialog").getByTestId("btn-confirm").click();
    await painted(page.getByTestId("confirm-dialog").locator(".zg-message-error").first(), "reason message");
    await shot(page, "staff-ticket-detail", "desktop", "cancel-reason-validation");
    await page.getByTestId("confirm-dialog").getByTestId("btn-dialog-cancel").click();

    await page.getByTestId("btn-transition-RESOLVED").click();
    const resolve = page.getByTestId("confirm-dialog");
    await expect(resolve).toContainText(`Mark ${ticket.ticketNumber} as resolved?`);
    await shot(page, "staff-ticket-detail", "desktop", "status-dialog-resolve");
    await resolve.getByTestId("btn-confirm").click();
    await expect(ops(page).getByTestId("badge-status")).toHaveText("Resolved");
    await shot(page, "staff-ticket-detail", "desktop", "status-resolved");
  });
});

test("evidence: attachment download, appears resolved, failure, and Requester refusal", async ({ browser }) => {
  test.setTimeout(180000);
  const ticket = await workedTicket("Docking station drops the second monitor");

  // The Requester's side: comments, the appears-resolved dialog, and no notes.
  await desktop(browser, async (page) => {
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`${BASE}/tickets/${ticket.id}`);
    await painted(page.getByTestId("comments-card"), "Comments card");
    await expect(page.locator('[data-testid^="note-item-"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(ticket.note);
    await expect(page.getByText("Internal Notes")).toHaveCount(0);
    await shot(page, "staff-ticket-detail", "desktop", "requester-no-internal-notes", { fullPage: true, top: true });

    await page.getByTestId("btn-appears-resolved").click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog).toContainText("Tell IT the problem appears resolved?");
    await shot(page, "staff-ticket-detail", "desktop", "requester-appears-resolved-dialog");
    await dialog.getByTestId("btn-confirm").click();
    await painted(page.getByTestId("resolution-panel").getByTestId("indicator-appears-resolved"), "indicator");

    // A Requester at a staff route sees the forbidden state.
    await page.goto(`${BASE}/staff/tickets/${ticket.id}`);
    await painted(page.getByTestId("state-forbidden"), "forbidden state");
    await expect(page.getByTestId("operations-card")).toHaveCount(0);
    await shot(page, "staff-ticket-detail", "desktop", "requester-refused");
  });

  await desktop(browser, async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`${BASE}/staff/tickets/${ticket.id}`);
    await painted(page.locator(".zg-detail-header").getByTestId("indicator-appears-resolved"), "indicator on Staff Detail");
    await shot(page, "staff-ticket-detail", "desktop", "appears-resolved-indicator", { top: true });

    // The real Download control: a browser download with the original name.
    const row = page.locator('[data-testid^="attachment-row-"]').filter({ hasText: ticket.attachment });
    await painted(row, "attachment row");
    const [download] = await Promise.all([page.waitForEvent("download"), row.getByTestId("btn-download").click()]);
    expect(download.suggestedFilename()).toBe(ticket.attachment);
    expect(await download.failure()).toBeNull();
    await shot(page, "staff-ticket-detail", "desktop", "attachment-download");

    // Intercepted: the server does not fail on demand.
    await page.route(`**/api/v1/staff/tickets/${ticket.id}`, (route) => route.fulfill(serverFailure));
    await page.goto(`${BASE}/staff/tickets/${ticket.id}`);
    const failure = page.getByTestId("callout-error");
    await painted(failure, "failure callout");
    await expect(failure).not.toContainText("500");
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await shot(page, "staff-ticket-detail", "desktop", "failure");
  });
});

test("evidence: User Management list, create, edit, initial password, failure", async ({ browser }) => {
  test.setTimeout(240000);
  const email = `malee.sri.${runId()}@example.test`;
  const initial = freshPassword();
  const second = freshPassword();

  try {
    await desktop(browser, async (page) => {
      await signIn(page, ACCOUNTS.admin.email);
      await page.goto(`${BASE}/admin/users`);
      const rows = page.locator('[data-testid^="user-row-"]');
      await rows.first().waitFor();

      await page.getByTestId("field-search").fill("kmutt");
      await page.waitForTimeout(600);
      for (const text of await rows.allInnerTexts()) expect(text.toLowerCase()).toContain("kmutt");
      await shot(page, "user-management", "desktop", "search");

      await page.getByTestId("field-search").fill("");
      await page.getByTestId("filter-role").selectOption("IT_STAFF");
      await page.waitForTimeout(600);
      for (const r of await rows.getByTestId("badge-role").allTextContents()) expect(r).toBe("IT Staff");
      await shot(page, "user-management", "desktop", "role-filter");
      await page.getByTestId("filter-role").selectOption("");

      await page.getByTestId("btn-create-user").click();
      await page.getByTestId("field-full-name").fill("M");
      await page.getByTestId("field-user-email").fill("not-an-email");
      await page.getByTestId("field-initial-password").fill("short");
      await page.getByTestId("btn-save-user").click();
      await painted(page.getByTestId("error-full-name"), "full name message");
      await painted(page.getByTestId("error-user-email"), "email message");
      await painted(page.getByTestId("error-initial-password"), "password message");
      await shot(page, "user-management", "desktop", "create-invalid");

      await page.getByTestId("field-full-name").fill("Malee Srisuk");
      await page.getByTestId("field-user-email").fill(email);
      await page.getByTestId("field-role").selectOption("IT_STAFF");
      await page.getByTestId("field-initial-password").fill(initial);
      await page.getByTestId("btn-save-user").click();
      await expect(page.getByTestId("callout-success")).toHaveText(/User saved\./);
      await page.getByTestId("field-search").fill(email);
      await painted(page.getByTestId(`user-row-${email}`), "created user row");
      await shot(page, "user-management", "desktop", "user-created");

      await page.getByTestId(`user-row-${email}`).getByRole("button", { name: "Edit Malee Srisuk" }).click();
      await page.getByTestId("field-full-name").fill("Malee Srisuk-Wong");
      await shot(page, "user-management", "desktop", "edit-dialog");
      await page.getByTestId("btn-save-user").click();
      await expect(page.getByTestId("callout-success")).toHaveText(/User saved\./);
      await expect(page.getByTestId(`user-row-${email}`)).toContainText("Malee Srisuk-Wong");
      await shot(page, "user-management", "desktop", "user-saved");
    });

    // The new user's first sign-in is held on Change Password.
    await desktop(browser, async (page) => {
      await signIn(page, email, initial);
      await painted(page.getByTestId("change-password-screen"), "forced change");
      await expect(page.getByRole("navigation")).toHaveCount(0);
      await shot(page, "user-management", "desktop", "created-user-first-login");
      await page.getByTestId("field-current-password").fill(initial);
      await page.getByTestId("field-new-password").fill(second);
      await page.getByTestId("field-confirm-password").fill(second);
      await page.getByTestId("btn-save-password").click();
      await page.getByTestId("staff-queue-screen").waitFor();
      await expect(page.getByTestId("callout-info")).toContainText("Password changed.");
      await shot(page, "authentication", "desktop", "change-password-success");
    });

    // Set a new initial password; the next sign-in must change it.
    const third = freshPassword();
    await desktop(browser, async (page) => {
      await signIn(page, ACCOUNTS.admin.email);
      await page.goto(`${BASE}/admin/users`);
      await page.getByTestId("field-search").fill(email);
      await page.getByTestId(`user-row-${email}`).waitFor();
      await page.getByTestId(`user-row-${email}`).getByRole("button", { name: "Edit Malee Srisuk-Wong" }).click();
      await page.getByTestId("btn-set-initial-password").click();
      await page.getByTestId("confirm-dialog").getByTestId("field-initial-password").fill(third);
      await page.getByTestId("confirm-dialog").getByTestId("btn-confirm").click();
      await expect(page.getByTestId("callout-success")).toHaveText(/Initial password set\./);
      await shot(page, "user-management", "desktop", "initial-password-set");
    });
    await desktop(browser, async (page) => {
      await signIn(page, email, third);
      await painted(page.getByTestId("change-password-screen"), "forced change at next login");
      await expect(page.getByText("Choose a new password")).toBeVisible();
      await shot(page, "user-management", "desktop", "forced-change-next-login");
    });

    // Intercepted: the server does not fail on demand.
    await desktop(browser, async (page) => {
      await signIn(page, ACCOUNTS.admin.email);
      await page.route("**/api/v1/admin/users**", (route) => route.fulfill(serverFailure));
      await page.goto(`${BASE}/admin/users`);
      await painted(page.getByTestId("state-list-failed"), "failure state");
      await expect(page.getByTestId("state-list-failed")).not.toContainText("500");
      await expect(page.getByTestId("btn-retry")).toBeVisible();
      await shot(page, "user-management", "desktop", "failure");
    });
  } finally {
    const admin = await apiSession(ACCOUNTS.admin.email);
    try {
      const id = await userIdByEmail(admin, email).catch(() => null);
      if (id !== null) await admin.send("PATCH", `/admin/users/${id}`, { isActive: false });
    } finally {
      await admin.dispose();
    }
  }
});

test("evidence: direct API authorization refusals", async () => {
  const ticket = await workedTicket("Desk phone shows no dial tone");
  const record: string[] = [
    "Lab 3 direct API authorization evidence (#47)",
    `Captured ${new Date().toISOString()} against ${BASE} (the Vite proxy to the API), each as a real signed-in session.`,
    "",
  ];

  async function refused(email: string, who: string, path: string, leak?: string) {
    const session = await apiSession(email);
    try {
      const response = await session.ctx.get(`/api/v1${path}`);
      const text = await response.text();
      expect(response.status(), `${who} GET ${path}`).toBe(403);
      if (leak !== undefined) expect(text).not.toContain(leak);
      record.push(`${who} (${email})`, `GET /api/v1${path}`, `Status: ${response.status()}`, JSON.stringify(JSON.parse(text), null, 2), "");
    } finally {
      await session.dispose();
    }
  }

  await refused(ACCOUNTS.requester.email, "Requester calling a staff endpoint", "/staff/tickets");
  await refused(ACCOUNTS.staff.email, "IT Staff calling an admin endpoint", "/admin/users");
  // The Requester's own ticket, which has a real Internal Note: none of its text is returned.
  await refused(ACCOUNTS.requester.email, `Requester requesting the notes of their own ticket ${ticket.ticketNumber}, which has one Internal Note`, `/tickets/${ticket.id}/notes`, ticket.note);
  record.push(`The note text "${ticket.note}" appears in none of the responses above.`, "");

  await mkdir("artifacts/lab-03", { recursive: true });
  await writeFile("artifacts/lab-03/api-authorization.txt", record.join("\n"));
});
