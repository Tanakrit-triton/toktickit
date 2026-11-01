import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IT_STAFF, ADMINISTRATOR, REQUESTER, mockStartupSession, renderApp } from "../lab-03/helpers.js";
import { failure, fakeApi, ok } from "../lab-03/ticket-fixtures.js";
import {
  EMPTY_REQUESTER_DASHBOARD,
  REQUESTER_DASHBOARD_PATH,
  WINDOW_LINE,
  listItem,
  requesterDashboard,
} from "./dashboard-fixtures.js";

// UI-05 to UI-07 from docs/lab-04/tests.md section 2.7: the Requester
// Dashboard (ui-spec.md sections 3.1, 3.2, 3.4) against a mocked
// api-spec.md section 5.1 response.

const ROUTE = "/dashboard";

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function open(reply: Parameters<typeof fakeApi>[0][string]) {
  const api = fakeApi({ [REQUESTER_DASHBOARD_PATH]: reply });
  mockStartupSession(REQUESTER);
  renderApp(ROUTE);
  await screen.findByTestId("requester-dashboard-screen");
  return api;
}

// The cards that have a link. Updated recently and Resolved recently have
// `link: null` (Amendment 7) and are covered by the describe block below.
const LINKED_CARDS = [
  ["openTickets", "Open tickets", 3, "/tickets?statusGroup=ACTIVE"],
  ["waitingForMe", "Waiting for you", 1, "/tickets?status=WAITING_FOR_REQUESTER"],
] as const;

const CARDS = ["openTickets", "waitingForMe", "updatedRecently", "resolvedRecently"] as const;

describe("UI-05 (AC-24, AC-28) - populated Requester Dashboard", () => {
  it("shows the title, then the window line, then four cards in order", async () => {
    await open(ok(requesterDashboard()));
    await screen.findByTestId("metric-openTickets");

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-window")).toHaveTextContent(WINDOW_LINE);

    const cards = CARDS.map((key) => screen.getByTestId(`metric-${key}`));
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i - 1].compareDocumentPosition(cards[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it.each(LINKED_CARDS)("renders %s as one link named \"{Label}: {n}. View list\" to the server's link", async (key, label, count, link) => {
    await open(ok(requesterDashboard()));
    const card = await screen.findByRole("link", { name: `${label}: ${count}. View list` });

    expect(card).toHaveAttribute("data-testid", `metric-${key}`);
    expect(card).toHaveAttribute("href", link);
    expect(screen.getByTestId(`metric-value-${key}`)).toHaveTextContent(String(count));
    expect(card).toHaveTextContent(label);
    expect(card).toHaveTextContent("View list →");
  });

  it("shows the three lists, each item a link to Requester Ticket Detail with its status as text", async () => {
    await open(ok(requesterDashboard()));
    await screen.findByTestId("metric-openTickets");

    const lists = [
      ["needsAttention", "Needs your attention", listItem(5, "WAITING_FOR_REQUESTER"), "Waiting for Requester"],
      ["recentlyUpdated", "Recently updated", listItem(6, "IN_PROGRESS"), "In Progress"],
      ["recentlyResolved", "Recently resolved", listItem(7, "RESOLVED"), "Resolved"],
    ] as const;

    for (const [key, title, item, statusLabel] of lists) {
      const list = screen.getByTestId(`list-${key}`);
      expect(within(list).getByRole("heading", { level: 2 }), key).toHaveTextContent(title);

      const row = screen.getByTestId(`list-item-${key}-${item.id}`);
      expect(row.closest("a") ?? row, key).toHaveAttribute("href", `/tickets/${item.id}`);
      expect(row, key).toHaveTextContent(item.ticketNumber);
      expect(row, key).toHaveTextContent(item.summary);
      expect(within(row).getByTestId("badge-status"), key).toHaveTextContent(statusLabel);
    }
    expect(within(screen.getByTestId("list-recentlyUpdated")).getAllByRole("link")).toHaveLength(2);
  });

  it("shows no Create a ticket link to a Requester who has tickets, and no primary button", async () => {
    await open(ok(requesterDashboard()));
    await screen.findByTestId("metric-openTickets");

    expect(screen.queryByRole("link", { name: "Create a ticket" })).not.toBeInTheDocument();
    expect(screen.getByTestId("requester-dashboard-screen").querySelector(".zg-btn--primary")).toBeNull();
  });
});

describe("UI-05 (AC-28, Amendment 7) - Requester cards without a drill-down", () => {
  it("renders Updated recently and Resolved recently with link null as sections with no link and no View list", async () => {
    // The shared fixture follows api-spec 5.1 after Amendment 7: both links are null.
    const data = requesterDashboard();
    expect(data.metrics.updatedRecently.link).toBeNull();
    expect(data.metrics.resolvedRecently.link).toBeNull();
    await open(ok(data));
    await screen.findByTestId("metric-openTickets");

    for (const [key, label, count] of [
      ["updatedRecently", "Updated recently", 2],
      ["resolvedRecently", "Resolved recently", 1],
    ] as const) {
      const card = screen.getByTestId(`metric-${key}`);
      expect(card.tagName, key).toBe("SECTION");
      expect(card, key).not.toHaveAttribute("href");
      expect(within(card).queryByRole("link"), key).not.toBeInTheDocument();
      expect(card, key).not.toHaveTextContent(/View list/);
      expect(card, key).toHaveTextContent(label);
      expect(screen.getByTestId(`metric-value-${key}`), key).toHaveTextContent(String(count));
    }

    // The cards that keep a link are unchanged.
    expect(screen.getByRole("link", { name: "Open tickets: 3. View list" })).toHaveAttribute("href", "/tickets?statusGroup=ACTIVE");
    expect(screen.getByRole("link", { name: "Waiting for you: 1. View list" })).toHaveAttribute(
      "href",
      "/tickets?status=WAITING_FOR_REQUESTER",
    );
  });
});

describe("UI-06 (AC-27) - all-zero Requester Dashboard", () => {
  it("shows 0 with each card's empty message and each list's empty message", async () => {
    await open(ok(EMPTY_REQUESTER_DASHBOARD()));
    await screen.findByTestId("metric-openTickets");

    const empty = {
      openTickets: "No open tickets.",
      waitingForMe: "Nothing is waiting for you.",
      updatedRecently: "No updates this week.",
      resolvedRecently: "Nothing resolved this week.",
    };
    for (const [key, message] of Object.entries(empty)) {
      expect(screen.getByTestId(`metric-value-${key}`), key).toHaveTextContent("0");
      expect(screen.getByTestId(`metric-${key}`), key).toHaveTextContent(message);
    }

    expect(screen.getByTestId("list-needsAttention")).toHaveTextContent("No tickets need your attention.");
    expect(screen.getByTestId("list-recentlyUpdated")).toHaveTextContent("No recent updates.");
    expect(screen.getByTestId("list-recentlyResolved")).toHaveTextContent("No recently resolved tickets.");
  });

  it("offers a secondary Create a ticket link, not a primary button", async () => {
    await open(ok(EMPTY_REQUESTER_DASHBOARD()));

    const link = await screen.findByRole("link", { name: "Create a ticket" });
    expect(link).toHaveAttribute("href", "/tickets/new");
    expect(link).not.toHaveClass("zg-btn--primary");
  });
});

describe("UI-07 (AC-30) - loading, failure, and forbidden", () => {
  it("shows skeleton cards with aria-busy while the request is pending", async () => {
    await open(() => new Promise(() => {}));

    expect(screen.getByTestId("requester-dashboard-screen")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("skeleton-card").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByTestId("metric-openTickets")).not.toBeInTheDocument();
  });

  it("shows the safe error callout on a 500, and Retry refetches", async () => {
    let calls = 0;
    const api = await open(() => {
      calls += 1;
      return calls === 1 ? failure(500, "INTERNAL_ERROR", "stack trace here") : ok(requesterDashboard());
    });

    const callout = await screen.findByTestId("state-dashboard-failed");
    expect(callout).toHaveTextContent("We couldn't load the dashboard. Please try again.");
    expect(callout).not.toHaveTextContent(/500|INTERNAL_ERROR|stack/);

    await userEvent.click(within(callout).getByRole("button", { name: "Retry" }));

    await screen.findByTestId("metric-openTickets");
    expect(api.callsTo("GET", "/dashboard/requester")).toHaveLength(2);
  });

  it("shows the shared forbidden state on a 403", async () => {
    await open(failure(403, "FORBIDDEN", "You do not have access to this resource."));
    expect(await screen.findByTestId("state-forbidden")).toBeInTheDocument();
  });

  it.each([
    ["IT Staff", IT_STAFF],
    ["Administrator", ADMINISTRATOR],
  ] as const)("shows the forbidden state to %s before any dashboard request is made", async (_role, user) => {
    const api = fakeApi({ [REQUESTER_DASHBOARD_PATH]: ok(requesterDashboard()) });
    mockStartupSession(user);
    renderApp(ROUTE);

    expect(await screen.findByTestId("state-forbidden")).toBeInTheDocument();
    expect(api.callsTo("GET", "/dashboard/requester")).toHaveLength(0);
  });
});
