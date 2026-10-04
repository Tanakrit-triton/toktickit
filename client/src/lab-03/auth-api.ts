import { apiFetch } from "./api-client.js";

// Authentication endpoints (docs/lab-03/api-spec.md section 2).
//
// Each function returns parsed data or throws a typed error. Screens word
// their own messages from the error's kind and never render server text,
// status codes, or thrown messages (AC-68).

export type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

/** CurrentUser, api-spec.md section 1.6. */
export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface Session {
  user: CurrentUser;
  csrfToken: string;
}

export type LoginFailure = "INVALID_CREDENTIALS" | "ACCOUNT_INACTIVE" | "TOO_MANY_ATTEMPTS" | "FAILED";

export class LoginError extends Error {
  constructor(readonly reason: LoginFailure) {
    super(`login refused: ${reason}`);
    this.name = "LoginError";
  }
}

/** A 422 from POST /auth/password, carrying only the per-field messages. */
export class PasswordChangeError extends Error {
  constructor(readonly details: Record<string, string>) {
    super("password change refused");
    this.name = "PasswordChangeError";
  }
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** GET /auth/me: the session the browser already holds, or null for none. */
export async function fetchCurrentSession(): Promise<Session | null> {
  const response = await apiFetch("/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`current user request failed with ${response.status}`);
  return ((await response.json()) as { data: Session }).data;
}

/** POST /auth/login. */
export async function login(email: string, password: string): Promise<Session> {
  const response = await apiFetch("/auth/login", { method: "POST", ...json({ email, password }) });
  if (response.ok) return ((await response.json()) as { data: Session }).data;

  const reason: LoginFailure =
    response.status === 401
      ? "INVALID_CREDENTIALS"
      : response.status === 403
        ? "ACCOUNT_INACTIVE"
        : response.status === 429
          ? "TOO_MANY_ATTEMPTS"
          : "FAILED";
  throw new LoginError(reason);
}

/** POST /auth/logout. Succeeds whether or not a session existed (BR-18). */
export async function logout(): Promise<void> {
  const response = await apiFetch("/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error(`logout failed with ${response.status}`);
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** POST /auth/password. The returned session carries the new CSRF token. */
export async function changePassword(input: PasswordChangeInput): Promise<Session> {
  const response = await apiFetch("/auth/password", { method: "POST", ...json(input) });
  if (response.status === 422) {
    const body = (await response.json()) as { error: { details?: Record<string, string> } };
    throw new PasswordChangeError(body.error.details ?? {});
  }
  if (!response.ok) throw new Error(`password change failed with ${response.status}`);
  return ((await response.json()) as { data: Session }).data;
}
