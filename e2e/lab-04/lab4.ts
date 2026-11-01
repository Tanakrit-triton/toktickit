import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, type Browser, type BrowserContext, type ConsoleMessage, type Page } from "@playwright/test";
import { ACCOUNTS, BASE, apiSession, signIn, type ApiSession } from "../lab-03/helpers.js";
import { VIEWPORTS, contextAt, fileTicket, runId, versioned, type Viewport } from "../lab-03/capture.js";

// Shared by the Lab 4 end-to-end and responsive suites (docs/lab-04/tests.md
// sections 2.9 and 2.10): the Lab 4 accounts, API setup for tickets with
// actions, the ui-spec 11 screenshot writer, and the AC-40 console guard.

export { ACCOUNTS, BASE, VIEWPORTS, apiSession, contextAt, runId, signIn, versioned, type ApiSession, type Viewport };

/** The seeded Lab 4 fixtures (specification.md 7.5, tests.md section 1). */
export const LAB4 = {
  arisa: { email: "arisa.kon@kmutt.ac.th", fullName: "Arisa Kongkaew" },
  teerapat: { email: "teerapat.boo@kmutt.ac.th", fullName: "Teerapat Boonsri" },
  pimchanok: { email: "pimchanok.son@kmutt.ac.th", fullName: "Pimchanok Sonthi" },
  napat: { email: "napat.cha@kmutt.ac.th", fullName: "Napat Chaiwong" },
} as const;

export const SCREENSHOTS = "artifacts/lab-04/screenshots";
export type Folder = "staff-dashboard" | "requester-dashboard" | "actions-taken" | "workflow" | "regression";

/** Every path ui-spec 11 lists, relative to SCREENSHOTS. */
export const SPECIFIED_SCREENSHOTS: string[] = [
  ...(["desktop", "tablet", "mobile"] as const).map((v) => `staff-dashboard/${v}-it-staff.png`),
  "staff-dashboard/desktop-administrator.png",
  "staff-dashboard/desktop-zero-open-actions.png",
  "staff-dashboard/desktop-loading.png",
  "staff-dashboard/desktop-failure.png",
  "staff-dashboard/desktop-forbidden-requester.png",
  "staff-dashboard/desktop-drilldown-owned-by-me.png",
  ...(["desktop", "tablet", "mobile"] as const).map((v) => `requester-dashboard/${v}-populated.png`),
  "requester-dashboard/desktop-empty.png",
  "requester-dashboard/desktop-forbidden-it-staff.png",
  "requester-dashboard/desktop-drilldown-waiting.png",
  ...(["desktop", "tablet", "mobile"] as const).map((v) => `actions-taken/${v}-list.png`),
  "actions-taken/desktop-create-dialog.png",
  "actions-taken/desktop-validation.png",
  "actions-taken/desktop-inactive-performer.png",
  "actions-taken/desktop-edit-complete.png",
  "actions-taken/desktop-cancel-action.png",
  "actions-taken/desktop-stale-conflict.png",
  "actions-taken/desktop-requester-readonly.png",
  "actions-taken/mobile-dialog.png",
  "workflow/desktop-resolve-blocked.png",
  "workflow/desktop-resolved.png",
  "workflow/desktop-history.png",
  ...["login", "my-tickets", "requester-detail", "queue", "staff-detail", "user-management"].map((n) => `regression/desktop-${n}.png`),
];

/**
 * Writes `{viewport}-{name}.png` into a ui-spec 11 folder once the page has
 * settled: no skeleton or busy region is left, unless the capture is of the
 * busy state itself.
 */
export async function shot(
  page: Page,
  folder: Folder,
  viewport: Viewport,
  name: string,
  options: { fullPage?: boolean; busy?: boolean } = {},
): Promise<string> {
  if (!options.busy) await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15000 });
  await mkdir(`${SCREENSHOTS}/${folder}`, { recursive: true });
  const path = `${SCREENSHOTS}/${folder}/${viewport}-${name}.png`;
  await page.screenshot({ path, fullPage: options.fullPage ?? false });
  return path;
}

/** A fresh context at `viewport`, signed in as `email` on a page at `path`. */
export async function openAs(browser: Browser, viewport: Viewport, email: string, path: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await contextAt(browser, viewport);
  const page = await context.newPage();
  await signIn(page, email);
  await page.goto(`${BASE}${path}`);
  return { context, page };
}

/** Opens Staff Ticket Detail and waits for the actions list to finish loading. */
export async function openStaffTicket(page: Page, id: string): Promise<void> {
  await page.goto(`${BASE}/staff/tickets/${id}`);
  await page.getByTestId("operations-card").waitFor({ timeout: 20000 });
  await expect(page.getByTestId("actions-card").locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// API setup

type Assignee = { id: string; fullName: string };

export async function staffIdByName(staff: ApiSession, fullName: string): Promise<string> {
  const people = (await staff.get("/staff/assignees")) as Assignee[];
  const person = people.find((p) => p.fullName === fullName);
  expect(person, `${fullName} among the assignees`).toBeDefined();
  return person!.id;
}

/** A ticket filed by the main Requester, claimed by Wichai, and In Progress. */
export async function ticketInProgress(summary: string): Promise<{ id: string; ticketNumber: string }> {
  const requester = await apiSession(ACCOUNTS.requester.email);
  const staff = await apiSession(ACCOUNTS.staff.email);
  try {
    const ticket = await fileTicket(requester, {
      summary,
      description: "The lecture theatre projector loses the signal after a few minutes on every input we have tried.",
      priority: "HIGH",
      category: 1,
      system: 2,
    });
    expect((await staff.send("POST", `/staff/tickets/${ticket.id}/claim`)).status, "claim").toBe(200);
    const started = await staff.send("POST", `/staff/tickets/${ticket.id}/status`, await versioned(staff, ticket.id, { status: "IN_PROGRESS" }));
    expect(started.status, "start work").toBe(200);
    return ticket;
  } finally {
    await requester.dispose();
    await staff.dispose();
  }
}

export type ActionInput = {
  description: string;
  status?: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
  result?: string;
  performedById?: string;
  followUpRequired?: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
  /** Minutes after now (0–4): never before a ticket filed seconds ago (BR-05), within BR-06. */
  minutesAhead?: number;
};

export type SavedAction = { id: string; version: number; status: string };

/** Records an action through POST /staff/tickets/{id}/actions (api-spec 2.2). */
export async function recordAction(staff: ApiSession, ticketId: string, input: ActionInput): Promise<SavedAction> {
  const { minutesAhead = 0, ...fields } = input;
  const created = await staff.send("POST", `/staff/tickets/${ticketId}/actions`, {
    clientRequestId: randomUUID(),
    actionAt: new Date(Date.now() + minutesAhead * 60_000).toISOString(),
    ...fields,
  });
  expect(created.status, `recording "${input.description}"`).toBe(201);
  return created.body.data as SavedAction;
}

/** Edits an action through PATCH /staff/actions/{id} with its current version (api-spec 2.3). */
export async function editAction(staff: ApiSession, action: SavedAction, body: Record<string, unknown>): Promise<SavedAction> {
  const saved = await staff.send("PATCH", `/staff/actions/${action.id}`, { version: action.version, ...body });
  expect(saved.status, `editing action ${action.id}`).toBe(200);
  return saved.body.data as SavedAction;
}

/**
 * A ticket with four actions, one per status, two performers, and an open
 * action, so resolution is blocked (RSP-02, the actions-taken and workflow
 * captures). Wichai records all of them.
 */
export async function ticketWithFourActions(summary: string): Promise<{ id: string; ticketNumber: string; actions: SavedAction[] }> {
  const ticket = await ticketInProgress(summary);
  const staff = await apiSession(ACCOUNTS.staff.email);
  try {
    const arisa = await staffIdByName(staff, LAB4.arisa.fullName);
    const completed = await recordAction(staff, ticket.id, {
      description: "Checked the HDMI and VGA cables at the lectern and swapped the HDMI cable for a new one.",
      status: "COMPLETED",
      result: "Signal held for 20 minutes with the new cable, then dropped again.",
      attachmentNotes: "projector-menu-input.jpg",
      followUpRequired: true,
      followUpNote: "Check the signal again after the next full-day booking.",
      minutesAhead: 0,
    });
    const inProgress = await recordAction(staff, ticket.id, {
      description: "Updating the projector firmware from the vendor's maintenance portal.",
      status: "IN_PROGRESS",
      performedById: arisa,
      minutesAhead: 1,
    });
    const planned = await recordAction(staff, ticket.id, {
      description: "Replace the projector lamp if the firmware update does not fix the signal loss.",
      minutesAhead: 2,
    });
    const toCancel = await recordAction(staff, ticket.id, {
      description: "Borrow a spare projector from the media centre for Thursday's lecture.",
      minutesAhead: 3,
    });
    const cancelled = await editAction(staff, toCancel, { status: "CANCELLED", result: "The lecture moved to room CB2302, which has a working projector." });
    return { ...ticket, actions: [completed, inProgress, planned, cancelled] };
  } finally {
    await staff.dispose();
  }
}

// ---------------------------------------------------------------------------
// Console guard (AC-40, Amendment 8)

export type ExpectedHttpError = { method?: string; url: string; status: number };

/**
 * Collects every console error and warning on `page`. Browsers log each HTTP
 * error response as a console error ("Failed to load resource"), so two kinds
 * are excluded, and only these (Amendment 8):
 * 1. the 401 from GET /api/v1/auth/me before sign-in (the Lab 3 session check);
 * 2. 4xx responses the test triggers on purpose, listed in `expected` by exact
 *    URL and status.
 * Each excluded console line is matched to a response the page actually
 * received with that URL and status. Anything else fails the test.
 */
export function guardConsole(page: Page) {
  const responses: { url: string; status: number; method: string; signedIn: boolean }[] = [];
  const messages: ConsoleMessage[] = [];
  const state = { signedIn: false, expected: [] as ExpectedHttpError[] };

  page.on("response", (response) => {
    if (response.status() >= 400) {
      responses.push({ url: response.url(), status: response.status(), method: response.request().method(), signedIn: state.signedIn });
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") messages.push(message);
  });
  page.on("pageerror", (error) => {
    messages.push({ type: () => "error", text: () => `pageerror: ${error.message}`, location: () => ({ url: "", lineNumber: 0, columnNumber: 0 }) } as unknown as ConsoleMessage);
  });

  const excused = (message: ConsoleMessage): boolean => {
    const match = /Failed to load resource: the server responded with a status of (\d{3})/.exec(message.text());
    if (match === null) return false;
    const status = Number(match[1]);
    const url = message.location().url;
    const seen = responses.find((r) => r.url === url && r.status === status);
    if (seen === undefined) return false;
    const sessionCheck = `${BASE}/api/v1/auth/me`;
    if (url === sessionCheck && status === 401 && seen.method === "GET" && !seen.signedIn) return true;
    return state.expected.some((e) => e.url === url && e.status === status && (e.method ?? seen.method) === seen.method);
  };

  return {
    /** Call once sign-in has completed; a later /auth/me 401 is no longer excused. */
    signedIn() {
      state.signedIn = true;
    },
    /** A 4xx this test causes on purpose, by exact URL and status. */
    expect(error: ExpectedHttpError) {
      state.expected.push(error);
    },
    /** Fails with every console error or warning that is not excused. */
    async check(where: string) {
      const unexpected = messages.filter((m) => !excused(m)).map((m) => `${m.type()}: ${m.text()} (${m.location().url})`);
      expect(unexpected, `${where}: console errors or warnings`).toEqual([]);
    },
  };
}

/**
 * Sets the dialog's action date to the next whole minute, Bangkok time. The
 * field defaults to now truncated to the minute, which is earlier than a ticket
 * filed seconds ago within the same minute (BR-05, tests.md section 9). The
 * next minute is never before the ticket and is within BR-06's five minutes.
 */
export async function actionAtNextMinute(page: Page): Promise<void> {
  const next = new Date(Date.now() + 60_000 + 7 * 3_600_000).toISOString().slice(0, 16);
  await page.getByTestId("action-dialog").getByTestId("field-action-at").fill(next);
}
