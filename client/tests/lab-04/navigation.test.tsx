import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUser } from "../../src/lab-03/auth-api.js";
import { ADMINISTRATOR, IT_STAFF, REQUESTER, mockStartupSession, renderApp } from "../lab-03/helpers.js";
import { fakeApi, ok, queueRoutes } from "../lab-03/ticket-fixtures.js";
import {
  REQUESTER_DASHBOARD_PATH,
  STAFF_DASHBOARD_PATH,
  myTicketsRoutes,
  requesterDashboard,
  staffDashboard,
} from "./dashboard-fixtures.js";

// UI-20 from docs/lab-04/tests.md section 2.7 (AC-29): the shell's
// navigation by role, ui-spec.md section 2. `/` keeps the Lab 3 landing
// (DEC-11), so the Lab 3 routing tests are unaffected.

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  fakeApi({
    ...myTicketsRoutes(),
    ...queueRoutes(),
    [REQUESTER_DASHBOARD_PATH]: ok(requesterDashboard()),
    [STAFF_DASHBOARD_PATH]: ok(staffDashboard()),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openAs(user: CurrentUser, path: string) {
  mockStartupSession(user);
  renderApp(path);
  return screen.findByRole("navigation", { name: "Main" });
}

const ROLES = [
  ["Requester", REQUESTER, "/dashboard", ["Dashboard", "My Tickets", "Create Ticket"], "/tickets"],
  ["IT Staff", IT_STAFF, "/staff/dashboard", ["Dashboard", "Ticket Queue"], "/staff/queue"],
  ["Administrator", ADMINISTRATOR, "/staff/dashboard", ["Dashboard", "Ticket Queue", "User Management"], "/staff/queue"],
] as const;

describe("UI-20 (AC-29) - Dashboard navigation", () => {
  it.each(ROLES)("gives the %s Dashboard first, then the Lab 3 items, in order", async (_role, user, dashboard, labels, landing) => {
    const nav = await openAs(user, landing);

    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([...labels]);
    expect(links[0]).toHaveAttribute("data-testid", "nav-dashboard");
    expect(links[0]).toHaveAttribute("href", dashboard);
  });

  it.each(ROLES)("marks Dashboard as the current page on the %s dashboard, and nothing else", async (_role, user, dashboard) => {
    const nav = await openAs(user, dashboard);

    const current = within(nav).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("data-testid", "nav-dashboard");
  });

  it.each(ROLES)("moves aria-current off Dashboard on the %s list screen", async (_role, user, _dashboard, labels, landing) => {
    const nav = await openAs(user, landing);

    expect(screen.getByTestId("nav-dashboard")).not.toHaveAttribute("aria-current");
    const current = within(nav).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual([labels[1]]);
  });

  it("navigates to the dashboard when Dashboard is activated", async () => {
    await openAs(IT_STAFF, "/staff/queue");

    await userEvent.click(screen.getByTestId("nav-dashboard"));

    expect(await screen.findByTestId("staff-dashboard-screen")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/staff/dashboard");
    expect(screen.getByTestId("nav-dashboard")).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["Requester", REQUESTER, "/tickets"],
    ["IT Staff", IT_STAFF, "/staff/queue"],
  ] as const)("keeps the Lab 3 landing at / for the %s (DEC-11)", async (_role, user, landing) => {
    await openAs(user, "/");
    expect(screen.getByTestId("location")).toHaveTextContent(new RegExp(`^${landing}$`));
  });
});
