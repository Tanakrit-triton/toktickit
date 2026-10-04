import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as authApi from "../../src/lab-03/auth-api.js";
import type { CurrentUser } from "../../src/lab-03/auth-api.js";
import * as api from "../../src/lab-02/api.js";
import {
  ADMINISTRATOR,
  IT_STAFF,
  OTHER_REQUESTER,
  REQUESTER,
  mockRequesterScreens,
  mockStartupSession,
  renderApp,
  session,
} from "./helpers.js";

// UI-12 to UI-15 from docs/lab-03/tests.md section 2.10 (AC-08, AC-18,
// AC-21, FR-08). Shell: ui-spec.md section 3.

const LANDING: Record<CurrentUser["role"], string> = {
  REQUESTER: "/tickets",
  IT_STAFF: "/staff/queue",
  ADMINISTRATOR: "/staff/queue",
};

async function openShellAs(user: CurrentUser) {
  if (user.role === "REQUESTER") mockRequesterScreens();
  mockStartupSession(user);
  renderApp(LANDING[user.role]);
  return screen.findByTestId("app-shell");
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shell identity (UI-12 - AC-18)", () => {
  it("shows the user's name, role badge, Change password link, and Log out", async () => {
    await openShellAs(REQUESTER);

    expect(screen.getByTestId("shell-user-name")).toHaveTextContent(REQUESTER.fullName);
    expect(screen.getByTestId("badge-role")).toHaveTextContent("Requester");
    const link = screen.getByTestId("link-change-password");
    expect(link).toHaveAttribute("href", "/change-password");
    expect(link).toHaveTextContent(/change password/i);
    expect(screen.getByTestId("btn-logout")).toHaveTextContent(/log out/i);
  });
});

describe("role navigation (UI-13 - AC-18, FR-08)", () => {
  const ALL = ["nav-my-tickets", "nav-create-ticket", "nav-ticket-queue", "nav-user-management"];

  it.each([
    ["Requester", REQUESTER, ["nav-my-tickets", "nav-create-ticket"]],
    ["IT Staff", IT_STAFF, ["nav-ticket-queue"]],
    ["Administrator", ADMINISTRATOR, ["nav-ticket-queue", "nav-user-management"]],
  ] as const)("offers the %s only their destinations", async (_role, user, expected) => {
    await openShellAs(user);

    for (const id of ALL) {
      if ((expected as readonly string[]).includes(id)) {
        expect(screen.getByTestId(id), id).toBeInTheDocument();
      } else {
        // Not rendered at all, rather than hidden or disabled (ui-spec 3).
        expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
      }
    }
  });

  it("links each destination to its route", async () => {
    await openShellAs(ADMINISTRATOR);

    expect(screen.getByTestId("nav-ticket-queue")).toHaveAttribute("href", "/staff/queue");
    expect(screen.getByTestId("nav-user-management")).toHaveAttribute("href", "/admin/users");
  });
});

describe("selector removed (UI-14 - AC-21)", () => {
  it.each([
    ["Requester", REQUESTER],
    ["IT Staff", IT_STAFF],
  ] as const)("shows no selector, Change Requester action, or development notice to the %s", async (_role, user) => {
    await openShellAs(user);

    for (const id of ["field-dev-requester", "btn-change-requester", "dev-mode-notice", "requester-selection-screen"]) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
    expect(document.body.textContent).not.toMatch(/not a login|Acting as|Development mode/i);
  });
});

describe("logout (UI-15 - AC-08)", () => {
  it("calls the API, clears cached ticket data, and shows Login", async () => {
    const logout = vi.spyOn(authApi, "logout").mockResolvedValue();
    const u = userEvent.setup({ delay: null });
    await openShellAs(REQUESTER);
    expect(await screen.findByTestId("ticket-row-TKT-2026-00042")).toBeInTheDocument();

    await u.click(screen.getByTestId("btn-logout"));

    expect(await screen.findByTestId("login-screen")).toBeInTheDocument();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
    expect(screen.queryByText("TKT-2026-00042")).not.toBeInTheDocument();
    // Logout goes to plain /login: carrying the previous user's path in next
    // would send the next user to it.
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/login$/);
  });

  it("shows none of the previous user's data after another user signs in", async () => {
    vi.spyOn(authApi, "logout").mockResolvedValue();
    const u = userEvent.setup({ delay: null });
    await openShellAs(REQUESTER);
    await screen.findByTestId("ticket-row-TKT-2026-00042");

    await u.click(screen.getByTestId("btn-logout"));
    await screen.findByTestId("login-screen");

    // The second user's list never resolves, so anything on screen afterwards
    // could only have been kept from the first user.
    vi.spyOn(api, "fetchTickets").mockReturnValue(new Promise(() => {}));
    vi.spyOn(authApi, "login").mockResolvedValue(session(OTHER_REQUESTER, "csrf-token-2"));
    await u.type(screen.getByTestId("field-email"), OTHER_REQUESTER.email);
    await u.type(screen.getByTestId("field-password"), "a password long enough");
    await u.click(screen.getByTestId("btn-sign-in"));

    await waitFor(() => expect(screen.getByTestId("shell-user-name")).toHaveTextContent(OTHER_REQUESTER.fullName));
    expect(await screen.findByTestId("my-tickets-screen")).toBeInTheDocument();
    expect(screen.queryByText("TKT-2026-00042")).not.toBeInTheDocument();
    expect(screen.queryByText(REQUESTER.fullName)).not.toBeInTheDocument();
  });
});
