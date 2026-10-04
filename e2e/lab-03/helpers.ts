import { expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { BASE, seedPassword } from "../lab-02/helpers.js";

// Shared helpers for the Lab 3 end-to-end suite (docs/lab-03/tests.md 2.13).
//
// The journeys drive the UI. Setup and cleanup that the UI is not the subject
// of go through the API, each in its own request context with its own session
// and CSRF token, so cleanup never depends on the state of the page under test.

export { BASE, seedPassword };

/** The seeded accounts the suite signs in as (specification.md 7.5). */
export const ACCOUNTS = {
  requester: { email: "siriporn.mee@kmutt.ac.th", fullName: "Siriporn Meesuk" },
  otherRequester: { email: "napat.cha@kmutt.ac.th", fullName: "Napat Chaiwong" },
  inactiveRequester: { email: "kittipong.won@kmutt.ac.th" },
  mustChange: { email: "chayanin.boo@kmutt.ac.th", fullName: "Chayanin Boonmee" },
  staff: { email: "wichai.pra@kmutt.ac.th", fullName: "Wichai Prasert" },
  admin: { email: "sasithorn.pho@kmutt.ac.th", fullName: "Sasithorn Pholchai" },
} as const;

/**
 * An email unique to this run, e.g. `e2e-staff-{timestamp}-{random}@example.test`
 * (tests.md section 1), so a repeated run never hits EMAIL_ALREADY_EXISTS.
 */
export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** A password that satisfies BR-11 (12–128 characters) and differs per run. */
export function freshPassword(): string {
  return `e2e-pass-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Fills and submits the Login form, which must already be showing. */
export async function submitLogin(page: Page, email: string, password = seedPassword()): Promise<void> {
  await page.getByTestId("field-email").fill(email);
  await page.getByTestId("field-password").fill(password);
  await page.getByTestId("btn-sign-in").click();
}

/** Opens Login and signs in, waiting for the shell or the forced password change. */
export async function signIn(page: Page, email: string, password = seedPassword()): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.getByTestId("login-screen").waitFor({ state: "visible", timeout: 25000 });
  await submitLogin(page, email, password);
  await page
    .locator('[data-testid="app-shell"], [data-testid="change-password-screen"]')
    .first()
    .waitFor({ state: "visible", timeout: 25000 });
}

export async function signOut(page: Page): Promise<void> {
  await page.getByTestId("btn-logout").click();
  await page.getByTestId("login-screen").waitFor({ state: "visible" });
}

/** The CSRF token of the session the page holds (GET /auth/me, api-spec 2.3). */
export async function pageCsrf(page: Page): Promise<string> {
  const response = await page.request.get(`${BASE}/api/v1/auth/me`);
  expect(response.status(), "the page should hold a session").toBe(200);
  return ((await response.json()) as { data: { csrfToken: string } }).data.csrfToken;
}

/** A signed-in API session, independent of any page. */
export interface ApiSession {
  ctx: APIRequestContext;
  csrf: string;
  get(path: string): Promise<unknown>;
  send(method: "POST" | "PATCH" | "PUT", path: string, data?: unknown): Promise<{ status: number; body: any }>;
  dispose(): Promise<void>;
}

export async function apiSession(email: string, password = seedPassword()): Promise<ApiSession> {
  const ctx = await request.newContext({ baseURL: BASE });
  const login = await ctx.post("/api/v1/auth/login", { data: { email, password } });
  expect(login.status(), `API sign-in as ${email}`).toBe(200);
  const csrf = ((await login.json()) as { data: { csrfToken: string } }).data.csrfToken;
  return {
    ctx,
    csrf,
    async get(path) {
      const response = await ctx.get(`/api/v1${path}`);
      expect(response.status(), `GET ${path}`).toBe(200);
      return ((await response.json()) as { data: unknown }).data;
    },
    async send(method, path, data) {
      const response = await ctx.fetch(`/api/v1${path}`, {
        method,
        headers: { "X-CSRF-Token": csrf },
        ...(data === undefined ? {} : { data }),
      });
      return { status: response.status(), body: await response.json().catch(() => null) };
    },
    dispose: () => ctx.dispose(),
  };
}

/** Creates a ticket for the signed-in Requester through POST /tickets. */
export async function createTicket(
  requester: ApiSession,
  summary: string,
): Promise<{ id: string; ticketNumber: string }> {
  const [category] = (await requester.get("/categories")) as { id: number }[];
  const [system] = (await requester.get("/related-systems")) as { id: number }[];
  const created = await requester.send("POST", "/tickets", {
    categoryId: category.id,
    relatedSystemId: system.id,
    summary,
    requestedPriority: "MEDIUM",
    description: "Created by the Lab 3 end to end suite with enough detail to pass validation.",
  });
  expect(created.status, "ticket creation").toBe(201);
  return created.body.data;
}

/** Looks up a user's id by email through the Administrator API. */
export async function userIdByEmail(admin: ApiSession, email: string): Promise<string> {
  const users = (await admin.get(`/admin/users?q=${encodeURIComponent(email)}`)) as { id: string; email: string }[];
  const user = users.find((u) => u.email === email);
  expect(user, `user ${email} should exist`).toBeDefined();
  return user!.id;
}

/** Deactivates a user through the API; used in `finally` blocks (tests.md section 1). */
export async function deactivate(admin: ApiSession, email: string): Promise<void> {
  const id = await userIdByEmail(admin, email);
  const result = await admin.send("PATCH", `/admin/users/${id}`, { isActive: false });
  expect(result.status, `deactivating ${email}`).toBe(200);
}
