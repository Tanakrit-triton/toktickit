import { stat } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { deactivate, freshPassword, uniqueEmail } from "../lab-03/helpers.js";
import { expectSoundLayout, newTicket } from "../lab-03/capture.js";
import {
  ACCOUNTS,
  BASE,
  LAB4,
  SCREENSHOTS,
  SPECIFIED_SCREENSHOTS,
  VIEWPORTS,
  actionAtNextMinute,
  apiSession,
  contextAt,
  editAction,
  openAs,
  openStaffTicket,
  recordAction,
  runId,
  shot,
  signIn,
  ticketInProgress,
  ticketWithFourActions,
  type SavedAction,
  type Viewport,
} from "./lab4.js";

// RSP-01 to RSP-06 from docs/lab-04/tests.md section 2.9 (AC-37, AC-39), and
// every screenshot path in docs/lab-04/ui-spec.md section 11 (tests.md
// section 7: this file writes them all).
//
// The file runs in the desktop project only (playwright.config.ts) and opens
// its own browser context at each width, as the Lab 3 responsive suite does,
// so the captures and the final path check run in one ordered pass.
//
// Data is real and created through the API as the seeded users. Two states
// cannot be produced by a healthy server and are produced by intercepting the
// browser's request instead: the dashboard's loading state (the response is
// held, then released) and its failure state (a 500 is returned).

test.describe.configure({ mode: "serial" });

const WIDTHS = Object.keys(VIEWPORTS) as Viewport[];
const runStarted = Date.now();

let four: Awaited<ReturnType<typeof ticketWithFourActions>>;

test.beforeAll(async () => {
  test.setTimeout(120000);
  four = await ticketWithFourActions(`Lecture theatre projector loses its signal ${runId()}`);
});

async function inContext(browser: Browser, viewport: Viewport, email: string, path: string, run: (page: Page) => Promise<void>) {
  const { context, page } = await openAs(browser, viewport, email, path);
  try {
    await run(page);
  } finally {
    await context.close();
  }
}

async function settled(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15000 });
}

/** No two metric cards share painted area (RSP-01). */
async function expectNoCardOverlap(page: Page, where: string) {
  const boxes = await page.locator('[data-testid^="metric-"]:not([data-testid^="metric-value-"])').evaluateAll((cards) =>
    cards.map((c) => {
      const r = c.getBoundingClientRect();
      return { id: c.getAttribute("data-testid"), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  expect(boxes.length, `${where}: metric cards`).toBeGreaterThan(0);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(w > 1 && h > 1, `${where}: ${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

async function toTop(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

/**
 * Brings the Actions Taken card to the top of the viewport, and waits until it
 * is there: a later layout change (a list finishing its load) can move it, so
 * the scroll is repeated until the card's top is visibly in place.
 */
async function toActions(page: Page) {
  const card = page.getByTestId("actions-card");
  await expect
    .poll(async () =>
      card.evaluate((el) => {
        el.scrollIntoView({ block: "start", behavior: "instant" });
        const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
        return Math.round(el.getBoundingClientRect().top) <= 1 || atBottom;
      }),
    )
    .toBe(true);
}

const rowOf = (page: Page, action: SavedAction) => page.getByTestId(`action-row-${action.id}`);

// ---------------------------------------------------------------------------
// RSP-01: both dashboards at each width.

test("RSP-01 (AC-37): both dashboards at 1440, 834, and 390 px without page scroll or overlapping cards", async ({ browser }) => {
  test.setTimeout(120000);
  for (const viewport of WIDTHS) {
    await inContext(browser, viewport, LAB4.arisa.email, "/staff/dashboard", async (page) => {
      await page.getByTestId("staff-dashboard-screen").waitFor();
      await settled(page);
      await expectSoundLayout(page, `IT Staff Dashboard ${viewport}`);
      await expectNoCardOverlap(page, `IT Staff Dashboard ${viewport}`);
      await shot(page, "staff-dashboard", viewport, "it-staff", { fullPage: true });
    });
    await inContext(browser, viewport, LAB4.napat.email, "/dashboard", async (page) => {
      await page.getByTestId("requester-dashboard-screen").waitFor();
      await settled(page);
      await expectSoundLayout(page, `Requester Dashboard ${viewport}`);
      await expectNoCardOverlap(page, `Requester Dashboard ${viewport}`);
      await shot(page, "requester-dashboard", viewport, "populated", { fullPage: true });
    });
  }
});

test("ui-spec 11 IT Staff Dashboard states", async ({ browser }) => {
  test.setTimeout(120000);
  await inContext(browser, "desktop", ACCOUNTS.admin.email, "/staff/dashboard", async (page) => {
    await expect(page.getByTestId("card-users")).toBeVisible();
    await shot(page, "staff-dashboard", "desktop", "administrator", { fullPage: true });
  });

  await inContext(browser, "desktop", LAB4.teerapat.email, "/staff/dashboard", async (page) => {
    await expect(page.getByTestId("metric-value-myOpenActions")).toHaveText("0");
    await expect(page.getByTestId("list-myOpenActions")).toContainText("You have no open actions.");
    await shot(page, "staff-dashboard", "desktop", "zero-open-actions", { fullPage: true });
  });

  // Loading: the response is held until the skeleton has been captured.
  const context = await contextAt(browser, "desktop");
  try {
    const page = await context.newPage();
    await signIn(page, LAB4.arisa.email);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/v1/staff/dashboard", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`${BASE}/staff/dashboard`);
    await expect(page.locator('[data-testid="staff-dashboard-screen"][aria-busy="true"], [aria-busy="true"]').first()).toBeVisible();
    await expect(page.getByTestId("skeleton-card").first()).toBeVisible();
    await shot(page, "staff-dashboard", "desktop", "loading", { busy: true });
    release();
    await settled(page);
    await page.unroute("**/api/v1/staff/dashboard");

    // Failure: a 500, shown as the safe error callout with Retry.
    await page.route("**/api/v1/staff/dashboard", (route) =>
      route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } } }),
    );
    await page.reload();
    await expect(page.getByText("We couldn't load the dashboard. Please try again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await shot(page, "staff-dashboard", "desktop", "failure");
  } finally {
    await context.close();
  }

  await inContext(browser, "desktop", LAB4.napat.email, "/staff/dashboard", async (page) => {
    await expect(page.getByTestId("state-forbidden")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Access denied" })).toBeVisible();
    await shot(page, "staff-dashboard", "desktop", "forbidden-requester");
  });

  await inContext(browser, "desktop", LAB4.arisa.email, "/staff/dashboard", async (page) => {
    await settled(page);
    await page.getByTestId("metric-ownedByMe").click();
    await expect(page.getByTestId("filter-chip")).toContainText("Showing: Open tickets");
    await settled(page);
    await shot(page, "staff-dashboard", "desktop", "drilldown-owned-by-me");
  });
});

test("ui-spec 11 Requester Dashboard states", async ({ browser }) => {
  await inContext(browser, "desktop", LAB4.pimchanok.email, "/dashboard", async (page) => {
    await expect(page.getByTestId("link-create-ticket")).toBeVisible();
    await shot(page, "requester-dashboard", "desktop", "empty", { fullPage: true });
  });
  await inContext(browser, "desktop", ACCOUNTS.staff.email, "/dashboard", async (page) => {
    await expect(page.getByTestId("state-forbidden")).toBeVisible();
    await shot(page, "requester-dashboard", "desktop", "forbidden-it-staff");
  });
  await inContext(browser, "desktop", LAB4.napat.email, "/dashboard", async (page) => {
    await settled(page);
    await page.getByTestId("metric-waitingForMe").click();
    await expect(page.getByTestId("filter-chip")).toContainText("Showing: Waiting for Requester");
    await settled(page);
    await shot(page, "requester-dashboard", "desktop", "drilldown-waiting");
  });
});

// ---------------------------------------------------------------------------
// RSP-02 and RSP-03: Ticket Details with actions.

test("RSP-02 (AC-37): Staff Ticket Detail with 4 actions is a table at desktop and tablet, cards at mobile, without overflow", async ({ browser }) => {
  test.setTimeout(120000);
  for (const viewport of WIDTHS) {
    await inContext(browser, viewport, ACCOUNTS.staff.email, "/", async (page) => {
      await openStaffTicket(page, four.id);
      const rows = page.getByTestId("actions-card").locator('[data-testid^="action-row-"]');
      const cards = page.getByTestId("actions-card").locator('[data-testid^="action-card-"]');
      if (viewport === "mobile") {
        await expect(cards).toHaveCount(4);
        for (const card of await cards.all()) await expect(card).toBeVisible();
        await expect(rows.filter({ visible: true })).toHaveCount(0);
      } else {
        await expect(rows).toHaveCount(4);
        for (const row of await rows.all()) await expect(row).toBeVisible();
        await expect(cards.filter({ visible: true })).toHaveCount(0);
      }
      await expectSoundLayout(page, `Staff Ticket Detail ${viewport}`);
      // Button labels are never broken across lines ("Detail / s"), even in
      // the narrow Edit column, where cells wrap long words (ui-spec 7).
      const broken = await page.getByTestId("actions-card").locator("button").evaluateAll((buttons) =>
        buttons
          .filter((b) => b.getClientRects().length > 0)
          .filter((b) => {
            const range = document.createRange();
            range.selectNodeContents(b);
            const tops = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
            return tops.size > 1;
          })
          .map((b) => `${b.getAttribute("data-testid")}: "${b.textContent}"`),
      );
      expect(broken, `Staff Ticket Detail ${viewport}: button labels on more than one line`).toEqual([]);
      await toActions(page);
      await shot(page, "actions-taken", viewport, "list");
      if (viewport === "desktop") {
        await toTop(page);
        await expect(page.getByTestId("notice-resolution-blocked")).toContainText("Can't resolve yet: 2 action(s) open, 1 follow-up(s) outstanding.");
        await expect(page.getByTestId("btn-transition-RESOLVED")).toBeDisabled();
        await shot(page, "workflow", "desktop", "resolve-blocked");
      }
    });
  }
});

test("RSP-03 (AC-37): Requester Ticket Detail with actions at three widths, read-only, without overflow", async ({ browser }) => {
  for (const viewport of WIDTHS) {
    await inContext(browser, viewport, ACCOUNTS.requester.email, `/tickets/${four.id}`, async (page) => {
      const card = page.getByTestId("actions-card");
      await expect(card.getByRole("heading", { name: "Work done on your ticket" })).toBeVisible();
      await settled(page);
      await expect(card.getByRole("button", { name: /Record|Edit/ })).toHaveCount(0);
      await expect(card.locator("input, select, textarea")).toHaveCount(0);
      await expectSoundLayout(page, `Requester Ticket Detail ${viewport}`);
      if (viewport === "desktop") {
        await toActions(page);
        await shot(page, "actions-taken", "desktop", "requester-readonly");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// RSP-04: the action dialog at 390 px.

test("RSP-04 (AC-37): the action dialog at 390 px is fully visible with stacked actions", async ({ browser }) => {
  await inContext(browser, "mobile", ACCOUNTS.staff.email, "/", async (page) => {
    await openStaffTicket(page, four.id);
    await page.getByTestId("btn-record-action").click();
    const dialog = page.getByTestId("action-dialog");
    await dialog.getByTestId("field-action-description").fill("Check whether the HDMI extender in the ceiling needs replacing.");
    const box = (await dialog.boundingBox())!;
    const { width, height } = VIEWPORTS.mobile;
    // Full width minus --zg-space-4 per side, and no taller than the window:
    // a dialog taller than the window scrolls inside itself (#72 browser check).
    expect(box.x, "left edge on screen").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, "right edge on screen").toBeLessThanOrEqual(width);
    expect(box.y, "top edge on screen").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "bottom edge on screen").toBeLessThanOrEqual(height);
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", width);

    const save = (await dialog.getByTestId("btn-save-action").boundingBox())!;
    const cancel = (await dialog.getByTestId("btn-action-cancel").boundingBox())!;
    const [upper, lower] = save.y < cancel.y ? [save, cancel] : [cancel, save];
    expect(lower.y, "actions stacked, not side by side").toBeGreaterThanOrEqual(upper.y + upper.height - 1);
    expect(Math.abs(save.width - cancel.width), "stacked actions share a width").toBeLessThanOrEqual(1);
    await dialog.getByTestId("btn-save-action").scrollIntoViewIfNeeded();
    await shot(page, "actions-taken", "mobile", "dialog");
  });
});

// ---------------------------------------------------------------------------
// ui-spec 11 action dialog and workflow captures (desktop).

test("ui-spec 11 action dialog states", async ({ browser }) => {
  test.setTimeout(120000);
  const ticket = await ticketInProgress(`Projector ceiling mount rattles ${runId()}`);
  const staffApi = await apiSession(ACCOUNTS.staff.email);
  const admin = await apiSession(ACCOUNTS.admin.email);
  const email = uniqueEmail("capture-performer");
  const fullName = `Nattawut Srisuk ${runId()}`;
  try {
    const completed = await recordAction(staffApi, ticket.id, {
      description: "Tightened the ceiling mount bolts and checked the projector alignment.",
      status: "COMPLETED",
      result: "No rattle during a 30-minute test with the fan at full speed.",
      attachmentNotes: "ceiling-mount-before.jpg",
    });
    const planned = await recordAction(staffApi, ticket.id, {
      description: "Order a replacement anti-vibration pad for the ceiling mount.",
      minutesAhead: 1,
    });
    expect(
      (await admin.send("POST", "/admin/users", { fullName, email, role: "IT_STAFF", isActive: true, initialPassword: freshPassword() })).status,
    ).toBe(201);

    await inContext(browser, "desktop", ACCOUNTS.staff.email, "/", async (page) => {
      await openStaffTicket(page, ticket.id);
      const dialog = page.getByTestId("action-dialog");

      // Create, filled in.
      await page.getByTestId("btn-record-action").click();
      await actionAtNextMinute(page);
      await dialog.getByTestId("field-action-description").fill("Replace the anti-vibration pad once the part arrives from the vendor.");
      await dialog.getByTestId("field-action-performer").selectOption({ label: LAB4.arisa.fullName });
      await dialog.getByTestId("field-follow-up-required").check();
      await dialog.getByTestId("field-follow-up-note").fill("Confirm with the lecturer that the rattle is gone after the next class.");
      await shot(page, "actions-taken", "desktop", "create-dialog");

      // Validation: a too-short description and an empty follow-up note.
      await dialog.getByTestId("field-action-description").fill("Pad");
      await dialog.getByTestId("field-follow-up-note").fill("");
      await dialog.getByTestId("btn-save-action").click();
      await expect(dialog.getByTestId("field-action-description")).toHaveAttribute("aria-invalid", "true");
      await expect(dialog.getByTestId("field-follow-up-note")).toHaveAttribute("aria-invalid", "true");
      await dialog.getByTestId("field-action-description").scrollIntoViewIfNeeded();
      await shot(page, "actions-taken", "desktop", "validation");
      await dialog.getByTestId("btn-action-cancel").click();
      await expect(dialog).toHaveCount(0);

      // Inactive performer: chosen, then deactivated before Save (AC-03).
      await page.getByTestId("btn-record-action").click();
      await actionAtNextMinute(page);
      await dialog.getByTestId("field-action-description").fill("Collect the projector's fan speed log for the vendor.");
      await dialog.getByTestId("field-action-performer").selectOption({ label: fullName });
      await deactivate(admin, email);
      await dialog.getByTestId("btn-save-action").click();
      await expect(dialog.getByTestId("field-action-performer")).toHaveAccessibleDescription("Choose an active IT Staff or Administrator user.");
      await shot(page, "actions-taken", "desktop", "inactive-performer");
      await dialog.getByTestId("btn-action-cancel").click();

      // Edit a COMPLETED action: status and performer read-only.
      await page.getByTestId(`btn-edit-action-${completed.id}`).click();
      await expect(dialog.locator('select[data-testid="field-action-status"]')).toHaveCount(0);
      await shot(page, "actions-taken", "desktop", "edit-complete");
      await dialog.getByTestId("btn-action-cancel").click();

      // Cancelling an action: the confirmation line and the destructive Save.
      await page.getByTestId(`btn-edit-action-${planned.id}`).click();
      await dialog.getByTestId("field-action-status").selectOption("CANCELLED");
      await expect(dialog).toContainText("Cancelled actions cannot be edited again.");
      await dialog.getByTestId("field-action-result").fill("The vendor no longer supplies this pad; the mount is being replaced instead.");
      // The subject is the confirmation line above the (destructive) Save.
      await dialog.getByTestId("btn-save-action").scrollIntoViewIfNeeded();
      await expect(dialog.getByText("Cancelled actions cannot be edited again.")).toBeInViewport();
      await shot(page, "actions-taken", "desktop", "cancel-action");
      await dialog.getByTestId("btn-action-cancel").click();

      // Stale: someone else edits the action while this dialog is open (AC-21).
      await page.getByTestId(`btn-edit-action-${planned.id}`).click();
      await dialog.getByTestId("field-action-description").fill("Order two anti-vibration pads, one as a spare.");
      await editAction(staffApi, planned, { description: "Order the anti-vibration pad from the second vendor." });
      await dialog.getByTestId("btn-save-action").click();
      await expect(dialog.getByTestId("callout-conflict")).toBeVisible();
      await expect(dialog.getByTestId("btn-reload-ticket")).toBeVisible();
      await expect(dialog.getByTestId("field-action-description")).toHaveValue("Order two anti-vibration pads, one as a spare.");
      await dialog.getByTestId("callout-conflict").scrollIntoViewIfNeeded();
      await expect(dialog.getByTestId("callout-conflict")).toBeInViewport();
      await shot(page, "actions-taken", "desktop", "stale-conflict");
      await dialog.getByTestId("btn-action-cancel").click();
    });
  } finally {
    await staffApi.dispose();
    await admin.dispose();
  }
});

test("ui-spec 11 workflow: resolved, and the History tab", async ({ browser }) => {
  const ticket = await ticketInProgress(`Lectern microphone crackles ${runId()}`);
  const staffApi = await apiSession(ACCOUNTS.staff.email);
  try {
    await recordAction(staffApi, ticket.id, {
      description: "Replaced the lectern microphone cable and re-tested the audio mixer.",
      status: "COMPLETED",
      result: "No crackle during a 15-minute test at lecture volume.",
    });
  } finally {
    await staffApi.dispose();
  }
  await inContext(browser, "desktop", ACCOUNTS.staff.email, "/", async (page) => {
    await openStaffTicket(page, ticket.id);
    await page.getByTestId("btn-transition-RESOLVED").click();
    await page.getByTestId("confirm-dialog").getByTestId("btn-confirm").click();
    await expect(page.getByTestId("resolved-at")).toContainText("Resolved on");
    await settled(page);
    await toTop(page);
    await shot(page, "workflow", "desktop", "resolved");

    await page.getByTestId("tab-history").click();
    await expect(page.locator('[data-testid^="history-item-"]').last()).toContainText("changed status from In Progress to Resolved.");
    await page.getByTestId("tab-history").scrollIntoViewIfNeeded();
    await shot(page, "workflow", "desktop", "history");
  });
});

test("ui-spec 11 regression captures on the Lab 4 product", async ({ browser }) => {
  const context = await contextAt(browser, "desktop");
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/login`);
    await expect(page.getByTestId("btn-sign-in")).toBeVisible();
    await shot(page, "regression", "desktop", "login");
  } finally {
    await context.close();
  }
  await inContext(browser, "desktop", ACCOUNTS.requester.email, "/tickets", async (page) => {
    await expect(page.locator('[data-testid^="ticket-row-"]').first()).toBeVisible();
    await shot(page, "regression", "desktop", "my-tickets");
    await page.goto(`${BASE}/tickets/${four.id}`);
    await expect(page.getByTestId("actions-card")).toBeVisible();
    await shot(page, "regression", "desktop", "requester-detail");
  });
  await inContext(browser, "desktop", ACCOUNTS.staff.email, "/staff/queue", async (page) => {
    await expect(page.locator('[data-testid^="queue-row-"]').first()).toBeVisible();
    await shot(page, "regression", "desktop", "queue");
    await openStaffTicket(page, four.id);
    await shot(page, "regression", "desktop", "staff-detail");
  });
  await inContext(browser, "desktop", ACCOUNTS.admin.email, "/admin/users", async (page) => {
    await expect(page.locator('[data-testid^="user-row-"]').first()).toBeVisible();
    await shot(page, "regression", "desktop", "user-management");
  });
});

// ---------------------------------------------------------------------------
// RSP-05: keyboard only.

/** Tabs through the page and returns, for each control reached, whether its look changed on focus. */
async function tabThrough(page: Page, scope: string, presses: number) {
  const targets = page.getByTestId(scope).locator("a[href], button:not([disabled]), select, input, textarea, [tabindex='0']");
  const ids = await targets.evaluateAll((els) =>
    els.map((el, i) => {
      el.setAttribute("data-rsp05", String(i));
      const s = getComputedStyle(el);
      return `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}|${s.borderTopColor}|${s.borderTopWidth}`;
    }),
  );
  const reached = new Map<number, boolean>();
  await page.locator("body").focus();
  for (let i = 0; i < presses && reached.size < ids.length; i += 1) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const mark = el?.getAttribute("data-rsp05");
      if (!el || mark === null || mark === undefined) return null;
      const s = getComputedStyle(el);
      return { mark: Number(mark), look: `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}|${s.borderTopColor}|${s.borderTopWidth}` };
    });
    if (at !== null) reached.set(at.mark, at.look !== ids[at.mark]);
  }
  return { total: ids.length, reached };
}

test("RSP-05 (AC-39): keyboard only - every dashboard control is reached with a visible focus change; the action dialog traps and returns focus", async ({ browser }) => {
  test.setTimeout(120000);
  for (const [email, path, scope] of [
    [LAB4.arisa.email, "/staff/dashboard", "staff-dashboard-screen"],
    [LAB4.napat.email, "/dashboard", "requester-dashboard-screen"],
  ] as const) {
    await inContext(browser, "desktop", email, path, async (page) => {
      await page.getByTestId(scope).waitFor();
      await settled(page);
      const { total, reached } = await tabThrough(page, scope, 200);
      expect(total, `${scope}: controls`).toBeGreaterThan(0);
      expect(reached.size, `${scope}: every control reached by Tab`).toBe(total);
      const unchanged = [...reached.entries()].filter(([, changed]) => !changed).map(([mark]) => mark);
      expect(unchanged, `${scope}: controls whose focus is not visible`).toEqual([]);
    });
  }

  await inContext(browser, "desktop", ACCOUNTS.staff.email, "/", async (page) => {
    await openStaffTicket(page, four.id);
    const opener = page.getByTestId("btn-record-action");
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByTestId("action-dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `Tab ${i + 1} stays in the dialog`).toBe(true);
    }
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `Shift+Tab ${i + 1} stays in the dialog`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// RSP-06: the list tables fit the tablet container.

test.describe("RSP-06 (AC-37) - list tables fit the tablet container", () => {
  // A summary long enough to reach the one-line cap, found by its run id, so
  // the check does not depend on which tickets the lists happen to show.
  const id = runId();
  const summary = `Projector in the large lecture theatre flickers and then loses every input ${id}`;

  test.beforeAll(async () => {
    await newTicket(summary);
  });

  for (const [screen, email, path, testId] of [
    ["My Tickets", ACCOUNTS.requester.email, "/tickets", "ticket-table"],
    ["Ticket Queue", ACCOUNTS.staff.email, "/staff/queue", "queue-table"],
  ] as const) {
    test(`${screen} at 834 px has no sideways scroll inside its table container`, async ({ browser }) => {
      await inContext(browser, "tablet", email, path, async (page) => {
        const table = page.getByTestId(testId);
        const expectFits = async (state: string) => {
          const { tableWidth, containerWidth } = await table.evaluate((el) => ({
            tableWidth: el.getBoundingClientRect().width,
            containerWidth: (el.closest(".zg-table-scroll") as HTMLElement).clientWidth,
          }));
          expect(tableWidth, `${screen} (${state}) table width against its ${containerWidth}px container`).toBeLessThanOrEqual(containerWidth + 1);
        };

        // Column widths depend on every row, so both the usual first page and
        // the long-summary row are checked.
        await expect(table.locator("tbody tr").first()).toBeVisible();
        await expectFits("first page");
        await page.getByTestId("field-search").fill(id);
        await expect(table.locator("tbody tr")).toHaveCount(1);
        await expect(table.locator("tbody tr").first()).toContainText(id);
        await expectFits("long summary");
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Every ui-spec 11 path was written by this run.

test("ui-spec 11: every specified screenshot path is produced by this run", async () => {
  for (const path of SPECIFIED_SCREENSHOTS) {
    const info = await stat(`${SCREENSHOTS}/${path}`).catch(() => null);
    expect(info, `${path} should exist`).not.toBeNull();
    expect(info!.size, `${path} should be a real image`).toBeGreaterThan(5000);
    expect(info!.mtimeMs, `${path} should be from this run`).toBeGreaterThanOrEqual(runStarted - 1000);
  }
});
