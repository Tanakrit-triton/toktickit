import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { mkdir, stat } from "node:fs/promises";
import { ACCOUNTS, apiSession, signIn, type ApiSession } from "./helpers.js";

// Shared by the Lab 3 responsive suite (docs/lab-03/tests.md 2.12) and the
// desktop evidence spec: viewports, the screenshot writer, the layout
// assertions, and the API setup that gives every capture realistic data.

export const OUT = "artifacts/lab-03/screenshots";

/** ui-spec 12: the Lab 2 viewports. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
} as const;
export type Viewport = keyof typeof VIEWPORTS;

export type Folder = "authentication" | "staff-queue" | "staff-ticket-detail" | "user-management";

/** A fresh browser context at one of the three widths. */
export async function contextAt(browser: Browser, viewport: Viewport): Promise<BrowserContext> {
  return browser.newContext({ viewport: VIEWPORTS[viewport], acceptDownloads: true });
}

/**
 * Writes `{viewport}-{name}.png` into its folder. The page settles first, so a
 * capture never shows a skeleton or a half-finished transition.
 */
export async function shot(
  page: Page,
  folder: Folder,
  viewport: Viewport,
  name: string,
  options: { fullPage?: boolean; top?: boolean } = {},
): Promise<string> {
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15000 });
  if (options.top) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  }
  await mkdir(`${OUT}/${folder}`, { recursive: true });
  const path = `${OUT}/${folder}/${viewport}-${name}.png`;
  await page.screenshot({ path, fullPage: options.fullPage ?? false });
  return path;
}

/** Like shot(), for states whose subject is held busy on purpose. */
export async function shotBusy(page: Page, folder: Folder, viewport: Viewport, name: string): Promise<string> {
  await mkdir(`${OUT}/${folder}`, { recursive: true });
  const path = `${OUT}/${folder}/${viewport}-${name}.png`;
  await page.screenshot({ path });
  return path;
}

/** A capture must have a real subject: visible, painted, and on screen. */
export async function painted(locator: Locator, what: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await expect(locator, `${what} should be visible`).toBeVisible({ timeout: 15000 });
  const box = await locator.boundingBox();
  expect(box, `${what} should have a box`).not.toBeNull();
  expect(box!.width, `${what} should have painted width`).toBeGreaterThan(4);
  expect(box!.height, `${what} should have painted height`).toBeGreaterThan(4);
}

/** The file exists and is more than an empty frame. */
export async function expectCaptured(path: string): Promise<void> {
  const info = await stat(path).catch(() => null);
  expect(info, `${path} should exist`).not.toBeNull();
  expect(info!.size, `${path} should be a real image`).toBeGreaterThan(5000);
}

// ---------------------------------------------------------------------------
// Layout assertions (AC-64): no horizontal scroll, no clipping, no overlap.

export type LayoutProblem = { kind: "overflow" | "clipped" | "overlap"; what: string };

/**
 * Inspects the rendered page in the browser, where layout exists:
 * - overflow: a visible element extends past the viewport's left or right edge;
 * - clipped: text or a control is cut off by its own box (scrollWidth or
 *   scrollHeight beyond its client box while overflow hides it), except for
 *   the documented one-line ellipsis that carries the full text in `title`;
 * - overlap: two interactive elements or badges, neither inside the other,
 *   share painted area.
 */
export async function layoutProblems(page: Page): Promise<LayoutProblem[]> {
  return page.evaluate(() => {
    const problems: { kind: "overflow" | "clipped" | "overlap"; what: string }[] = [];
    const vw = document.documentElement.clientWidth;
    const describe = (el: Element) => {
      const id = el.getAttribute("data-testid");
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""}${text ? ` "${text}"` : ""}`;
    };
    const shown = (el: Element) => {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      // Visually hidden helpers are 1px boxes by design.
      return r.width > 1 && r.height > 1;
    };
    const insideScroller = (el: Element) => {
      for (let p = el.parentElement; p !== null; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") return true;
      }
      return false;
    };

    const all = Array.from(document.body.querySelectorAll("*")).filter(shown);
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if ((r.left < -1 || r.right > vw + 1) && !insideScroller(el)) {
        problems.push({ kind: "overflow", what: describe(el) });
      }
    }

    const textual = all.filter((el) =>
      el.matches("button, a, label, input, select, textarea, h1, h2, h3, p, th, td, li, .zg-badge, [data-testid^='badge-'], .zg-callout"),
    );
    for (const el of textual) {
      const style = getComputedStyle(el);
      const hides = (o: string) => o === "hidden" || o === "clip";
      const ellipsis = style.textOverflow === "ellipsis" && el.hasAttribute("title");
      const wide = el.scrollWidth > el.clientWidth + 1 && hides(style.overflowX) && !ellipsis;
      const tall = el.scrollHeight > el.clientHeight + 1 && hides(style.overflowY);
      // Form controls scroll their own content; that is not clipping.
      const control = el.matches("input, select, textarea");
      if ((wide || tall) && !control) problems.push({ kind: "clipped", what: describe(el) });
    }

    const targets = all.filter((el) => el.matches("button, a, input, select, textarea, .zg-badge, [data-testid^='badge-']"));
    for (let i = 0; i < targets.length; i += 1) {
      for (let j = i + 1; j < targets.length; j += 1) {
        const a = targets[i];
        const b = targets[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 1 && h > 1) problems.push({ kind: "overlap", what: `${describe(a)} / ${describe(b)}` });
      }
    }

    return problems;
  });
}

/** No horizontal page scroll, and no clipped or overlapping element. */
export async function expectSoundLayout(page: Page, screen: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${screen}: the page must not scroll horizontally`).toBeLessThanOrEqual(1);
  expect(await layoutProblems(page), `${screen}: clipped, overlapping, or off-screen elements`).toEqual([]);
}

// ---------------------------------------------------------------------------
// Realistic data through the API.

export const runId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type Named = { id: number; name: string };

/** Reports a Requester would plausibly file, with varied category and priority. */
const REPORTS: { summary: string; description: string; priority: string; category: number; system: number }[] = [
  { summary: "Projector in room CB2301 shows no signal", description: "The projector powers on but reports no signal from the lectern PC or from an HDMI laptop.", priority: "HIGH", category: 1, system: 0 },
  { summary: "Cannot open the payroll self-service page", description: "The page loads to a blank screen after sign-in on both Edge and Chrome since Monday morning.", priority: "MEDIUM", category: 0, system: 1 },
  { summary: "Shared drive asks for a password every hour", description: "Mapped drive S: drops its credentials roughly every hour and asks me to sign in again.", priority: "LOW", category: 0, system: 2 },
  { summary: "Lab PC 14 keyboard missing several keys", description: "Keys F, G and H are missing on the keyboard at seat 14 in the computer lab on floor 3.", priority: "LOW", category: 1, system: 0 },
  { summary: "Email attachments over 5 MB fail to send", description: "Messages with attachments larger than about five megabytes stay in the outbox with no error.", priority: "MEDIUM", category: 2, system: 1 },
  { summary: "Library kiosk frozen on the welcome screen", description: "The self-checkout kiosk near the entrance has shown the welcome screen without responding since 9:00.", priority: "HIGH", category: 1, system: 2 },
  { summary: "New staff member needs LEB2 course access", description: "A newly hired lecturer cannot see the courses assigned to her in LEB2 for this semester.", priority: "MEDIUM", category: 0, system: 0 },
  { summary: "Teams meetings drop audio after ten minutes", description: "In every Teams meeting the audio cuts out after about ten minutes and only returns after rejoining.", priority: "HIGH", category: 2, system: 1 },
  { summary: "Scanner on floor 5 saves blank PDFs", description: "Scan-to-email from the floor 5 copier produces PDFs with the right page count but every page blank.", priority: "MEDIUM", category: 1, system: 2 },
  { summary: "Room booking system double-books CB1105", description: "Two departments received confirmations for CB1105 on Thursday afternoon at the same time.", priority: "URGENT", category: 2, system: 0 },
  { summary: "VPN disconnects when switching Wi-Fi networks", description: "Moving between the Building 4 and library Wi-Fi drops the VPN and it will not reconnect.", priority: "LOW", category: 2, system: 1 },
  { summary: "Exam room clock display is ten minutes fast", description: "The networked wall clock in exam hall 2 runs ten minutes ahead of the official time.", priority: "MEDIUM", category: 1, system: 2 },
  { summary: "Student portal shows another student's timetable", description: "After signing in, the timetable tab briefly shows a different student's schedule before reloading.", priority: "URGENT", category: 0, system: 0 },
  { summary: "Printer driver install blocked on lab Macs", description: "Installing the floor 2 printer driver on the lab Macs fails with an administrator prompt.", priority: "LOW", category: 2, system: 1 },
  { summary: "Laptop docking station not charging", description: "The docking station at desk 12 shows displays correctly but the laptop battery does not charge.", priority: "MEDIUM", category: 1, system: 2 },
];

/** Creates a ticket through POST /tickets with chosen values. */
export async function fileTicket(
  requester: ApiSession,
  report: { summary: string; description: string; priority: string; category?: number; system?: number },
): Promise<{ id: string; ticketNumber: string }> {
  const categories = (await requester.get("/categories")) as Named[];
  const systems = (await requester.get("/related-systems")) as Named[];
  const created = await requester.send("POST", "/tickets", {
    categoryId: categories[(report.category ?? 0) % categories.length].id,
    relatedSystemId: systems[(report.system ?? 0) % systems.length].id,
    summary: report.summary,
    requestedPriority: report.priority,
    description: report.description,
  });
  expect(created.status, `filing "${report.summary}"`).toBe(201);
  return created.body.data;
}

const STAFF_EMAILS = ["wichai.pra@kmutt.ac.th", "arisa.kon@kmutt.ac.th", "teerapat.boo@kmutt.ac.th"];
const REQUESTER_EMAILS = ["siriporn.mee@kmutt.ac.th", "napat.cha@kmutt.ac.th", "thanawat.rat@kmutt.ac.th"];

/**
 * Tops the queue up to at least 25 tickets, so it has a second page at the
 * default size of 20, with a mix of owners, IT Priorities, and statuses. On a
 * database that already has that many it does nothing, so repeated runs do not
 * keep adding tickets.
 */
export async function ensureRealisticQueue(): Promise<void> {
  const admin = await apiSession(ACCOUNTS.admin.email);
  try {
    const response = await admin.ctx.get("/api/v1/staff/tickets?pageSize=10");
    const total = ((await response.json()) as { meta: { totalItems: number } }).meta.totalItems;
    if (total >= 25) return;

    const requesters = await Promise.all(REQUESTER_EMAILS.map((e) => apiSession(e)));
    const staff = await Promise.all(STAFF_EMAILS.map((e) => apiSession(e)));
    try {
      const needed = Math.min(REPORTS.length, 25 - total + 2);
      for (let i = 0; i < needed; i += 1) {
        const ticket = await fileTicket(requesters[i % requesters.length], REPORTS[i]);
        // Roughly a third stay unassigned and NEW, which is what a real queue looks like.
        if (i % 3 === 0) continue;
        const worker = staff[i % staff.length];
        expect((await worker.send("POST", `/staff/tickets/${ticket.id}/claim`)).status).toBe(200);
        if (i % 4 === 1) {
          const raised = await worker.send("PUT", `/staff/tickets/${ticket.id}/it-priority`, { itPriority: "URGENT" });
          expect(raised.status).toBe(200);
        }
        if (i % 3 === 2) {
          expect((await worker.send("POST", `/staff/tickets/${ticket.id}/status`, { status: "IN_PROGRESS" })).status).toBe(200);
        }
        if (i % 5 === 4) {
          const waiting = await worker.send("POST", `/staff/tickets/${ticket.id}/status`, { status: "WAITING_FOR_REQUESTER" });
          expect([200, 409]).toContain(waiting.status);
        }
      }
    } finally {
      await Promise.all([...requesters, ...staff].map((s) => s.dispose()));
    }
  } finally {
    await admin.dispose();
  }
}

/**
 * A fully worked ticket for the detail captures: filed by the Requester with an
 * attachment, claimed by Wichai, Start work, a Public Comment each way, and an
 * Internal Note.
 */
export async function workedTicket(summary = "Laptop fan runs at full speed while idle"): Promise<{
  id: string;
  ticketNumber: string;
  attachment: string;
  note: string;
}> {
  const requester = await apiSession(ACCOUNTS.requester.email);
  const staff = await apiSession(ACCOUNTS.staff.email);
  try {
    const ticket = await fileTicket(requester, {
      summary,
      description:
        "Since Tuesday the fan on my office laptop runs at full speed even with nothing open.\nIt is loud enough to disturb meetings and the base gets hot.",
      priority: "MEDIUM",
      category: 1,
      system: 0,
    });
    const attachment = "fan-noise-task-manager.png";
    const upload = await requester.ctx.post(`/api/v1/tickets/${ticket.id}/attachments`, {
      headers: { "X-CSRF-Token": requester.csrf },
      multipart: {
        file: { name: attachment, mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex") },
      },
    });
    expect(upload.status(), "attachment upload").toBe(201);

    expect((await staff.send("POST", `/staff/tickets/${ticket.id}/claim`)).status).toBe(200);
    expect((await staff.send("PUT", `/staff/tickets/${ticket.id}/it-priority`, { itPriority: "HIGH" })).status).toBe(200);
    expect((await staff.send("POST", `/staff/tickets/${ticket.id}/status`, { status: "IN_PROGRESS" })).status).toBe(200);
    const reply = await staff.send("POST", `/tickets/${ticket.id}/comments`, {
      body: "Thanks for the report. Could you tell me whether it happens on battery as well as on the charger?",
    });
    expect(reply.status).toBe(201);
    const answer = await requester.send("POST", `/tickets/${ticket.id}/comments`, {
      body: "It happens on both. Task Manager shows nothing above 5% CPU, screenshot attached.",
    });
    expect(answer.status).toBe(201);
    const note = "BIOS is two versions behind on this model. Try the update before replacing the fan.";
    expect((await staff.send("POST", `/tickets/${ticket.id}/notes`, { body: note })).status).toBe(201);
    return { ...ticket, attachment, note };
  } finally {
    await requester.dispose();
    await staff.dispose();
  }
}

/** A NEW, unassigned ticket filed by the main Requester. */
export async function newTicket(summary: string, priority = "MEDIUM"): Promise<{ id: string; ticketNumber: string }> {
  const requester = await apiSession(ACCOUNTS.requester.email);
  try {
    return await fileTicket(requester, {
      summary,
      description: "Reported through the service desk with enough detail for the IT Staff to act on it.",
      priority,
      category: 1,
      system: 1,
    });
  } finally {
    await requester.dispose();
  }
}

/** Signs in on a fresh page in `context` and opens `path`. */
export async function openAs(context: BrowserContext, email: string, path: string): Promise<Page> {
  const page = await context.newPage();
  await signIn(page, email);
  await page.goto(path);
  return page;
}
