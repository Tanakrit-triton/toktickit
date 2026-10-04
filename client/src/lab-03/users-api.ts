import { apiFetch } from "./api-client.js";
import type { Role } from "./auth-api.js";

// Administrator user endpoints (docs/lab-03/api-spec.md section 7).
//
// Every function returns the response's `data` or throws a UserRequestError.
// Unlike the ticket calls, the 409 code is kept: EMAIL_ALREADY_EXISTS belongs
// below Email, and every other 409 in the Conflict callout (ui-spec.md 6.6).
// Status codes and error codes are never shown on the page (AC-68).

/** AdminUser, api-spec.md 7. */
export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewUser {
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  initialPassword: string;
}

export type UserChanges = Partial<Pick<AdminUser, "fullName" | "email" | "role" | "isActive">>;

export type UserFailure = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "VALIDATION" | "FAILED";

export class UserRequestError extends Error {
  constructor(
    readonly kind: UserFailure,
    /** The 409 code and the server's message, kept only for a 409. */
    readonly conflict: { code: string; message: string } | null = null,
    /** Per-field messages, kept only for a 422. */
    readonly details: Record<string, string> = {},
  ) {
    super(`user request refused: ${kind}`);
    this.name = "UserRequestError";
  }
}

type ErrorBody = { error?: { code?: string; message?: string; details?: Record<string, string> } };

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path, init);
  } catch {
    throw new UserRequestError("FAILED");
  }
  if (response.ok) return ((await response.json()) as { data: T }).data;

  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  switch (response.status) {
    case 404:
      throw new UserRequestError("NOT_FOUND");
    case 403:
      throw new UserRequestError("FORBIDDEN");
    case 409:
      throw new UserRequestError("CONFLICT", {
        code: body.error?.code ?? "",
        message: body.error?.message ?? "",
      });
    case 422:
      throw new UserRequestError("VALIDATION", null, body.error?.details ?? {});
    default:
      throw new UserRequestError("FAILED");
  }
}

function withJson(method: string, payload: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}

/** GET /admin/users. Only the parameters given are sent (api-spec.md 7.1). */
export function fetchUsers(params: { q?: string; role?: Role }): Promise<AdminUser[]> {
  const query = new URLSearchParams();
  if (params.q !== undefined) query.set("q", params.q);
  if (params.role !== undefined) query.set("role", params.role);
  const search = query.toString();
  return send<AdminUser[]>(search === "" ? "/admin/users" : `/admin/users?${search}`);
}

export const createUser = (user: NewUser) => send<AdminUser>("/admin/users", withJson("POST", user));

export const updateUser = (userId: string, changes: UserChanges) =>
  send<AdminUser>(`/admin/users/${userId}`, withJson("PATCH", changes));

export const setInitialPassword = (userId: string, initialPassword: string) =>
  send<AdminUser>(`/admin/users/${userId}/initial-password`, withJson("POST", { initialPassword }));
