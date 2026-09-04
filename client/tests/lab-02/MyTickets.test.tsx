import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RequesterProvider } from "../../src/lab-02/RequesterContext.js";
import { MyTickets } from "../../src/lab-02/screens/MyTickets.js";
import * as api from "../../src/lab-02/api.js";
import type { TicketListPage } from "../../src/lab-02/api.js";

// UI-22 .. UI-26 from docs/lab-02/tests.md section 2.3.
//
// Every expected value is a constant declared here; nothing reads its
// expectation back out of the component or the mocked API.

const ALICE = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  fullName: "Napat Chaiwong",
  email: "napat.cha@kmutt.ac.th",
};

const CATEGORIES = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];
const SYSTEMS = [{ id: 5, name: "Campus Wi-Fi" }];

const ROW = {
  id: "t1",
  ticketNumber: "TKT-2026-00042",
  summary: "Laptop battery drains within one hour",
  category: CATEGORIES[1],
  relatedSystem: SYSTEMS[0],
  requestedPriority: "HIGH",
  currentStatus: "NEW",
  attachmentCount: 0,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const page = (data: (typeof ROW)[], totalItems: number): TicketListPage => ({
  data,
  meta: { page: 1, pageSize: 10, totalItems, totalPages: Math.ceil(totalItems / 10) },
});

const POPULATED = page([ROW], 1);
const NOTHING = page([], 0);

function renderScreen() {
  return render(
    <RequesterProvider>
      <MemoryRouter initialEntries={["/tickets"]}>
        <MyTickets />
      </MemoryRouter>
    </RequesterProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.sessionStorage.setItem("toktickit.selectedRequester", JSON.stringify(ALICE));
  vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("MyTickets (UI-22 - AC-24)", () => {
  it("shows the empty state with a Create Ticket action when nothing is owned", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue(NOTHING);

    renderScreen();

    const empty = await screen.findByTestId("state-empty");
    expect(empty).toHaveTextContent(/have not created any tickets yet/i);
    expect(screen.getByTestId("btn-create-ticket")).toBeInTheDocument();
    expect(screen.queryByTestId("state-no-results")).not.toBeInTheDocument();
  });
});

describe("MyTickets (UI-23 - AC-25)", () => {
  it("shows the no-results state with Clear Filters when a search matches nothing", async () => {
    const fetchTickets = vi
      .spyOn(api, "fetchTickets")
      .mockResolvedValueOnce(POPULATED)
      .mockResolvedValue(NOTHING);
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("ticket-row-TKT-2026-00042");

    await user.type(screen.getByTestId("field-search"), "zzz");

    const noResults = await screen.findByTestId("state-no-results", {}, { timeout: 5000 });
    expect(noResults).toHaveTextContent(/no tickets match/i);
    expect(screen.getByTestId("btn-clear-filters")).toBeInTheDocument();
    expect(screen.queryByTestId("state-empty")).not.toBeInTheDocument();
    expect(fetchTickets.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("MyTickets (UI-24 - AC-25)", () => {
  it("distinguishes the two states by wording and by offered action", async () => {
    // Both states show zero tickets. If they were worded or actioned the same,
    // a Requester with filters applied would be told they had never created a
    // ticket, which is a different and wrong claim (BR-49).
    vi.spyOn(api, "fetchTickets").mockResolvedValue(NOTHING);
    renderScreen();
    const empty = await screen.findByTestId("state-empty");
    const emptyText = empty.textContent ?? "";
    expect(screen.queryByTestId("btn-clear-filters")).not.toBeInTheDocument();

    // Tear the first tree down before mounting the second, so the two
    // states are never in the document at the same time.
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
    vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
    vi.spyOn(api, "fetchTickets").mockResolvedValue(NOTHING);
    const user = userEvent.setup({ delay: null });

    renderScreen();
    // The category options arrive from a separate fetch. Selecting before it
    // resolves is a race in the test, not in the screen.
    await waitFor(() =>
      expect(
        screen.getByTestId("filter-category").querySelectorAll("option").length,
      ).toBeGreaterThan(1),
    );
    await user.selectOptions(screen.getByTestId("filter-category"), "2");

    const noResults = await screen.findByTestId("state-no-results", {}, { timeout: 5000 });
    const noResultsText = noResults.textContent ?? "";

    expect(noResultsText).not.toBe(emptyText);
    expect(screen.getByTestId("btn-clear-filters")).toBeInTheDocument();
  });
});

describe("MyTickets (UI-25 - FR-21)", () => {
  it("resets search, filters and sort to their defaults and refetches", async () => {
    const fetchTickets = vi
      .spyOn(api, "fetchTickets")
      .mockResolvedValueOnce(POPULATED)
      .mockResolvedValue(NOTHING);
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("ticket-row-TKT-2026-00042");

    await user.selectOptions(screen.getByTestId("filter-category"), "2");
    await user.selectOptions(screen.getByTestId("field-sort"), "oldest");
    await user.type(screen.getByTestId("field-search"), "battery");
    await screen.findByTestId("state-no-results", {}, { timeout: 5000 });

    fetchTickets.mockResolvedValue(POPULATED);
    await user.click(screen.getByTestId("btn-clear-filters"));

    await waitFor(() => {
      expect(screen.getByTestId("field-search")).toHaveValue("");
      expect(screen.getByTestId("filter-category")).toHaveValue("");
      expect(screen.getByTestId("field-sort")).toHaveValue("newest");
    });

    // Clearing must re-query, not merely blank the controls.
    const last = fetchTickets.mock.calls[fetchTickets.mock.calls.length - 1][1];
    expect(last).toMatchObject({ sortBy: "createdAt", sortOrder: "desc", page: 1 });
    expect(last.q).toBeUndefined();
    expect(last.categoryId).toBeUndefined();
  });

  it("hides Clear Filters until something is applied", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue(POPULATED);
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("ticket-row-TKT-2026-00042");
    expect(screen.queryByTestId("btn-clear-filters")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("filter-priority"), "HIGH");

    expect(await screen.findByTestId("btn-clear-filters")).toBeInTheDocument();
  });
});

describe("MyTickets (UI-26 - FR-33)", () => {
  it("shows a loading state while the request is in flight, then the rows", async () => {
    let release: (v: TicketListPage) => void = () => {};
    vi.spyOn(api, "fetchTickets").mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderScreen();

    expect(await screen.findByTestId("state-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("ticket-row-TKT-2026-00042")).not.toBeInTheDocument();

    release(POPULATED);

    await screen.findByTestId("ticket-row-TKT-2026-00042");
    expect(screen.queryByTestId("state-loading")).not.toBeInTheDocument();
  });

  it("shows a safe failure state with Retry and leaks nothing", async () => {
    vi.spyOn(api, "fetchTickets").mockRejectedValue(
      new Error("500 Internal Server Error at Object.<anonymous> (/srv/app/routes.ts:42:11)"),
    );

    renderScreen();

    expect(await screen.findByTestId("state-list-failed")).toBeInTheDocument();
    expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    // The control bar stays usable so the Requester can adjust and try again.
    expect(screen.getByTestId("field-search")).toBeInTheDocument();

    const rendered = document.body.textContent ?? "";
    expect(rendered).not.toMatch(/\b500\b/);
    expect(rendered).not.toMatch(/routes\.ts/);
  });
});
