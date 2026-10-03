import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { apiFetch, setCsrfToken } from "../../src/lab-03/api-client.js";
import * as api from "../../src/lab-02/api.js";
import { REQUESTER, mockStartupSession, renderApp } from "./helpers.js";

// UI-20 from docs/lab-03/tests.md section 2.10 (AC-12, DEC-04).
// ui-spec.md section 4 (401 handling); api-spec.md sections 1.2 and 1.3.

const CSRF = "csrf-token-under-test";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The URL and headers of the n-th fetch call. */
function call(fetchSpy: ReturnType<typeof vi.spyOn>, n = 0) {
  const [input, init] = fetchSpy.mock.calls[n] as [RequestInfo | URL, RequestInit | undefined];
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return { url, headers: new Headers(init?.headers), method: (init?.method ?? "GET").toUpperCase() };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, { data: [] }));
  setCsrfToken(CSRF);
});

afterEach(() => {
  setCsrfToken(null);
  vi.restoreAllMocks();
});

describe("API client (UI-20 - AC-12, DEC-04)", () => {
  it("uses relative /api/v1 URLs", async () => {
    await apiFetch("/categories");
    await api.fetchCategories();
    await api.fetchTickets(REQUESTER.id, { sortBy: "createdAt", sortOrder: "desc", page: 1, pageSize: 10 });

    for (let n = 0; n < fetchSpy.mock.calls.length; n += 1) {
      const { url } = call(fetchSpy, n);
      expect(url, url).toMatch(/^\/api\/v1\//);
    }
    expect(call(fetchSpy, 0).url).toBe("/api/v1/categories");
    expect(api.attachmentDownloadUrl("att-1")).toBe("/api/v1/attachments/att-1/download");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("sends X-CSRF-Token on %s", async (method) => {
    await apiFetch("/tickets", { method, body: "{}" });

    expect(call(fetchSpy).headers.get("X-CSRF-Token")).toBe(CSRF);
  });

  it("does not send X-CSRF-Token on GET", async () => {
    await apiFetch("/tickets");

    expect(call(fetchSpy).method).toBe("GET");
    expect(call(fetchSpy).headers.has("X-CSRF-Token")).toBe(false);
  });

  it("sends the token from the Lab 2 state-changing calls too", async () => {
    fetchSpy.mockImplementation(async () => json(201, { data: { id: "t1" } }));

    await api.createTicket(REQUESTER.id, {
      categoryId: 2,
      relatedSystemId: 5,
      summary: "Laptop battery drains within one hour",
      requestedPriority: "HIGH",
      description: "A description long enough for the twenty character minimum.",
    });

    const { url, method, headers } = call(fetchSpy);
    expect([url, method]).toEqual(["/api/v1/tickets", "POST"]);
    expect(headers.get("X-CSRF-Token")).toBe(CSRF);
    expect(headers.has("X-Dev-Requester-Id")).toBe(false);
  });

  it("ends the session on a 401: Login with the session-ended callout and next", async () => {
    mockStartupSession(REQUESTER);
    fetchSpy.mockImplementation(async () => json(401, { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }));

    renderApp("/tickets");

    expect(await screen.findByTestId("login-screen")).toBeInTheDocument();
    const callout = screen.getByTestId("callout-info");
    expect(callout).toHaveTextContent("Your session has ended. Please sign in again.");
    expect(callout).toHaveAttribute("role", "status");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/login\?next=%2Ftickets$/);
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
  });
});
