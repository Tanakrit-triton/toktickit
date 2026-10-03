import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as authApi from "../../src/lab-03/auth-api.js";
import type { CurrentUser } from "../../src/lab-03/auth-api.js";
import * as api from "../../src/lab-02/api.js";
import {
  ADMINISTRATOR,
  IT_STAFF,
  REQUESTER,
  mockRequesterScreens,
  mockStartupSession,
  renderApp,
  session,
} from "./helpers.js";

// UI-16 to UI-19 from docs/lab-03/tests.md section 2.10 (AC-08, AC-18, AC-19,
// AC-21, AC-60). Routing: ui-spec.md section 4.

const LEGACY_KEY = "toktickit.selectedRequester";

async function signInFrom(path: string, user: CurrentUser = REQUESTER) {
  mockStartupSession(null);
  vi.spyOn(authApi, "login").mockResolvedValue(session(user));
  const u = userEvent.setup({ delay: null });
  renderApp(path);
  await screen.findByTestId("login-screen");
  await u.type(screen.getByTestId("field-email"), user.email);
  await u.type(screen.getByTestId("field-password"), "a password long enough");
  await u.click(screen.getByTestId("btn-sign-in"));
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("unauthenticated redirect (UI-16 - AC-08)", () => {
  it("sends a protected route to /login with next", async () => {
    mockStartupSession(null);

    renderApp("/tickets/new");

    expect(await screen.findByTestId("login-screen")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/login\?next=%2Ftickets%2Fnew$/);
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
  });

  it("returns to next after login", async () => {
    mockRequesterScreens();

    await signInFrom("/login?next=%2Ftickets%2Fnew");

    expect(await screen.findByTestId("create-ticket-screen")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/tickets\/new$/);
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example"])(
    "ignores next=%s and goes to the landing route",
    async (next) => {
      mockRequesterScreens();

      await signInFrom(`/login?next=${encodeURIComponent(next)}`);

      expect(await screen.findByTestId("my-tickets-screen")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/tickets$/);
    },
  );
});

describe("forbidden route (UI-17 - AC-19, AC-60)", () => {
  it.each([
    ["a Requester", REQUESTER, "/staff/queue"],
    ["a Requester", REQUESTER, "/admin/users"],
    ["IT Staff", IT_STAFF, "/admin/users"],
  ] as const)("shows %s the forbidden state at %s, with no protected API call", async (_who, user, path) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const ticketCalls = [
      vi.spyOn(api, "fetchTickets"),
      vi.spyOn(api, "fetchCategories"),
      vi.spyOn(api, "fetchRelatedSystems"),
    ];
    mockStartupSession(user);

    renderApp(path);

    const forbidden = await screen.findByTestId("state-forbidden");
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Access denied" })).toBeInTheDocument();
    expect(forbidden).toHaveTextContent("You do not have access to this page.");
    expect(forbidden.textContent).not.toMatch(/\b403\b|FORBIDDEN/);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const call of ticketCalls) expect(call).not.toHaveBeenCalled();
  });

  it("does not show the forbidden state to a permitted role", async () => {
    mockStartupSession(ADMINISTRATOR);

    renderApp("/admin/users");

    await screen.findByTestId("app-shell");
    expect(screen.queryByTestId("state-forbidden")).not.toBeInTheDocument();
  });
});

describe("landing redirect (UI-18 - AC-18)", () => {
  it("sends a Requester from / to /tickets", async () => {
    mockRequesterScreens();
    mockStartupSession(REQUESTER);

    renderApp("/");

    expect(await screen.findByTestId("my-tickets-screen")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/tickets$/);
  });

  it.each([
    ["IT Staff", IT_STAFF],
    ["Administrator", ADMINISTRATOR],
  ] as const)("sends %s from / to /staff/queue", async (_who, user) => {
    mockStartupSession(user);

    renderApp("/");

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/staff\/queue$/));
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("state-forbidden")).not.toBeInTheDocument();
  });

  it("sends an authenticated user away from /login to their landing route", async () => {
    mockStartupSession(IT_STAFF);

    renderApp("/login");

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/staff\/queue$/));
    expect(screen.queryByTestId("login-screen")).not.toBeInTheDocument();
  });

  it("renders /lab-01 outside the shell without a session", async () => {
    mockStartupSession(null);

    renderApp("/lab-01");

    expect(await screen.findByRole("button", { name: /check system/i })).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-screen")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/lab-01$/);
  });
});

describe("legacy state removed (UI-19 - AC-21)", () => {
  it("removes a pre-existing toktickit.selectedRequester key on startup", async () => {
    window.sessionStorage.setItem(LEGACY_KEY, JSON.stringify({ id: "x", fullName: "Old", email: "old@example.test" }));
    window.sessionStorage.setItem("unrelated.key", "kept");
    mockStartupSession(null);

    renderApp("/login");

    await screen.findByTestId("login-screen");
    expect(window.sessionStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.sessionStorage.getItem("unrelated.key")).toBe("kept");
  });
});
