import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUser } from "../../src/lab-03/auth-api.js";
import { IT_STAFF, REQUESTER, mockStartupSession, renderApp } from "../lab-03/helpers.js";
import { fakeApi, queueRoutes } from "../lab-03/ticket-fixtures.js";
import { myTicketsRoutes } from "./dashboard-fixtures.js";

// UI-21 from docs/lab-04/tests.md section 2.7 (AC-28): My Tickets and the
// Ticket Queue read the dashboard drill-down parameters from the URL
// (ui-spec.md section 3.5, api-spec.md section 4) and show the filter chip.

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Api = ReturnType<typeof fakeApi>;

/** The query parameters of every list request to `path`, oldest first. */
function listRequests(api: Api, path: string): Record<string, string>[] {
  return api.calls
    .filter((c) => c.method === "GET" && c.path.split("?")[0] === path)
    .map((c) => Object.fromEntries(new URLSearchParams(c.path.split("?")[1] ?? "")));
}

const last = (api: Api, path: string) => listRequests(api, path).at(-1);

const SCREENS = [
  ["My Tickets", REQUESTER, "/tickets", "/tickets", "my-tickets-screen"],
  ["the Ticket Queue", IT_STAFF, "/staff/queue", "/staff/tickets", "staff-queue-screen"],
] as const;

async function open(user: CurrentUser, url: string, testId: string) {
  const api = fakeApi({ ...myTicketsRoutes(), ...queueRoutes() });
  mockStartupSession(user);
  renderApp(url);
  await screen.findByTestId(testId);
  return api;
}

describe("UI-21 (AC-28) - drill-down filter chip", () => {
  it.each(SCREENS)("opens %s with ?statusGroup=ACTIVE, requests it, and shows the chip", async (_name, user, route, apiPath, testId) => {
    const api = await open(user, `${route}?statusGroup=ACTIVE`, testId);

    await waitFor(() => expect(last(api, apiPath)).toMatchObject({ statusGroup: "ACTIVE" }));
    expect(last(api, apiPath)).not.toHaveProperty("status");

    const chip = await screen.findByTestId("filter-chip");
    expect(chip).toHaveTextContent("Showing: Open tickets");
    const clear = screen.getByTestId("btn-clear-filter");
    expect(clear.tagName).toBe("BUTTON");
    expect(clear).toHaveAccessibleName("Clear filter");
  });

  it.each(SCREENS)("clears the chip on %s: the parameter leaves the URL and the list is refetched without it", async (_name, user, route, apiPath, testId) => {
    const api = await open(user, `${route}?statusGroup=ACTIVE`, testId);
    await screen.findByTestId("filter-chip");
    const before = listRequests(api, apiPath).length;

    await userEvent.click(screen.getByTestId("btn-clear-filter"));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(new RegExp(`^${route}$`)));
    expect(screen.queryByTestId("filter-chip")).not.toBeInTheDocument();
    await waitFor(() => expect(listRequests(api, apiPath).length).toBeGreaterThan(before));
    expect(last(api, apiPath)).not.toHaveProperty("statusGroup");
  });

  it.each(SCREENS)("shows no chip on %s when no drill-down parameter is present", async (_name, user, route, apiPath, testId) => {
    const api = await open(user, route, testId);
    await waitFor(() => expect(listRequests(api, apiPath).length).toBeGreaterThan(0));
    expect(screen.queryByTestId("filter-chip")).not.toBeInTheDocument();
    expect(last(api, apiPath)).not.toHaveProperty("statusGroup");
  });

  it("labels the Done group on My Tickets", async () => {
    const api = await open(REQUESTER, "/tickets?statusGroup=DONE", "my-tickets-screen");
    await waitFor(() => expect(last(api, "/tickets")).toMatchObject({ statusGroup: "DONE" }));
    expect(await screen.findByTestId("filter-chip")).toHaveTextContent("Showing: Resolved tickets");
  });

  it("follows Waiting for you: My Tickets requests status=WAITING_FOR_REQUESTER and names it in the chip", async () => {
    const api = await open(REQUESTER, "/tickets?status=WAITING_FOR_REQUESTER", "my-tickets-screen");

    await waitFor(() => expect(last(api, "/tickets")).toMatchObject({ status: "WAITING_FOR_REQUESTER" }));
    expect(last(api, "/tickets")).not.toHaveProperty("statusGroup");
    expect(await screen.findByTestId("filter-chip")).toHaveTextContent("Showing: Waiting for Requester");

    await userEvent.click(screen.getByTestId("btn-clear-filter"));
    await waitFor(() => expect(last(api, "/tickets")).not.toHaveProperty("status"));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/tickets$/);
  });

  it("follows Updated recently: My Tickets opens sorted by Recently updated", async () => {
    const api = await open(REQUESTER, "/tickets?sortBy=updatedAt&sortOrder=desc", "my-tickets-screen");

    await waitFor(() => expect(last(api, "/tickets")).toMatchObject({ sortBy: "updatedAt", sortOrder: "desc" }));
    expect(screen.getByTestId("field-sort")).toHaveDisplayValue("Recently updated");
  });

  it("follows Owned by me: the Queue requests owner=me with the Active group and reflects the owner", async () => {
    const api = await open(IT_STAFF, "/staff/queue?owner=me&statusGroup=ACTIVE", "staff-queue-screen");

    await waitFor(() => expect(last(api, "/staff/tickets")).toMatchObject({ owner: "me", statusGroup: "ACTIVE" }));
    expect(screen.getByTestId("filter-owner")).toHaveValue("me");
    expect(screen.getByTestId("filter-chip")).toHaveTextContent("Showing: Open tickets");
  });

  it("follows a status row: the Queue's status select reflects ?status, with no chip", async () => {
    const api = await open(IT_STAFF, "/staff/queue?status=NEW", "staff-queue-screen");

    await waitFor(() => expect(last(api, "/staff/tickets")).toMatchObject({ status: "NEW" }));
    expect(screen.getByTestId("filter-status")).toHaveValue("NEW");
    expect(screen.queryByTestId("filter-chip")).not.toBeInTheDocument();
  });

  it("follows an IT Priority row: the Queue requests itPriority with the Active group", async () => {
    const api = await open(IT_STAFF, "/staff/queue?itPriority=URGENT&statusGroup=ACTIVE", "staff-queue-screen");

    await waitFor(() => expect(last(api, "/staff/tickets")).toMatchObject({ itPriority: "URGENT", statusGroup: "ACTIVE" }));
    expect(screen.getByTestId("filter-it-priority")).toHaveValue("URGENT");
  });

  it("never sends status and statusGroup together: choosing a status on the Queue drops the group", async () => {
    const api = await open(IT_STAFF, "/staff/queue?statusGroup=ACTIVE", "staff-queue-screen");
    await screen.findByTestId("filter-chip");

    await userEvent.selectOptions(screen.getByTestId("filter-status"), "OPEN");

    await waitFor(() => expect(last(api, "/staff/tickets")).toMatchObject({ status: "OPEN" }));
    expect(last(api, "/staff/tickets")).not.toHaveProperty("statusGroup");
    expect(screen.queryByTestId("filter-chip")).not.toBeInTheDocument();
    for (const request of listRequests(api, "/staff/tickets")) {
      expect("status" in request && "statusGroup" in request, JSON.stringify(request)).toBe(false);
    }
  });

  it("ignores an unknown statusGroup rather than sending it", async () => {
    const api = await open(REQUESTER, "/tickets?statusGroup=OPEN", "my-tickets-screen");
    await waitFor(() => expect(listRequests(api, "/tickets").length).toBeGreaterThan(0));
    expect(last(api, "/tickets")).not.toHaveProperty("statusGroup");
    expect(screen.queryByTestId("filter-chip")).not.toBeInTheDocument();
  });
});
