import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import type { CurrentUser } from "../../src/lab-03/auth-api.js";
import {
  ADMINISTRATOR,
  IT_STAFF,
  MUST_CHANGE,
  REQUESTER,
  mockRequesterScreens,
  mockStartupSession,
  renderApp,
  ticketRow,
} from "./helpers.js";
import {
  ALL_STATUSES,
  STATUS_TEXT,
  TICKET_ID,
  TICKET_NUMBER,
  entry,
  failure,
  fakeApi,
  ok,
  queueItem,
  queuePage,
  queueRoutes,
  requesterRoutes,
  requesterTicket,
  staffRoutes,
  staffTicket,
} from "./ticket-fixtures.js";

// Lab 3 UI style assertions -- docs/lab-03/tests.md section 2.11.
//
// #38 owns STY-03. #43 added STY-01 and STY-02, #44 STY-04, and #47 STY-05 to
// STY-09.
//
// As in the Lab 2 style suite, jsdom loads no stylesheet, so assertions target
// the class contract the stylesheet keys off and read the stylesheet source.

const STYLESHEET = "src/lab-02/styles/zen-green.css";

/** The body of the first CSS rule whose selector matches `selector`. */
function ruleBody(css: string, selector: RegExp): string {
  const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `no rule for ${selector.source}`).not.toBeNull();
  return match![1];
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const kebab = (value: string) => value.toLowerCase().replace(/_/g, "-");

describe("STY-01 (AC-65) - status badges", () => {
  // ui-spec 7.1: background, text, and border tokens per status.
  const TOKENS: Record<string, [string, string, string | null]> = {
    NEW: ["--zg-pale", "--zg-secondary", null],
    OPEN: ["--zg-surface", "--zg-secondary", "--zg-secondary"],
    IN_PROGRESS: ["--zg-secondary", "--zg-surface", null],
    WAITING_FOR_REQUESTER: ["--zg-warning-bg", "--zg-warning", null],
    RESOLVED: ["--zg-primary", "--zg-surface", null],
    CLOSED: ["--zg-disabled-bg", "--zg-text-muted", null],
    REOPENED: ["--zg-pale", "--zg-primary", "--zg-primary"],
    CANCELLED: ["--zg-disabled-bg", "--zg-text-muted", "--zg-border"],
  };

  it("renders all eight statuses in the queue with their display text and class", async () => {
    const items = ALL_STATUSES.map((status, i) => queueItem(`TKT-2026-0010${i}`, { currentStatus: status }));
    fakeApi(queueRoutes(queuePage(items)));
    mockStartupSession(IT_STAFF);
    renderApp("/staff/queue");

    for (const [i, status] of ALL_STATUSES.entries()) {
      const row = await screen.findByTestId(`queue-row-TKT-2026-0010${i}`);
      const badge = within(row).getByTestId("badge-status");
      expect(badge, status).toHaveTextContent(new RegExp(`^${STATUS_TEXT[status]}$`));
      expect(badge, status).toHaveAttribute("data-status", status);
      expect(badge, status).toHaveClass(`zg-badge--status-${kebab(status)}`);
    }
  });

  it("renders each status's display text in My Tickets, not a fixed New", async () => {
    mockRequesterScreens(
      ALL_STATUSES.map((status, i) => ({ ...ticketRow(`TKT-2026-0020${i}`, `Ticket ${i}`), currentStatus: status })),
    );
    mockStartupSession(REQUESTER);
    renderApp("/tickets");

    for (const [i, status] of ALL_STATUSES.entries()) {
      const row = await screen.findByTestId(`ticket-row-TKT-2026-0020${i}`);
      const badge = within(row).getByTestId("badge-status");
      expect(badge, status).toHaveTextContent(new RegExp(`^${STATUS_TEXT[status]}$`));
      expect(badge, status).toHaveClass(`zg-badge--status-${kebab(status)}`);
    }
  });

  it("colours each status with the ui-spec 7.1 tokens", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    for (const [status, [background, text, border]] of Object.entries(TOKENS)) {
      const body = ruleBody(css, new RegExp(`\\.zg-badge--status-${kebab(status)}(?![\\w-])`));
      expect(body, status).toMatch(new RegExp(`background:\\s*var\\(${background}\\)`));
      expect(body, status).toMatch(new RegExp(`color:\\s*var\\(${text}\\)`));
      if (border === null) expect(body, status).not.toMatch(/border:/);
      else expect(body, status).toMatch(new RegExp(`border:\\s*1px solid var\\(${border}\\)`));
    }
  });
});

describe("STY-02 (AC-65) - IT Priority badge", () => {
  it("renders each IT Priority in the queue as text plus a distinct glyph", async () => {
    const priorities: [string, string][] = [
      ["LOW", "Low"],
      ["MEDIUM", "Medium"],
      ["HIGH", "High"],
      ["URGENT", "Urgent"],
    ];
    const items = priorities.map(([itPriority], i) => queueItem(`TKT-2026-0030${i}`, { itPriority }));
    fakeApi(queueRoutes(queuePage(items)));
    mockStartupSession(IT_STAFF);
    renderApp("/staff/queue");

    const glyphs = new Set<string>();
    for (const [i, [priority, text]] of priorities.entries()) {
      const row = await screen.findByTestId(`queue-row-TKT-2026-0030${i}`);
      const badge = within(row).getByTestId("badge-it-priority");
      const [glyph, ...rest] = (badge.textContent ?? "").trim().split(/\s+/);
      expect(rest.join(" "), priority).toBe(text);
      expect(glyph, `${priority} needs a leading glyph`).toMatch(/^[○◔◑●]$/);
      expect(badge, priority).toHaveClass(`zg-badge--priority-${priority.toLowerCase()}`);
      glyphs.add(glyph);
    }
    expect(glyphs.size).toBe(4);
  });
});

describe("STY-03 (AC-65) - role badge", () => {
  it.each([
    [REQUESTER, "Requester", "/tickets"],
    [IT_STAFF, "IT Staff", "/staff/queue"],
    [ADMINISTRATOR, "Administrator", "/staff/queue"],
  ] as [CurrentUser, string, string][])("renders the %s role as text", async (user, text, path) => {
    cleanup();
    if (user.role === "REQUESTER") mockRequesterScreens();
    mockStartupSession(user);

    renderApp(path);

    const badge = await screen.findByTestId("badge-role");
    expect(badge).toHaveTextContent(new RegExp(`^${text}$`));
    expect(badge).toHaveAttribute("data-role", user.role);
  });

  it("colours each role with the ui-spec 7.3 tokens", () => {
    const css = readFileSync(STYLESHEET, "utf8");

    const expected: [string, string, string][] = [
      ["requester", "--zg-readonly-bg", "--zg-text-muted"],
      ["it-staff", "--zg-pale", "--zg-primary"],
      ["administrator", "--zg-primary", "--zg-surface"],
    ];
    for (const [role, background, text] of expected) {
      const body = ruleBody(css, new RegExp(`\\.zg-badge--role-${role}`));
      expect(body, role).toMatch(new RegExp(`background:\\s*var\\(${background}\\)`));
      expect(body, role).toMatch(new RegExp(`color:\\s*var\\(${text}\\)`));
    }
  });

  it("gives the Administrator badge in the header a 1px surface border", async () => {
    mockStartupSession(ADMINISTRATOR);
    renderApp("/staff/queue");

    const badge = await screen.findByTestId("badge-role");
    expect(badge).toHaveClass("zg-badge--role-administrator");
    expect(badge.closest(".zg-header"), "the badge sits in the header").not.toBeNull();

    const css = readFileSync(STYLESHEET, "utf8");
    const body = ruleBody(css, /\.zg-header \.zg-badge--role-administrator/);
    expect(body).toMatch(/border:\s*1px solid var\(--zg-surface\)/);
  });
});

describe("STY-04 (AC-50) - note vs comment", () => {
  const NOTE_LABEL = "Internal note — not visible to Requester";
  const comment = entry("c0000000-0000-4000-8000-000000000001", "Public reply.");
  const note = entry("n0000000-0000-4000-8000-000000000001", "Private working note.");

  async function openStaffDetail() {
    fakeApi(staffRoutes(staffTicket(), [comment], [note]));
    mockStartupSession(IT_STAFF);
    renderApp(`/staff/tickets/${TICKET_ID}`);
    return screen.findByTestId(`comment-item-${comment.id}`);
  }

  it("styles note items with the warning background, a 3px warning left border, and the text label", async () => {
    await openStaffDetail();
    await userEvent.click(screen.getByTestId("tab-notes"));

    const item = screen.getByTestId(`note-item-${note.id}`);
    expect(item).toHaveClass("zg-note-item");
    const label = within(item).getByText(NOTE_LABEL);
    expect(label).toHaveClass("zg-note-label");
    // The label sits above the author line (ui-spec 8).
    expect(label.compareDocumentPosition(within(item).getByText(IT_STAFF.fullName)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const css = readFileSync(STYLESHEET, "utf8");
    const body = ruleBody(css, /\.zg-note-item/);
    expect(body).toMatch(/background:\s*var\(--zg-warning-bg\)/);
    expect(body).toMatch(/border-left:\s*3px solid var\(--zg-warning\)/);
    const labelBody = ruleBody(css, /\.zg-note-label/);
    expect(labelBody).toMatch(/color:\s*var\(--zg-warning\)/);
    expect(labelBody).toMatch(/font-weight:\s*600/);
  });

  it("styles comment items on the surface, so the two backgrounds differ", async () => {
    const item = await openStaffDetail();
    expect(item).toHaveClass("zg-comment-item");
    expect(item).not.toHaveClass("zg-note-item");

    const css = readFileSync(STYLESHEET, "utf8");
    const commentBody = ruleBody(css, /\.zg-comment-item/);
    expect(commentBody).toMatch(/background:\s*var\(--zg-surface\)/);
    expect(commentBody).toMatch(/border:\s*1px solid var\(--zg-border\)/);
    expect(commentBody).toMatch(/border-radius:\s*var\(--zg-radius-lg\)/);

    const background = (rule: string) => /background:\s*([^;]+);/.exec(rule)?.[1];
    expect(background(commentBody)).not.toBe(background(ruleBody(css, /\.zg-note-item/)));
  });
});

// ---------------------------------------------------------------------------
// STY-05 to STY-09 (#47). The six Lab 3 screens, each rendered through the real
// route tree with the API faked at fetch().

const NOTE_ID = "n0000000-0000-4000-8000-000000000002";
const COMMENT_ID = "c0000000-0000-4000-8000-000000000002";

const LAB3_USERS = [ADMINISTRATOR, IT_STAFF, REQUESTER].map((u) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  role: u.role,
  isActive: true,
  mustChangePassword: false,
  createdAt: "2026-09-01T13:24:07.512Z",
  updatedAt: "2026-09-01T13:24:07.512Z",
}));

type Lab3Screen = { name: string; open: () => Promise<void> };

const LAB3_SCREENS: Lab3Screen[] = [
  {
    name: "Login",
    open: async () => {
      mockStartupSession(null);
      renderApp("/login");
      await screen.findByTestId("login-screen");
    },
  },
  {
    name: "Change Password",
    open: async () => {
      mockStartupSession(MUST_CHANGE);
      renderApp("/change-password");
      await screen.findByTestId("change-password-screen");
    },
  },
  {
    name: "Requester Ticket Detail",
    open: async () => {
      fakeApi(requesterRoutes(requesterTicket(), [entry(COMMENT_ID, "Please restart with the charger connected.")]));
      mockStartupSession(REQUESTER);
      renderApp(`/tickets/${TICKET_ID}`);
      await screen.findByTestId(`comment-item-${COMMENT_ID}`);
    },
  },
  {
    name: "Ticket Queue",
    open: async () => {
      fakeApi(queueRoutes());
      mockStartupSession(IT_STAFF);
      renderApp("/staff/queue");
      await screen.findByTestId(`queue-row-${TICKET_NUMBER}`);
    },
  },
  {
    name: "Staff Ticket Detail",
    open: async () => {
      fakeApi(staffRoutes(staffTicket(), [entry(COMMENT_ID, "Public reply.")], [entry(NOTE_ID, "Private note.")]));
      mockStartupSession(IT_STAFF);
      renderApp(`/staff/tickets/${TICKET_ID}`);
      await screen.findByTestId(`comment-item-${COMMENT_ID}`);
    },
  },
  {
    name: "User Management",
    open: async () => {
      fakeApi({ "GET /admin/users": ok(LAB3_USERS) });
      mockStartupSession(ADMINISTRATOR);
      renderApp("/admin/users");
      await screen.findByTestId(`user-row-${IT_STAFF.email}`);
    },
  },
];

const screenCases = LAB3_SCREENS.map((s) => [s.name, s] as const);

/** Controls a keyboard user can reach, in DOM order. */
function tabbable(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")).filter(
    (el) => {
      if ((el as HTMLButtonElement).disabled) return false;
      if (el.getAttribute("tabindex") === "-1") return false;
      if (el instanceof HTMLInputElement && el.type === "hidden") return false;
      return true;
    },
  );
}

describe("STY-05 (ui-spec 2) - at most one visible primary button", () => {
  it.each(screenCases)("%s", async (_name, lab3Screen) => {
    cleanup();
    await lab3Screen.open();
    expect(document.querySelectorAll(".zg-btn--primary").length).toBeLessThanOrEqual(1);
  });

  it("Staff Ticket Detail has exactly one primary in each composer tab", async () => {
    await LAB3_SCREENS[4].open();
    let primaries = document.querySelectorAll(".zg-btn--primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveAttribute("data-testid", "btn-post-comment");

    await userEvent.click(screen.getByTestId("tab-notes"));
    primaries = document.querySelectorAll(".zg-btn--primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveAttribute("data-testid", "btn-post-note");
  });
});

describe("STY-06 (AC-66) - token conformance", () => {
  const L2_SPEC = "../docs/lab-02/ui-spec.md";
  const tokenTable = () => readFileSync(L2_SPEC, "utf8").split("### 1.1 Colour")[1].split("### 1.2")[0];
  const allowedHex = () => new Set((tokenTable().match(/#[0-9A-Fa-f]{6}/g) ?? []).map((h) => h.toUpperCase()));
  const toHex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

  it("defines every colour token in the L2 1.1 table with the table's value", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    const rows = [...tokenTable().matchAll(/\|\s*`(--zg-[a-z-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`/g)];
    expect(rows.length).toBeGreaterThan(15);
    for (const [, token, hex] of rows) {
      expect(css, token).toMatch(new RegExp(`${token}:\\s*${hex}\\s*;`, "i"));
    }
  });

  it("uses no rgb() or rgba() colour whose base is outside the table, and no named colour", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    const allowed = allowedHex();
    for (const [, r, g, b] of css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      const hex = toHex(Number(r), Number(g), Number(b));
      expect(allowed.has(hex), `rgb base ${hex} is not a ui-spec token`).toBe(true);
    }
    // Colour properties take tokens, transparent, inherit, or currentColor; never a keyword colour.
    const declarations = [
      ...css.matchAll(/(?:^|[;{\s])((?:background|color|border(?:-[a-z]+)*|outline|box-shadow|fill|stroke)):\s*([^;}]+)/g),
    ];
    expect(declarations.length).toBeGreaterThan(50);
    const NAMED = /\b(red|blue|green|black|white|gray|grey|orange|yellow|purple|pink|brown|navy|silver|maroon|teal|lime|olive|aqua|fuchsia)\b/i;
    for (const [, property, value] of declarations) {
      expect(NAMED.test(value), `${property}: ${value.trim()}`).toBe(false);
    }
  });

  it("references only --zg- custom properties the stylesheet defines", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    const defined = new Set([...css.matchAll(/(--zg-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...css.matchAll(/var\((--zg-[a-z0-9-]+)/g)].map((m) => m[1]));
    expect([...used].filter((t) => !defined.has(t))).toEqual([]);
  });

  it.each(screenCases)("%s sets no colour inline", async (_name, lab3Screen) => {
    cleanup();
    await lab3Screen.open();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[style]"))) {
      expect(el.getAttribute("style"), el.outerHTML.slice(0, 80)).not.toMatch(/colou?r|background|border|#[0-9a-f]{3}|rgb/i);
    }
  });
});

describe("STY-07 (AC-67) - focus ring and dialogs", () => {
  it("never removes the outline, and rings buttons, fields, tabs, and navigation links", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
    for (const selector of [/\.zg-btn:focus-visible/, /\.zg-field:focus-visible/, /\.zg-tab:focus-visible/, /\.zg-nav-link:focus-visible/]) {
      expect(ruleBody(css, selector), selector.source).toMatch(/outline:\s*3px solid var\(--zg-focus-ring\)/);
    }
  });

  it.each(screenCases)("%s: every control takes focus", async (_name, lab3Screen) => {
    cleanup();
    await lab3Screen.open();
    const controls = tabbable();
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      control.focus();
      expect(control, control.outerHTML.slice(0, 80)).toHaveFocus();
    }
  });

  /** Tab and Shift+Tab never leave the dialog; Escape closes it and focus returns. */
  async function expectTrapped(dialogTestId: string, trigger: HTMLElement) {
    const user = userEvent.setup({ delay: null });
    const dialog = await screen.findByTestId(dialogTestId);
    for (let i = 0; i < 12; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement), `Tab ${i + 1} left the dialog`).toBe(true);
    }
    for (let i = 0; i < 12; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `Shift+Tab ${i + 1} left the dialog`).toBe(true);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId(dialogTestId)).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  }

  it("traps focus in the Staff Detail confirmation dialog", async () => {
    await LAB3_SCREENS[4].open();
    const trigger = screen.getByTestId("btn-transition-CANCELLED");
    await userEvent.click(trigger);
    await expectTrapped("confirm-dialog", trigger);
  });

  it("traps focus in the Requester appears-resolved dialog", async () => {
    await LAB3_SCREENS[2].open();
    const trigger = screen.getByTestId("btn-appears-resolved");
    await userEvent.click(trigger);
    await expectTrapped("confirm-dialog", trigger);
  });

  it("traps focus in the user dialog", async () => {
    await LAB3_SCREENS[5].open();
    const trigger = screen.getByTestId("btn-create-user");
    await userEvent.click(trigger);
    await expectTrapped("user-dialog", trigger);
  });

  it("traps focus in the set-new-initial-password dialog over the user dialog", async () => {
    await LAB3_SCREENS[5].open();
    await userEvent.click(screen.getByRole("button", { name: `Edit ${IT_STAFF.fullName}` }));
    const trigger = await screen.findByTestId("btn-set-initial-password");
    await userEvent.click(trigger);
    await expectTrapped("confirm-dialog", trigger);
    expect(screen.getByTestId("user-dialog")).toBeInTheDocument();
  });
});

describe("STY-08 (AC-67) - keyboard reach", () => {
  it.each(screenCases)("%s: Tab reaches every control in document order", async (_name, lab3Screen) => {
    cleanup();
    await lab3Screen.open();
    const user = userEvent.setup({ delay: null });
    const expected = tabbable();
    // No positive tabindex: one would pull a control out of reading order.
    for (const el of expected) expect(Number(el.getAttribute("tabindex") ?? 0)).toBeLessThanOrEqual(0);

    (document.activeElement as HTMLElement | null)?.blur();
    const reached: Element[] = [];
    for (let i = 0; i < expected.length; i += 1) {
      await user.tab();
      reached.push(document.activeElement!);
    }
    const describe = (el: Element) => el.outerHTML.slice(0, 70);
    expect(reached.map(describe)).toEqual(expected.map(describe));
  });

  it("moves between the Staff Detail tabs with the arrow keys", async () => {
    await LAB3_SCREENS[4].open();
    const user = userEvent.setup({ delay: null });
    const comments = screen.getByTestId("tab-comments");
    const notes = screen.getByTestId("tab-notes");
    comments.focus();

    await user.keyboard("{ArrowRight}");
    expect(notes).toHaveFocus();
    expect(notes).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-notes");

    await user.keyboard("{ArrowLeft}");
    expect(comments).toHaveFocus();
    expect(comments).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-comments");
  });
});

describe("STY-09 (AC-68) - callout variants", () => {
  const STATUS_OR_CODE = /\b[1-5]\d\d\b|[A-Z]{3,}_[A-Z_]+/;

  function expectSafeCallout(el: HTMLElement, variant: string) {
    expect(el).toHaveClass(`zg-callout--${variant}`);
    const icon = el.querySelector(".zg-callout-icon");
    expect(icon, `${variant} icon`).not.toBeNull();
    expect((icon!.textContent ?? "").trim().length, `${variant} icon glyph`).toBeGreaterThan(0);
    const text = (el.textContent ?? "").replace(icon!.textContent ?? "", "").trim();
    expect(text.length, `${variant} text`).toBeGreaterThan(10);
    expect(text, `${variant} shows no status code or error code`).not.toMatch(STATUS_OR_CODE);
  }

  it("renders the forbidden state with text, an icon, and no code", async () => {
    mockStartupSession(REQUESTER);
    mockRequesterScreens();
    renderApp("/staff/queue");
    expectSafeCallout(await screen.findByTestId("state-forbidden"), "forbidden");
  });

  it("renders the not-found state with text, an icon, and no code", async () => {
    fakeApi({ ...staffRoutes(), [`GET /staff/tickets/${TICKET_ID}`]: failure(404, "NOT_FOUND", "Ticket not found.") });
    mockStartupSession(IT_STAFF);
    renderApp(`/staff/tickets/${TICKET_ID}`);
    expectSafeCallout(await screen.findByTestId("state-not-found"), "forbidden");
  });

  it("renders the conflict callout with text, an icon, and no code", async () => {
    fakeApi({
      ...staffRoutes(staffTicket({ owner: null, currentStatus: "NEW", availableTransitions: ["CANCELLED"] })),
      [`POST /staff/tickets/${TICKET_ID}/claim`]: failure(409, "TICKET_ALREADY_CLAIMED", "This ticket has already been claimed."),
    });
    mockStartupSession(IT_STAFF);
    renderApp(`/staff/tickets/${TICKET_ID}`);
    await userEvent.click(await screen.findByTestId("btn-claim"));
    expectSafeCallout(await screen.findByTestId("callout-conflict"), "conflict");
  });

  it("renders the error callout with text, an icon, and no code", async () => {
    fakeApi({ ...staffRoutes(), [`GET /staff/tickets/${TICKET_ID}`]: failure(500, "INTERNAL_ERROR", "Stack: at db.ts:42") });
    mockStartupSession(IT_STAFF);
    renderApp(`/staff/tickets/${TICKET_ID}`);
    const error = await screen.findByTestId("callout-error");
    expectSafeCallout(error, "error");
    expect(error).not.toHaveTextContent("db.ts");
  });

  it("gives forbidden (also not found) and conflict a background and border different from error", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    const paint = (variant: string) => {
      const body = ruleBody(css, new RegExp(`\\.zg-callout--${variant}(?![\\w-])`));
      return {
        background: /background:\s*([^;]+);/.exec(body)?.[1],
        border: /border-left-color:\s*([^;]+);/.exec(body)?.[1],
      };
    };
    const error = paint("error");
    expect(error).toEqual({ background: "var(--zg-error-bg)", border: "var(--zg-error)" });
    // ui-spec 5.1 gives forbidden and not found the same tokens.
    expect(paint("forbidden")).toEqual({ background: "var(--zg-readonly-bg)", border: "var(--zg-text-muted)" });
    expect(paint("conflict")).toEqual({ background: "var(--zg-warning-bg)", border: "var(--zg-warning)" });
    for (const variant of ["forbidden", "conflict"]) {
      expect(paint(variant).background, `${variant} background`).not.toBe(error.background);
      expect(paint(variant).border, `${variant} border`).not.toBe(error.border);
    }
  });
});
