import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ACCOUNTS, BASE, apiSession, seedPassword, signIn, signOut, submitLogin, userIdByEmail } from "./helpers.js";
import {
  OUT,
  VIEWPORTS,
  contextAt,
  expectCaptured,
  expectSoundLayout,
  newTicket,
  ensureRealisticQueue,
  painted,
  shot,
  shotBusy,
  workedTicket,
  type Viewport,
} from "./capture.js";

// RSP-01 to RSP-06 from docs/lab-03/tests.md section 2.12, and every
// screenshot path in docs/lab-03/ui-spec.md section 12.
//
// The file runs in the desktop project only (playwright.config.ts) and opens
// its own browser context at each of the three widths, so the per-width
// captures and the final RSP-06 check run in one ordered pass and nothing is
// reported as skipped.
//
// The data is real: tickets, comments, notes, and attachments are created
// through the API as the seeded users, and every screen is driven against the
// running server. Three states cannot be produced by a healthy server with
// seeded data, and are produced by intercepting the browser's request instead:
// the empty queue and the queue failure (the queue is never empty once seeded,
// and the server does not fail on demand), and the login busy state (the
// response is held so the busy frame can be captured; the real response then
// completes the sign-in).

test.describe.configure({ mode: "serial" });

const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as Viewport[];

let worked: Awaited<ReturnType<typeof workedTicket>>;

test.beforeAll(async () => {
  test.setTimeout(120000);
  await ensureRealisticQueue();
  worked = await workedTicket();
});

/** Opens the queue and waits for its rows or cards. */
async function openQueue(page: Page) {
  await page.goto(`${BASE}/staff/queue`);
  await page.locator('[data-testid^="queue-row-"], [data-testid^="queue-card-"]').first().waitFor({ timeout: 20000 });
}

async function openStaffDetail(page: Page, id: string) {
  await page.goto(`${BASE}/staff/tickets/${id}`);
  await page.getByTestId("operations-card").waitFor({ timeout: 20000 });
  await page.locator('[data-testid^="comment-item-"], .zg-helper').first().waitFor();
}

async function openUsers(page: Page) {
  await page.goto(`${BASE}/admin/users`);
  await page.locator('[data-testid^="user-row-"], [data-testid^="user-card-"]').first().waitFor({ timeout: 20000 });
}

async function inContext(browser: Browser, viewport: Viewport, run: (page: Page) => Promise<void>) {
  const context = await contextAt(browser, viewport);
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// RSP-01 to RSP-03: the six Lab 3 screens at each width.

for (const [index, viewport] of VIEWPORT_NAMES.entries()) {
  test(`RSP-0${index + 1} (AC-64): ${viewport} ${VIEWPORTS[viewport].width}x${VIEWPORTS[viewport].height} - six screens without scroll, clipping, or overlap`, async ({ browser }) => {
    test.setTimeout(180000);

    await inContext(browser, viewport, async (page) => {
      await page.goto(`${BASE}/login`);
      await painted(page.getByTestId("btn-sign-in"), "Sign in");
      await expectSoundLayout(page, "Login");
      await shot(page, "authentication", viewport, "login");
    });

    // The must-change fixture is held on the forced screen. Nothing is
    // submitted, so the fixture keeps its seeded state.
    await inContext(browser, viewport, async (page) => {
      await signIn(page, ACCOUNTS.mustChange.email);
      await painted(page.getByTestId("change-password-screen"), "forced Change Password");
      await expect(page.getByRole("navigation")).toHaveCount(0);
      await expectSoundLayout(page, "Change Password (forced)");
      await shot(page, "authentication", viewport, "change-password-forced");
    });

    await inContext(browser, viewport, async (page) => {
      await signIn(page, ACCOUNTS.staff.email);
      await openQueue(page);
      if (viewport === "tablet") {
        // ui-spec 6.4: the same table without the Requester column.
        await expect(page.getByTestId("queue-table")).toBeVisible();
        await expect(page.getByTestId("queue-table").getByRole("columnheader", { name: "Requester" })).toHaveCount(0);
        await expect(page.getByTestId("queue-table").getByRole("columnheader", { name: "Owner" })).toBeVisible();
      }
      if (viewport === "desktop") {
        await expect(page.getByTestId("queue-table").getByRole("columnheader")).toHaveCount(7);
      }
      await expectSoundLayout(page, "Ticket Queue");
      await shot(page, "staff-queue", viewport, "populated", { fullPage: true });

      await openStaffDetail(page, worked.id);
      await expectSoundLayout(page, "Staff Ticket Detail");
      await shot(page, "staff-ticket-detail", viewport, "view", { fullPage: true });
    });

    await inContext(browser, viewport, async (page) => {
      await signIn(page, ACCOUNTS.requester.email);
      await page.goto(`${BASE}/tickets/${worked.id}`);
      await painted(page.getByTestId("comments-card"), "Comments card");
      await expect(page.getByTestId("comments-card").locator('[data-testid^="comment-item-"]')).toHaveCount(2);
      await expect(page.locator("body")).not.toContainText(worked.note);
      await expectSoundLayout(page, "Requester Ticket Detail");
      await shot(page, "staff-ticket-detail", viewport, "requester-detail-comments", { fullPage: true, top: true });
    });

    await inContext(browser, viewport, async (page) => {
      await signIn(page, ACCOUNTS.admin.email);
      await openUsers(page);
      await expectSoundLayout(page, "User Management");
      await shot(page, "user-management", viewport, "list", { fullPage: true });
    });
  });
}

// ---------------------------------------------------------------------------
// RSP-04: cards, not tables, below 768px.

test("RSP-04 (AC-64): the Queue and User Management render cards below 768px and tables above", async ({ browser }) => {
  for (const viewport of VIEWPORT_NAMES) {
    await inContext(browser, viewport, async (page) => {
      await signIn(page, ACCOUNTS.admin.email);
      await openQueue(page);
      const cards = viewport === "mobile";
      // A claim about the DOM, not the styling: a table hidden by CSS is still a table.
      expect(await page.locator("table").count(), `${viewport} queue tables`).toBe(cards ? 0 : 1);
      expect(await page.locator('[data-testid^="queue-card-"]').count() > 0, `${viewport} queue cards`).toBe(cards);

      await openUsers(page);
      expect(await page.locator("table").count(), `${viewport} user tables`).toBe(cards ? 0 : 1);
      expect(await page.locator('[data-testid^="user-card-"]').count() > 0, `${viewport} user cards`).toBe(cards);
    });
  }
});

test("RSP-03 (AC-64): at mobile the attachment filename does not overlap the file size", async ({ browser }) => {
  await inContext(browser, "mobile", async (page) => {
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`${BASE}/tickets/${worked.id}`);
    const row = page.locator('[data-testid^="attachment-row-"]').first();
    await painted(row, "attachment row");
    const [name, size] = await row.evaluate((el) => {
      // The filename is measured by its text, which paints outside a box shrunk by min-width: 0.
      const range = document.createRange();
      range.selectNodeContents(el.querySelector(".zg-attachment-name")!);
      const box = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      return [box(range.getBoundingClientRect()), box(el.querySelector(".zg-attachment-name + .zg-helper")!.getBoundingClientRect())];
    });
    const intersects = name.left < size.right && size.left < name.right && name.top < size.bottom && size.top < name.bottom;
    expect(intersects, `filename ${JSON.stringify(name)} / size ${JSON.stringify(size)}`).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RSP-05: dialogs fit the viewport with stacked actions; 44x44 touch targets.

/**
 * Every visible interactive element is at least 44x44px. While a modal dialog
 * is open only the dialog is measured: the page behind it cannot be touched.
 */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const dialogs = document.querySelectorAll("[role='dialog']");
    const root: ParentNode = dialogs.length > 0 ? dialogs[dialogs.length - 1] : document;
    return Array.from(root.querySelectorAll("button, a, input, select, textarea, [role='tab']"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== "hidden";
      })
      .map((el) => {
        // A checkbox inside its label is operated through the label.
        const target = el.matches("input[type='checkbox']") && el.closest("label") ? el.closest("label")! : el;
        const r = target.getBoundingClientRect();
        return { el, w: r.width, h: r.height };
      })
      // Sub-pixel layout: 43.99px is a 44px box.
      .filter(({ w, h }) => w < 43.99 || h < 43.99)
      .map(({ el, w, h }) => `${el.getAttribute("data-testid") ?? el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${w.toFixed(1)}x${h.toFixed(1)}`);
  });
}

/** The dialog is wholly inside the viewport and, at mobile, its actions are stacked. */
async function expectDialogFits(page: Page, dialogTestId: string, viewport: Viewport) {
  const dialog = page.getByTestId(dialogTestId);
  await painted(dialog, dialogTestId);
  const box = (await dialog.boundingBox())!;
  const { width, height } = VIEWPORTS[viewport];
  expect(box.x, `${dialogTestId} left edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${dialogTestId} right edge`).toBeLessThanOrEqual(width);
  expect(box.y, `${dialogTestId} top edge`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${dialogTestId} bottom edge`).toBeLessThanOrEqual(height);

  const actions = dialog.locator("button.zg-btn");
  const count = await actions.count();
  expect(count, `${dialogTestId} actions`).toBeGreaterThanOrEqual(2);
  const boxes = await Promise.all(Array.from({ length: count }, (_, i) => actions.nth(i).boundingBox()));
  const lastTwo = boxes.slice(-2).map((b) => b!);
  if (viewport === "mobile") {
    // Stacked: one above the other, each the dialog's full inner width (ui-spec 9).
    expect(Math.abs(lastTwo[0].y - lastTwo[1].y), `${dialogTestId} actions should be stacked`).toBeGreaterThan(30);
    expect(Math.abs(lastTwo[0].width - lastTwo[1].width), `${dialogTestId} actions full width`).toBeLessThanOrEqual(2);
  } else {
    expect(box.width, `${dialogTestId} width (ui-spec 9: 560px)`).toBeLessThanOrEqual(561);
  }
}

test("RSP-05 (AC-64): dialogs fit the viewport with stacked actions, and touch targets are 44x44 on mobile", async ({ browser }) => {
  test.setTimeout(180000);
  const fresh = await newTicket("Conference room display flickers during calls");

  for (const viewport of VIEWPORT_NAMES) {
    await inContext(browser, viewport, async (page) => {
      await signIn(page, ACCOUNTS.staff.email);
      await openStaffDetail(page, fresh.id);
      await page.getByTestId("btn-transition-CANCELLED").click();
      await expectDialogFits(page, "confirm-dialog", viewport);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    });

    await inContext(browser, viewport, async (page) => {
      await signIn(page, ACCOUNTS.admin.email);
      await openUsers(page);
      await page.getByTestId("btn-create-user").click();
      await expectDialogFits(page, "user-dialog", viewport);

      // The Active checkbox keeps its gap from its text (.zg-checkbox, --zg-space-2).
      const gap = await page.getByTestId("field-active").evaluate((box) => {
        const text = Array.from(box.parentElement!.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "")!;
        const range = document.createRange();
        range.selectNodeContents(text);
        return range.getBoundingClientRect().left - box.getBoundingClientRect().right;
      });
      expect(gap, `${viewport}: space between the Active checkbox and its text`).toBeGreaterThanOrEqual(7.5);
    });
  }

  // Touch targets at mobile, on every Lab 3 screen and the open shell menu.
  await inContext(browser, "mobile", async (page) => {
    await page.goto(`${BASE}/login`);
    await page.getByTestId("login-screen").waitFor();
    expect.soft(await smallTargets(page), "Login").toEqual([]);

    await signIn(page, ACCOUNTS.staff.email);
    await openQueue(page);
    expect.soft(await smallTargets(page), "Ticket Queue").toEqual([]);
    await page.getByTestId("btn-nav-toggle").click();
    await page.getByTestId("btn-logout").waitFor();
    expect.soft(await smallTargets(page), "open shell menu").toEqual([]);

    await openStaffDetail(page, worked.id);
    expect.soft(await smallTargets(page), "Staff Ticket Detail").toEqual([]);
    await page.getByTestId("tab-notes").click();
    expect.soft(await smallTargets(page), "Staff Ticket Detail notes tab").toEqual([]);
    await page.getByTestId("btn-transition-CANCELLED").click();
    await page.getByTestId("confirm-dialog").waitFor();
    expect.soft(await smallTargets(page), "Cancel ticket dialog").toEqual([]);
    await page.keyboard.press("Escape");
    // Below 768px Log out sits in the collapsed panel.
    await page.getByTestId("btn-nav-toggle").click();
    await signOut(page);

    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`${BASE}/tickets/${worked.id}`);
    await page.getByTestId("comments-card").waitFor();
    expect.soft(await smallTargets(page), "Requester Ticket Detail").toEqual([]);
  });

  await inContext(browser, "mobile", async (page) => {
    await signIn(page, ACCOUNTS.admin.email);
    await openUsers(page);
    expect.soft(await smallTargets(page), "User Management").toEqual([]);
    await page.getByTestId("btn-create-user").click();
    await page.getByTestId("user-dialog").waitFor();
    expect.soft(await smallTargets(page), "user dialog").toEqual([]);
  });

  await inContext(browser, "mobile", async (page) => {
    await signIn(page, ACCOUNTS.mustChange.email);
    await page.getByTestId("change-password-screen").waitFor();
    expect.soft(await smallTargets(page), "Change Password").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The remaining ui-spec 12 paths: desktop states and the mobile menu.

test("ui-spec 12 authentication states", async ({ browser }) => {
  test.setTimeout(180000);

  await inContext(browser, "desktop", async (page) => {
    await page.goto(`${BASE}/login`);
    await page.getByTestId("btn-sign-in").click();
    await painted(page.getByTestId("error-email"), "email message");
    await painted(page.getByTestId("error-password"), "password message");
    await shot(page, "authentication", "desktop", "login-validation");

    // Busy: the real response is held until the frame is captured.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/v1/auth/login", async (route) => {
      await held;
      await route.continue();
    });
    await submitLogin(page, ACCOUNTS.requester.email, "wrong-password-for-busy-capture");
    await expect(page.getByTestId("btn-sign-in")).toHaveText("Signing in…");
    await expect(page.getByTestId("btn-sign-in")).toBeDisabled();
    await expect(page.getByTestId("field-email")).toBeDisabled();
    await shotBusy(page, "authentication", "desktop", "login-busy");
    release();

    // That held request was a real wrong password: the invalid-credentials state.
    await painted(page.getByTestId("callout-error"), "invalid credentials callout");
    await page.unroute("**/api/v1/auth/login");
    await expect(page.getByTestId("callout-error")).toHaveText(/The email or password is incorrect\./);
    await expect(page.getByTestId("field-password")).toHaveValue("");
    await expect(page.getByTestId("field-password")).toBeFocused();
    await shot(page, "authentication", "desktop", "login-invalid");

    await page.getByTestId("field-email").fill(ACCOUNTS.inactiveRequester.email);
    await page.getByTestId("field-password").fill(seedPassword());
    await page.getByTestId("btn-sign-in").click();
    await expect(page.getByTestId("callout-error")).toHaveText(/This account is inactive\. Contact your administrator\./);
    await shot(page, "authentication", "desktop", "login-inactive");
  });

  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.mustChange.email);
    await page.getByTestId("field-current-password").fill(seedPassword());
    await page.getByTestId("field-new-password").fill("too-short");
    await page.getByTestId("field-confirm-password").fill("does-not-match");
    await page.getByTestId("btn-save-password").click();
    await painted(page.getByTestId("error-new-password"), "new password message");
    await painted(page.getByTestId("error-confirm-password"), "confirm message");
    await shot(page, "authentication", "desktop", "change-password-validation");
  });

  for (const [email, name, landing] of [
    [ACCOUNTS.requester.email, "requester", "my-tickets-screen"],
    [ACCOUNTS.staff.email, "it-staff", "staff-queue-screen"],
    [ACCOUNTS.admin.email, "administrator", "staff-queue-screen"],
  ] as const) {
    await inContext(browser, "desktop", async (page) => {
      await signIn(page, email);
      await page.getByTestId(landing).waitFor();
      await painted(page.getByTestId("shell-user-name"), "user name");
      await painted(page.getByTestId("badge-role"), "role badge");
      await shot(page, "authentication", "desktop", `shell-${name}`);
    });
  }

  await inContext(browser, "mobile", async (page) => {
    await signIn(page, ACCOUNTS.admin.email);
    await page.getByTestId("staff-queue-screen").waitFor();
    await page.getByTestId("btn-nav-toggle").click();
    await expect(page.getByTestId("btn-nav-toggle")).toHaveAttribute("aria-expanded", "true");
    await painted(page.getByTestId("btn-logout"), "Log out in the open panel");
    await painted(page.getByTestId("nav-user-management"), "User Management link");
    await shot(page, "authentication", "mobile", "shell-menu-open");
  });

  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`${BASE}/staff/queue`);
    await painted(page.getByTestId("state-forbidden"), "forbidden state");
    await expect(page.getByTestId("queue-table")).toHaveCount(0);
    await shot(page, "authentication", "desktop", "forbidden");

    await page.goto(`${BASE}/tickets`);
    await page.getByTestId("my-tickets-screen").waitFor();
    await signOut(page);
    await page.goto(`${BASE}/tickets`);
    await painted(page.getByTestId("login-screen"), "login after direct access");
    await expect(page).toHaveURL(/\/login\?next=%2Ftickets/);
    await shot(page, "authentication", "desktop", "logout-direct-access");
  });
});

test("ui-spec 12 queue states", async ({ browser }) => {
  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await openQueue(page);

    await page.getByTestId("filter-status").selectOption("NEW");
    await page.getByTestId("filter-owner").selectOption("unassigned");
    await expect(page.getByTestId("btn-clear-filters")).toBeVisible();
    await expect(page.locator('[data-testid^="queue-row-"]').first()).toBeVisible();
    for (const status of await page.locator('[data-testid^="queue-row-"] [data-testid="badge-status"]').allTextContents()) {
      expect(status).toBe("New");
    }
    await shot(page, "staff-queue", "desktop", "filtered", { fullPage: true });

    await page.getByTestId("btn-clear-filters").click();
    await page.getByTestId("field-search").fill("no ticket has this text zq");
    await painted(page.getByTestId("state-no-results"), "no-results state");
    await expect(page.getByTestId("state-empty")).toHaveCount(0);
    await shot(page, "staff-queue", "desktop", "no-results");
  });

  // Intercepted: a seeded queue is never empty (see the file header).
  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await page.route("**/api/v1/staff/tickets?**", (route) =>
      route.fulfill({ json: { data: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } } }),
    );
    await page.route("**/api/v1/staff/tickets", (route) =>
      route.fulfill({ json: { data: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } } }),
    );
    await page.goto(`${BASE}/staff/queue`);
    await painted(page.getByTestId("state-empty"), "empty state");
    await expect(page.getByTestId("state-empty")).toHaveText("There are no tickets yet.");
    await expect(page.getByTestId("state-no-results")).toHaveCount(0);
    await shot(page, "staff-queue", "desktop", "empty");
  });

  // Intercepted: the server does not fail on demand.
  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    const fail = (route: import("@playwright/test").Route) =>
      route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Unexpected error." } } });
    await page.route("**/api/v1/staff/tickets?**", fail);
    await page.route("**/api/v1/staff/tickets", fail);
    await page.goto(`${BASE}/staff/queue`);
    await painted(page.getByTestId("state-list-failed"), "failure state");
    await expect(page.getByTestId("btn-retry")).toBeVisible();
    await expect(page.getByTestId("state-list-failed")).not.toContainText("500");
    await expect(page.getByTestId("state-list-failed")).not.toContainText("INTERNAL_ERROR");
    await expect(page.getByTestId("field-search")).toBeEnabled();
    await shot(page, "staff-queue", "desktop", "failure");
  });
});

test("ui-spec 12 staff and requester detail states", async ({ browser }) => {
  test.setTimeout(180000);

  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await openStaffDetail(page, worked.id);

    await page.getByTestId("tab-notes").click();
    await painted(page.locator('[data-testid^="note-item-"]').first(), "note item");
    await expect(page.getByTestId("field-note-body")).toBeVisible();
    await expect(page.getByTestId("field-comment-body")).toHaveCount(0);
    await shot(page, "staff-ticket-detail", "desktop", "notes-tab", { fullPage: true });

    await page.getByTestId("tab-comments").click();
    await page.getByTestId("field-comment-body").fill("   ");
    await page.getByTestId("btn-post-comment").click();
    const message = page.getByText("Write something before posting.");
    await painted(message, "comment validation message");
    await shot(page, "staff-ticket-detail", "desktop", "comment-validation");
  });

  // Cancel dialog, opened and dismissed: nothing is sent.
  const cancellable = await newTicket("Monitor in room CB2204 has a dead pixel line");
  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await openStaffDetail(page, cancellable.id);
    await page.getByTestId("btn-transition-CANCELLED").click();
    const dialog = page.getByTestId("confirm-dialog");
    await painted(dialog, "cancel dialog");
    await expect(dialog).toContainText(`Cancel ${cancellable.ticketNumber}?`);
    await expect(dialog.getByTestId("btn-dialog-cancel")).toHaveText("Keep ticket");
    await shot(page, "staff-ticket-detail", "desktop", "cancel-dialog");
    await dialog.getByTestId("btn-dialog-cancel").click();
  });

  // A real 409: the page shows the ticket unassigned, another member of staff
  // claims it through the API, then the page's Claim reaches the server.
  const contested = await newTicket("Wi-Fi access point in the canteen keeps rebooting", "HIGH");
  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await openStaffDetail(page, contested.id);
    await expect(page.getByTestId("btn-claim")).toBeVisible();

    const other = await apiSession("arisa.kon@kmutt.ac.th");
    try {
      expect((await other.send("POST", `/staff/tickets/${contested.id}/claim`)).status).toBe(200);
    } finally {
      await other.dispose();
    }

    await page.getByTestId("btn-claim").click();
    const conflict = page.getByTestId("callout-conflict");
    await painted(conflict, "conflict callout");
    await expect(conflict).toContainText("The ticket has been reloaded.");
    await expect(conflict).not.toContainText("409");
    await expect(page.getByTestId("ticket-owner")).toHaveText("Arisa Kongkaew");
    await shot(page, "staff-ticket-detail", "desktop", "conflict", { top: true });
  });

  // A CLOSED ticket, worked to the end through the API.
  const done = await workedTicket("Outlook calendar invites arrive one hour late");
  const staff = await apiSession(ACCOUNTS.staff.email);
  try {
    for (const status of ["RESOLVED", "CLOSED"]) {
      expect((await staff.send("POST", `/staff/tickets/${done.id}/status`, { status })).status, status).toBe(200);
    }
  } finally {
    await staff.dispose();
  }
  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await openStaffDetail(page, done.id);
    await expect(page.getByTestId("operations-card").getByTestId("badge-status")).toHaveText("Closed");
    await painted(page.getByText("This ticket is closed. Reopen it to add comments or notes."), "closed text");
    await shot(page, "staff-ticket-detail", "desktop", "closed", { fullPage: true });
  });

  // The Requester indicates the problem appears resolved, on a ticket of their own.
  const mine = await workedTicket("Keyboard shortcut for screen lock stopped working");
  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.requester.email);
    await page.goto(`${BASE}/tickets/${mine.id}`);
    await page.getByTestId("btn-appears-resolved").click();
    await page.getByTestId("confirm-dialog").getByTestId("btn-confirm").click();
    const indicator = page.getByTestId("resolution-panel").getByTestId("indicator-appears-resolved");
    await painted(indicator, "appears-resolved indicator");
    await expect(page.getByTestId("btn-appears-resolved")).toHaveCount(0);
    await shot(page, "staff-ticket-detail", "desktop", "requester-appears-resolved");
  });
});

test("ui-spec 12 user management states", async ({ browser }) => {
  test.setTimeout(180000);

  // E2E-08 step (a): the seeded Administrator must be the only active one for
  // LAST_ADMINISTRATOR to arise (tests.md section 1).
  const admin = await apiSession(ACCOUNTS.admin.email);
  try {
    const admins = (await admin.get("/admin/users?role=ADMINISTRATOR")) as { id: string; email: string; isActive: boolean }[];
    for (const other of admins.filter((a) => a.isActive && a.email !== ACCOUNTS.admin.email)) {
      expect((await admin.send("PATCH", `/admin/users/${other.id}`, { isActive: false })).status).toBe(200);
    }
  } finally {
    await admin.dispose();
  }

  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.admin.email);
    await openUsers(page);

    await page.getByTestId("btn-create-user").click();
    const dialog = page.getByTestId("user-dialog");
    await painted(dialog, "create dialog");
    await expect(page.getByTestId("field-active")).toBeChecked();
    await shot(page, "user-management", "desktop", "create-dialog");

    await page.getByTestId("field-full-name").fill("Malee Srisuk");
    await page.getByTestId("field-user-email").fill(ACCOUNTS.requester.email);
    await page.getByTestId("field-role").selectOption("IT_STAFF");
    await page.getByTestId("field-initial-password").fill("Temporary-pass-2026");
    await page.getByTestId("btn-save-user").click();
    await painted(page.getByTestId("error-user-email"), "duplicate email message");
    await shot(page, "user-management", "desktop", "duplicate-email");
    await page.getByTestId("btn-dialog-cancel").click();

    // The own row: Role and Active are disabled with the explanation.
    await page.getByRole("button", { name: `Edit ${ACCOUNTS.admin.fullName}` }).first().click();
    await painted(page.getByTestId("user-dialog"), "own edit dialog");
    await expect(page.getByTestId("field-role")).toBeDisabled();
    await expect(page.getByTestId("field-active")).toBeDisabled();
    await expect(page.getByTestId("user-dialog")).toContainText("You cannot change your own role or deactivate your own account.");
    await shot(page, "user-management", "desktop", "edit-dialog-self");

    // LAST_ADMINISTRATOR. The UI cannot send a self-deactivation (its fields
    // are disabled, the E2E-08 deviation), so the request the dialog sends is
    // rewritten in flight to { isActive: false } and goes to the real server.
    // The 409 and its message are the server's own.
    await page.route("**/api/v1/admin/users/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.continue({ postData: JSON.stringify({ isActive: false }) });
    });
    await page.getByTestId("field-full-name").fill("Sasithorn Pholchai-Admin");
    await page.getByTestId("btn-save-user").click();
    const last = page.getByTestId("user-dialog").getByTestId("callout-conflict");
    await painted(last, "last-administrator callout");
    await expect(last).toContainText("At least one active Administrator must remain.");
    await shot(page, "user-management", "desktop", "last-administrator");
    await page.unroute("**/api/v1/admin/users/*");
    await page.getByTestId("btn-dialog-cancel").click();

    // USER_HAS_OPEN_TICKETS, for real: Wichai owns open tickets.
    await page.getByRole("button", { name: `Edit ${ACCOUNTS.staff.fullName}` }).first().click();
    await page.getByTestId("field-active").uncheck();
    await page.getByTestId("btn-save-user").click();
    const open = page.getByTestId("user-dialog").getByTestId("callout-conflict");
    await painted(open, "open tickets callout");
    await expect(open).toContainText(/owns \d+ open tickets\. Reassign them first\./);
    await expect(page.getByTestId("field-active")).not.toBeChecked();
    await shot(page, "user-management", "desktop", "open-tickets-conflict");
    await page.getByTestId("btn-dialog-cancel").click();

    // The initial-password confirmation, opened and dismissed.
    await page.getByRole("button", { name: "Edit Napat Chaiwong" }).first().click();
    await page.getByTestId("btn-set-initial-password").click();
    const confirm = page.getByTestId("confirm-dialog");
    await painted(confirm, "initial password dialog");
    await expect(confirm).toContainText("Set a new initial password for Napat Chaiwong?");
    await shot(page, "user-management", "desktop", "initial-password-dialog");
    await confirm.getByTestId("btn-dialog-cancel").click();
  });

  // Nothing above changed Wichai or Napat.
  const check = await apiSession(ACCOUNTS.admin.email);
  try {
    const wichai = (await check.get(`/admin/users?q=${ACCOUNTS.staff.email}`)) as { isActive: boolean }[];
    expect(wichai[0].isActive).toBe(true);
    expect(await userIdByEmail(check, ACCOUNTS.admin.email)).toBeTruthy();
  } finally {
    await check.dispose();
  }

  await inContext(browser, "desktop", async (page) => {
    await signIn(page, ACCOUNTS.staff.email);
    await page.goto(`${BASE}/admin/users`);
    await painted(page.getByTestId("state-forbidden"), "forbidden state");
    await expect(page.getByTestId("users-table")).toHaveCount(0);
    await shot(page, "user-management", "desktop", "it-staff-forbidden");
  });
});

// ---------------------------------------------------------------------------
// RSP-06: every path in ui-spec 12 was produced by this run.

/** The paths ui-spec 12 lists, read from the specification itself. */
function specifiedPaths(): string[] {
  const spec = readFileSync("docs/lab-03/ui-spec.md", "utf8");
  const block = spec.split("## 12. Screenshot paths")[1].split("```")[1];
  const paths: string[] = [];
  let folder = "";
  for (const line of block.split("\n")) {
    const dir = /([a-z-]+)\/\s*$/.exec(line);
    if (dir !== null && !line.includes("screenshots")) folder = dir[1];
    const file = /([{}a-z,-]+\.png)/.exec(line);
    if (file === null) continue;
    const expanded = file[1].startsWith("{desktop,tablet,mobile}")
      ? VIEWPORT_NAMES.map((v) => file[1].replace("{desktop,tablet,mobile}", v))
      : [file[1]];
    for (const name of expanded) paths.push(`${OUT}/${folder}/${name}`);
  }
  return paths;
}

test("RSP-06 (ui-spec 12): every specified screenshot path is produced", async () => {
  const paths = specifiedPaths();
  // ui-spec 12 lists 46 files once the viewport sets are expanded.
  expect(paths.length, "ui-spec 12 should be readable").toBe(46);
  for (const path of paths) await expectCaptured(path);
});
