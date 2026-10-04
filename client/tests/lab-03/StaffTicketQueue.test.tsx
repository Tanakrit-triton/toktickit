import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUser } from "../../src/lab-03/auth-api.js";
import { ADMINISTRATOR, IT_STAFF, mockStartupSession, renderApp } from "./helpers.js";
import {
  ASSIGNEES,
  TICKET_NUMBER,
  failure,
  fakeApi,
  queueItem,
  queuePage,
  queueRoutes,
} from "./ticket-fixtures.js";

// UI-21 to UI-26 from docs/lab-03/tests.md section 2.10: IT Staff Ticket
// Queue, ui-spec.md section 6.4, against api-spec.md section 5.1.

const QUEUE = "/staff/queue";
const DEFAULT_PARAMS = { page: "1", pageSize: "20" };

async function openQueue(api: ReturnType<typeof fakeApi>, user: CurrentUser = IT_STAFF) {
  mockStartupSession(user);
  renderApp(QUEUE);
  await screen.findByTestId("staff-queue-screen");
  return api;
}

/** The parameters of every GET /staff/tickets so far, oldest first. */
function queueRequests(api: ReturnType<typeof fakeApi>): Record<string, string>[] {
  return api.calls
    .filter((c) => c.method === "GET" && c.path.split("?")[0] === "/staff/tickets")
    .map((c) => Object.fromEntries(new URLSearchParams(c.path.split("?")[1] ?? "")));
}

function lastQueueRequest(api: ReturnType<typeof fakeApi>) {
  const requests = queueRequests(api);
  return requests[requests.length - 1];
}

/** Waits for the next queue request to carry `expected`. */
async function expectLastRequest(api: ReturnType<typeof fakeApi>, expected: Record<string, string>) {
  await waitFor(() => expect(lastQueueRequest(api)).toEqual(expected), { timeout: 2000 });
}

/** Two pages, so Next is enabled and a later change can be seen to return to page 1. */
const TWO_PAGES = () => queuePage([queueItem(TICKET_NUMBER)], { totalItems: 30 });

async function goToPage2(api: ReturnType<typeof fakeApi>) {
  await userEvent.click(await screen.findByTestId("btn-next-page"));
  await expectLastRequest(api, { ...DEFAULT_PARAMS, page: "2" });
  await screen.findByTestId(`queue-row-${TICKET_NUMBER}`);
}

function setViewport(isMobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isMobile && query.includes("max-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.matchMedia = originalMatchMedia;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = originalMatchMedia;
});

describe("UI-21 (AC-28) - queue rendering", () => {
  it.each([
    ["IT Staff", IT_STAFF],
    ["an Administrator", ADMINISTRATOR],
  ] as [string, CurrentUser][])("lists tickets in the seven columns for %s", async (_label, user) => {
    await openQueue(fakeApi(queueRoutes()), user);

    const table = await screen.findByTestId("queue-table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent?.trim());
    expect(headers).toEqual(["Ticket Number", "Summary", "Requester", "IT Priority", "Status", "Owner", "Last Updated"]);

    const row = screen.getByTestId(`queue-row-${TICKET_NUMBER}`);
    const link = within(row).getByRole("link", { name: TICKET_NUMBER });
    expect(link).toHaveAttribute("href", `/staff/tickets/q-${TICKET_NUMBER}`);
    expect(row).toHaveTextContent("Laptop battery drains within one hour");
    expect(row).toHaveTextContent("Napat Chaiwong");
    expect(row).toHaveTextContent(IT_STAFF.fullName);
    expect(within(row).getByTestId("badge-it-priority")).toHaveTextContent(/Urgent/);
    expect(within(row).getByTestId("badge-status")).toHaveAttribute("data-status", "IN_PROGRESS");
  });

  it("shows Unassigned for a ticket with no owner", async () => {
    const unowned = queueItem("TKT-2026-00043", { owner: null, currentStatus: "NEW" });
    await openQueue(fakeApi(queueRoutes(queuePage([unowned]))));

    const row = await screen.findByTestId("queue-row-TKT-2026-00043");
    expect(row).toHaveTextContent("Unassigned");
  });

  it("shows the title and the count line", async () => {
    await openQueue(fakeApi(queueRoutes(queuePage([queueItem(TICKET_NUMBER)], { totalItems: 37 }))));

    expect(screen.getByRole("heading", { level: 1, name: "Ticket Queue" })).toBeInTheDocument();
    expect(await screen.findByText("37 tickets")).toBeInTheDocument();
  });
});

describe("UI-22 (AC-29, AC-30, AC-31) - queue controls", () => {
  it("requests page 1 at size 20 with no filter and no sort by default", async () => {
    const api = await openQueue(fakeApi(queueRoutes()));
    await expectLastRequest(api, DEFAULT_PARAMS);
  });

  it("sends the trimmed search as q after the debounce, and returns to page 1", async () => {
    const api = await openQueue(fakeApi(queueRoutes(TWO_PAGES())));
    await goToPage2(api);

    await userEvent.type(screen.getByTestId("field-search"), "  battery ");
    await expectLastRequest(api, { ...DEFAULT_PARAMS, q: "battery" });
    expect(screen.getByTestId("field-search")).toHaveAttribute("placeholder", "Search number, summary, or requester");
  });

  it("offers the ui-spec 6.4 options in each filter", async () => {
    await openQueue(fakeApi(queueRoutes()));
    await waitFor(() => expect(screen.getByTestId("filter-category")).toHaveTextContent("Hardware"));
    await waitFor(() => expect(screen.getByTestId("filter-owner")).toHaveTextContent(ASSIGNEES[0].fullName));

    const options = (testId: string) =>
      Array.from(screen.getByTestId(testId).querySelectorAll("option")).map((o) => o.textContent);
    expect(options("filter-status")).toEqual([
      "All statuses",
      "New",
      "Open",
      "In Progress",
      "Waiting for Requester",
      "Resolved",
      "Closed",
      "Reopened",
      "Cancelled",
    ]);
    expect(options("filter-it-priority")).toEqual(["All priorities", "Low", "Medium", "High", "Urgent"]);
    expect(options("filter-category")).toEqual(["All categories", "Account and Access", "Hardware"]);
    expect(options("filter-owner")).toEqual(["Anyone", "Assigned to me", "Unassigned", ...ASSIGNEES.map((a) => a.fullName)]);
    expect(options("sort-select")).toEqual([
      "Priority: Urgent first",
      "Oldest first",
      "Newest first",
      "Recently updated",
      "Ticket Number A–Z",
      "Status",
    ]);
  });

  it.each([
    ["filter-status", "In Progress", { status: "IN_PROGRESS" }],
    ["filter-it-priority", "Urgent", { itPriority: "URGENT" }],
    ["filter-category", "Hardware", { categoryId: "2" }],
    ["filter-owner", "Assigned to me", { owner: "me" }],
    ["filter-owner", "Unassigned", { owner: "unassigned" }],
    ["filter-owner", ASSIGNEES[0].fullName, { owner: ASSIGNEES[0].id }],
  ] as [string, string, Record<string, string>][])("%s = %s sends %o and returns to page 1", async (testId, label, params) => {
    const api = await openQueue(fakeApi(queueRoutes(TWO_PAGES())));
    await waitFor(() => expect(screen.getByTestId(testId)).toHaveTextContent(label));
    await goToPage2(api);

    await userEvent.selectOptions(screen.getByTestId(testId), label);
    await expectLastRequest(api, { ...DEFAULT_PARAMS, ...params });
  });

  it.each([
    ["Oldest first", { sortBy: "createdAt", sortOrder: "asc" }],
    ["Newest first", { sortBy: "createdAt", sortOrder: "desc" }],
    ["Recently updated", { sortBy: "updatedAt", sortOrder: "desc" }],
    ["Ticket Number A–Z", { sortBy: "ticketNumber", sortOrder: "asc" }],
    ["Status", { sortBy: "status", sortOrder: "asc" }],
  ] as [string, Record<string, string>][])("sort %s sends %o and returns to page 1", async (label, params) => {
    const api = await openQueue(fakeApi(queueRoutes(TWO_PAGES())));
    await goToPage2(api);

    await userEvent.selectOptions(screen.getByTestId("sort-select"), label);
    await expectLastRequest(api, { ...DEFAULT_PARAMS, ...params });
  });

  it("returns to the default order when Priority: Urgent first is chosen again", async () => {
    const api = await openQueue(fakeApi(queueRoutes()));
    await userEvent.selectOptions(screen.getByTestId("sort-select"), "Status");
    await expectLastRequest(api, { ...DEFAULT_PARAMS, sortBy: "status", sortOrder: "asc" });

    await userEvent.selectOptions(screen.getByTestId("sort-select"), "Priority: Urgent first");
    await expectLastRequest(api, DEFAULT_PARAMS);
  });

  it("shows Clear Filters only once something is applied, and it restores the defaults", async () => {
    const api = await openQueue(fakeApi(queueRoutes(TWO_PAGES())));
    await waitFor(() => expect(screen.getByTestId("filter-category")).toHaveTextContent("Hardware"));
    expect(screen.queryByTestId("btn-clear-filters")).not.toBeInTheDocument();

    await userEvent.type(screen.getByTestId("field-search"), "battery");
    await userEvent.selectOptions(screen.getByTestId("filter-status"), "Open");
    await userEvent.selectOptions(screen.getByTestId("filter-it-priority"), "High");
    await userEvent.selectOptions(screen.getByTestId("filter-category"), "Hardware");
    await userEvent.selectOptions(screen.getByTestId("filter-owner"), "Unassigned");
    await userEvent.selectOptions(screen.getByTestId("sort-select"), "Newest first");
    await expectLastRequest(api, {
      ...DEFAULT_PARAMS,
      q: "battery",
      status: "OPEN",
      itPriority: "HIGH",
      categoryId: "2",
      owner: "unassigned",
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    const clear = screen.getByTestId("btn-clear-filters");
    expect(clear).toHaveClass("zg-btn--secondary");
    await userEvent.click(clear);

    await expectLastRequest(api, DEFAULT_PARAMS);
    expect(screen.getByTestId("field-search")).toHaveValue("");
    for (const testId of ["filter-status", "filter-it-priority", "filter-category", "filter-owner"]) {
      expect((screen.getByTestId(testId) as HTMLSelectElement).value, testId).toBe("");
    }
    expect(screen.getByTestId("sort-select")).toHaveDisplayValue("Priority: Urgent first");
    expect(screen.queryByTestId("btn-clear-filters")).not.toBeInTheDocument();
  });
});

describe("UI-23 (AC-33, AC-68) - queue states", () => {
  const STATES = ["state-loading", "state-empty", "state-no-results", "state-list-failed", "state-forbidden"];

  /** Exactly one state is shown, and it is `testId`. */
  function expectOnlyState(testId: string) {
    for (const other of STATES) {
      if (other === testId) expect(screen.getByTestId(other)).toBeInTheDocument();
      else expect(screen.queryByTestId(other), other).not.toBeInTheDocument();
    }
  }

  function expectNoStatusCode() {
    const main = screen.getByTestId("staff-queue-screen");
    expect(main.textContent).not.toMatch(/\b(403|500)\b|FORBIDDEN|INTERNAL_ERROR/);
  }

  it("shows loading while the request is in flight", async () => {
    // The queue request is held open; reference data answers normally.
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    await openQueue(fakeApi(queueRoutes(() => held.then(() => queuePage([])))));

    const loading = await screen.findByTestId("state-loading");
    expect(loading).toHaveTextContent("Loading tickets");
    expect(within(loading).queryByRole("button")).not.toBeInTheDocument();
    expectOnlyState("state-loading");

    release();
    await screen.findByTestId("state-empty");
  });

  it("shows the empty state, with no action, when there are no tickets and nothing is applied", async () => {
    await openQueue(fakeApi(queueRoutes(queuePage([]))));

    const empty = await screen.findByTestId("state-empty");
    expect(empty).toHaveTextContent("There are no tickets yet.");
    expect(within(empty).queryByRole("button")).not.toBeInTheDocument();
    expect(within(empty).queryByRole("link")).not.toBeInTheDocument();
    expectOnlyState("state-empty");
  });

  it("shows no-results with Clear Filters when a filter matches nothing", async () => {
    const api = await openQueue(fakeApi(queueRoutes()));
    await screen.findByTestId(`queue-row-${TICKET_NUMBER}`);
    api.routes["GET /staff/tickets"] = queuePage([]);

    await userEvent.selectOptions(screen.getByTestId("filter-status"), "Closed");
    const noResults = await screen.findByTestId("state-no-results");
    expect(noResults).toHaveTextContent("No tickets match your search or filters.");
    expectOnlyState("state-no-results");

    api.routes["GET /staff/tickets"] = queuePage([queueItem(TICKET_NUMBER)]);
    await userEvent.click(within(noResults).getByRole("button", { name: "Clear Filters" }));
    await expectLastRequest(api, DEFAULT_PARAMS);
    await screen.findByTestId(`queue-row-${TICKET_NUMBER}`);
  });

  it("shows the error callout with Retry on failure, keeps the controls usable, and Retry reloads", async () => {
    const api = await openQueue(fakeApi(queueRoutes(failure(500, "INTERNAL_ERROR", "Database exploded at db.ts:42"))));

    const failed = await screen.findByTestId("state-list-failed");
    expect(failed).toHaveTextContent("Something went wrong. Try again.");
    expect(failed).not.toHaveTextContent("Database exploded");
    expectOnlyState("state-list-failed");
    expectNoStatusCode();
    expect(screen.getByTestId("filter-status")).toBeEnabled();
    expect(screen.getByTestId("field-search")).toBeEnabled();

    api.routes["GET /staff/tickets"] = queuePage([queueItem(TICKET_NUMBER)]);
    await userEvent.click(within(failed).getByRole("button", { name: "Retry" }));
    await screen.findByTestId(`queue-row-${TICKET_NUMBER}`);
    expect(queueRequests(api)).toHaveLength(2);
  });

  it("shows the forbidden state on a 403 from the queue", async () => {
    await openQueue(fakeApi(queueRoutes(failure(403, "FORBIDDEN", "Forbidden."))));

    const forbidden = await screen.findByTestId("state-forbidden");
    expect(forbidden).toHaveTextContent("You do not have access to this page.");
    expect(within(forbidden).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expectOnlyState("state-forbidden");
    expectNoStatusCode();
  });
});

describe("UI-24 (AC-33) - queue mobile cards", () => {
  it("renders cards and no table below 768px", async () => {
    setViewport(true);
    await openQueue(fakeApi(queueRoutes()));

    const card = await screen.findByTestId(`queue-card-${TICKET_NUMBER}`);
    expect(screen.queryByTestId("queue-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`queue-row-${TICKET_NUMBER}`)).not.toBeInTheDocument();

    // The whole card is the link (ui-spec 6.4).
    expect(card.tagName).toBe("A");
    expect(card).toHaveAttribute("href", `/staff/tickets/q-${TICKET_NUMBER}`);
    expect(card).toHaveTextContent(TICKET_NUMBER);
    expect(card).toHaveTextContent("Laptop battery drains within one hour");
    expect(card).toHaveTextContent("Napat Chaiwong");
    expect(card).toHaveTextContent(IT_STAFF.fullName);
    expect(within(card).getByTestId("badge-it-priority")).toBeInTheDocument();
    expect(within(card).getByTestId("badge-status")).toBeInTheDocument();
  });

  it("renders a table and no cards at desktop width", async () => {
    setViewport(false);
    await openQueue(fakeApi(queueRoutes()));

    await screen.findByTestId(`queue-row-${TICKET_NUMBER}`);
    expect(screen.getByTestId("queue-table")).toBeInTheDocument();
    expect(screen.queryByTestId(`queue-card-${TICKET_NUMBER}`)).not.toBeInTheDocument();
  });
});

describe("UI-25 (AC-32) - queue pagination", () => {
  it("offers exactly 10, 20, and 50, with 20 selected", async () => {
    await openQueue(fakeApi(queueRoutes()));

    const size = (await screen.findByTestId("field-page-size")) as HTMLSelectElement;
    expect(Array.from(size.options).map((o) => o.value)).toEqual(["10", "20", "50"]);
    expect(size.value).toBe("20");
  });

  it("requests a changed page size and returns to page 1", async () => {
    const api = await openQueue(fakeApi(queueRoutes(TWO_PAGES())));
    await goToPage2(api);

    await userEvent.selectOptions(screen.getByTestId("field-page-size"), "50");
    await expectLastRequest(api, { page: "1", pageSize: "50" });
  });

  it("moves between pages with Next and Previous", async () => {
    const api = await openQueue(fakeApi(queueRoutes(TWO_PAGES())));
    expect(await screen.findByTestId("btn-prev-page")).toBeDisabled();

    // The server's meta says page 2, which is what enables Previous.
    api.routes["GET /staff/tickets"] = queuePage([queueItem(TICKET_NUMBER)], { page: 2, totalItems: 30 });
    await goToPage2(api);
    await waitFor(() => expect(screen.getByTestId("btn-prev-page")).toBeEnabled());
    await userEvent.click(screen.getByTestId("btn-prev-page"));
    await expectLastRequest(api, DEFAULT_PARAMS);
  });
});

describe("UI-26 (AC-26) - indication in queue", () => {
  it("shows the compact indicator only on a row the Requester marked", async () => {
    const marked = queueItem("TKT-2026-00050", { requesterIndicatedResolvedAt: "2026-10-01T09:00:00.000Z" });
    const plain = queueItem("TKT-2026-00051");
    await openQueue(fakeApi(queueRoutes(queuePage([marked, plain]))));

    const row = await screen.findByTestId("queue-row-TKT-2026-00050");
    const indicator = within(row).getByTestId("indicator-appears-resolved");
    expect(indicator).toHaveTextContent(/^✓ Requester: appears resolved$/);
    expect(within(screen.getByTestId("queue-row-TKT-2026-00051")).queryByTestId("indicator-appears-resolved")).not.toBeInTheDocument();
  });

  it("shows it on the mobile card too", async () => {
    setViewport(true);
    const marked = queueItem("TKT-2026-00050", { requesterIndicatedResolvedAt: "2026-10-01T09:00:00.000Z" });
    await openQueue(fakeApi(queueRoutes(queuePage([marked]))));

    const card = await screen.findByTestId("queue-card-TKT-2026-00050");
    expect(within(card).getByTestId("indicator-appears-resolved")).toHaveTextContent("✓ Requester: appears resolved");
  });
});
