import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUser } from "../../src/lab-03/auth-api.js";
import { ADMINISTRATOR, IT_STAFF, REQUESTER, mockStartupSession, renderApp } from "../lab-03/helpers.js";
import { failure, fakeApi, ok } from "../lab-03/ticket-fixtures.js";
import {
  ACTION_ID,
  ACTION_TICKET_ID,
  ADMIN_USERS,
  PRIORITY_ORDER,
  STAFF_DASHBOARD_PATH,
  STATUS_ORDER,
  WINDOW_LINE,
  ZERO_STAFF_DASHBOARD,
  listItem,
  staffDashboard,
} from "./dashboard-fixtures.js";

// UI-01 to UI-04 from docs/lab-04/tests.md section 2.7: the IT Staff
// Dashboard (ui-spec.md sections 3.1, 3.3, 3.4) against a mocked
// api-spec.md section 5.2 response.

const ROUTE = "/staff/dashboard";

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function open(reply: Parameters<typeof fakeApi>[0][string], user: CurrentUser = IT_STAFF) {
  const api = fakeApi({ [STAFF_DASHBOARD_PATH]: reply });
  mockStartupSession(user);
  renderApp(ROUTE);
  await screen.findByTestId("staff-dashboard-screen");
  return api;
}

async function openPopulated(data = staffDashboard(), user: CurrentUser = IT_STAFF) {
  const api = await open(ok(data), user);
  await screen.findByTestId("metric-unassigned");
  return api;
}

describe("UI-01 (AC-28) - populated Staff Dashboard", () => {
  it("shows the title and the Bangkok window line", async () => {
    await openPopulated();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-window")).toHaveTextContent(WINDOW_LINE);
  });

  it("shows each metric value, and each card with a link is one link to that link", async () => {
    await openPopulated();

    expect(screen.getByTestId("metric-value-unassigned")).toHaveTextContent("2");
    expect(screen.getByTestId("metric-value-ownedByMe")).toHaveTextContent("3");
    expect(screen.getByTestId("metric-value-myOpenActions")).toHaveTextContent("1");

    const unassigned = screen.getByTestId("metric-unassigned");
    expect(unassigned.tagName).toBe("A");
    expect(unassigned).toHaveAttribute("href", "/staff/queue?owner=unassigned&statusGroup=ACTIVE");
    expect(unassigned).toHaveAccessibleName("Unassigned: 2. View list");

    const owned = screen.getByTestId("metric-ownedByMe");
    expect(owned).toHaveAttribute("href", "/staff/queue?owner=me&statusGroup=ACTIVE");
    expect(owned).toHaveAccessibleName("Owned by me: 3. View list");
  });

  it("renders a card whose link is null as a section with no link and no arrow", async () => {
    await openPopulated();

    const card = screen.getByTestId("metric-myOpenActions");
    expect(card.tagName).toBe("SECTION");
    expect(card).not.toHaveAttribute("href");
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent(/View list/);
  });

  it("shows all 8 statuses and all 4 IT Priorities in real tables, in the stated order, each linking to its queue filter", async () => {
    const data = staffDashboard();
    await openPopulated(data);

    const tables = screen.getAllByRole("table");
    expect(tables.length).toBeGreaterThanOrEqual(2);
    for (const table of tables) {
      expect(within(table).getAllByRole("columnheader").length).toBeGreaterThanOrEqual(2);
      for (const th of within(table).getAllByRole("columnheader")) expect(th).toHaveAttribute("scope", "col");
    }

    const statusLinks = STATUS_ORDER.map((s) => screen.getByTestId(`status-count-${s}`));
    statusLinks.forEach((link, i) => {
      const entry = data.byStatus[i];
      expect(link).toHaveTextContent(String(entry.count));
      expect(link.closest("a") ?? link).toHaveAttribute("href", entry.link);
    });
    // Document order is the lifecycle order.
    for (let i = 1; i < statusLinks.length; i++) {
      expect(statusLinks[i - 1].compareDocumentPosition(statusLinks[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    const priorityLinks = PRIORITY_ORDER.map((p) => screen.getByTestId(`priority-count-${p}`));
    priorityLinks.forEach((link, i) => {
      const entry = data.activeByItPriority[i];
      expect(link).toHaveTextContent(String(entry.count));
      expect(link.closest("a") ?? link).toHaveAttribute("href", entry.link);
    });
  });

  it("lists my open actions linking to the ticket's Actions Taken, with the action status as text", async () => {
    await openPopulated();

    const list = screen.getByTestId("list-myOpenActions");
    expect(within(list).getByRole("heading", { level: 2 })).toHaveTextContent("My open actions");
    const item = screen.getByTestId(`list-item-myOpenActions-${ACTION_ID}`);
    expect(item.closest("a") ?? item).toHaveAttribute("href", `/staff/tickets/${ACTION_TICKET_ID}#actions`);
    expect(item).toHaveTextContent("TKT-2026-00004");
    expect(item).toHaveTextContent("Collect diagnostic logs from the printer");
    const badge = within(item).getByTestId("badge-action-status");
    expect(badge).toHaveAttribute("data-status", "PLANNED");
    expect(badge).toHaveTextContent("Planned");
  });

  it("lists urgent tickets with the owner or Unassigned, and recently updated tickets, each linking to Staff Ticket Detail", async () => {
    await openPopulated();

    const unowned = listItem(8, "OPEN");
    const owned = listItem(9, "IN_PROGRESS");

    const urgentUnowned = screen.getByTestId(`list-item-urgent-${unowned.id}`);
    expect(urgentUnowned.closest("a") ?? urgentUnowned).toHaveAttribute("href", `/staff/tickets/${unowned.id}`);
    expect(urgentUnowned).toHaveTextContent(unowned.ticketNumber);
    expect(urgentUnowned).toHaveTextContent(unowned.summary);
    expect(urgentUnowned).toHaveTextContent("Unassigned");

    const urgentOwned = screen.getByTestId(`list-item-urgent-${owned.id}`);
    expect(urgentOwned).toHaveTextContent("Wichai Prasert");

    const recent = screen.getByTestId(`list-item-recentlyUpdated-${owned.id}`);
    expect(recent.closest("a") ?? recent).toHaveAttribute("href", `/staff/tickets/${owned.id}`);
    expect(within(recent).getByTestId("badge-status")).toHaveTextContent("In Progress");

    expect(within(screen.getByTestId("list-urgent")).getByRole("heading", { level: 2 })).toHaveTextContent("Urgent and active");
    expect(within(screen.getByTestId("list-recentlyUpdated")).getByRole("heading", { level: 2 })).toHaveTextContent("Recently updated");
  });

  it("offers no primary button: the dashboard navigates, it does not act", async () => {
    await openPopulated();
    expect(screen.getByTestId("staff-dashboard-screen").querySelector(".zg-btn--primary")).toBeNull();
  });
});

describe("UI-02 (AC-27) - all-zero Staff Dashboard", () => {
  it("shows 0 with the empty message on every card, zeros in both tables, and every list's empty message", async () => {
    await open(ok(ZERO_STAFF_DASHBOARD()));
    await screen.findByTestId("metric-unassigned");

    for (const key of ["unassigned", "ownedByMe", "myOpenActions"]) {
      expect(screen.getByTestId(`metric-value-${key}`), key).toHaveTextContent("0");
      expect(screen.getByTestId(`metric-${key}`), key).toHaveTextContent("None.");
    }
    for (const s of STATUS_ORDER) expect(screen.getByTestId(`status-count-${s}`), s).toHaveTextContent("0");
    for (const p of PRIORITY_ORDER) expect(screen.getByTestId(`priority-count-${p}`), p).toHaveTextContent("0");

    expect(screen.getByTestId("list-myOpenActions")).toHaveTextContent("You have no open actions.");
    expect(screen.getByTestId("list-urgent")).toHaveTextContent("No urgent tickets.");
    expect(screen.getByTestId("list-recentlyUpdated")).toHaveTextContent("No recent updates.");
  });
});

describe("UI-03 (AC-30) - loading, failure, and forbidden", () => {
  it("shows skeleton cards with aria-busy while the request is pending", async () => {
    await open(() => new Promise(() => {}));

    const screenEl = screen.getByTestId("staff-dashboard-screen");
    expect(screenEl).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("skeleton-card").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByTestId("metric-unassigned")).not.toBeInTheDocument();
  });

  it("shows the safe error callout on a 500, with no status code, and Retry refetches", async () => {
    let calls = 0;
    const api = await open(() => {
      calls += 1;
      return calls === 1 ? failure(500, "INTERNAL_ERROR", "Database exploded at line 42") : ok(staffDashboard());
    });

    const callout = await screen.findByTestId("state-dashboard-failed");
    expect(callout).toHaveAttribute("role", "alert");
    expect(callout).toHaveTextContent("We couldn't load the dashboard. Please try again.");
    expect(callout).not.toHaveTextContent(/500|INTERNAL_ERROR|exploded/);
    expect(screen.getByTestId("staff-dashboard-screen")).not.toHaveAttribute("aria-busy", "true");

    const retry = within(callout).getByRole("button", { name: "Retry" });
    expect(retry).toHaveClass("zg-btn--secondary");
    await userEvent.click(retry);

    await screen.findByTestId("metric-unassigned");
    expect(api.callsTo("GET", "/staff/dashboard")).toHaveLength(2);
    expect(screen.queryByTestId("state-dashboard-failed")).not.toBeInTheDocument();
  });

  it("shows the shared forbidden state on a 403", async () => {
    await open(failure(403, "FORBIDDEN", "You do not have access to this resource."));
    expect(await screen.findByTestId("state-forbidden")).toBeInTheDocument();
    expect(screen.queryByTestId("state-dashboard-failed")).not.toBeInTheDocument();
  });

  it("shows the forbidden state to a Requester before any dashboard request is made", async () => {
    const api = fakeApi({ [STAFF_DASHBOARD_PATH]: ok(staffDashboard()) });
    mockStartupSession(REQUESTER);
    renderApp(ROUTE);

    expect(await screen.findByTestId("state-forbidden")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Access denied" })).toBeInTheDocument();
    expect(api.callsTo("GET", "/staff/dashboard")).toHaveLength(0);
  });
});

describe("UI-04 (AC-29) - Administrator user accounts", () => {
  it("shows the User accounts card, with no link, only for the Administrator", async () => {
    await openPopulated(staffDashboard({ users: ADMIN_USERS }), ADMINISTRATOR);

    const card = screen.getByTestId("card-users");
    expect(card).toHaveTextContent("User accounts");
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(card.tagName).not.toBe("A");

    const row = (label: string) => within(card).getByText(label).closest("[data-testid^='users-']") as HTMLElement;
    expect(row("Requesters")).toHaveTextContent("5");
    expect(row("IT Staff")).toHaveTextContent("3");
    expect(row("Administrators")).toHaveTextContent("1");
    expect(row("Inactive")).toHaveTextContent("2");
  });

  it("shows no User accounts card to IT Staff, whose response has users null", async () => {
    await openPopulated(staffDashboard({ users: null }), IT_STAFF);
    await waitFor(() => expect(screen.getByTestId("metric-unassigned")).toBeInTheDocument());
    expect(screen.queryByTestId("card-users")).not.toBeInTheDocument();
  });
});
