// The one place the client talks to the API (docs/lab-03/api-spec.md sections
// 1.1 to 1.3, ui-spec.md section 4).
//
// - URLs are relative (/api/v1/...). The Vite dev server proxies /api to the
//   API, so the browser stays same-origin and sends the session cookie without
//   CORS (DEC-04).
// - The CSRF token is kept in memory only, never in storage, and is sent as
//   X-CSRF-Token on every POST, PUT, PATCH, and DELETE (BR-20).
// - Session-level responses are reported to the auth provider through the
//   handlers below, so every screen gets the same 401 and 403 behaviour.

export const API_BASE = "/api/v1";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export type SessionHandlers = {
  /** Any 401 except a failed login: the session is gone. */
  onUnauthenticated?: () => void;
  /** 403 PASSWORD_CHANGE_REQUIRED: reload the user and enter forced mode. */
  onPasswordChangeRequired?: () => void;
  /** 403 CSRF_INVALID: refresh the token. The request is not retried. */
  onCsrfInvalid?: () => void;
};

let handlers: SessionHandlers = {};

/** Installs the handlers and returns a function that removes them. */
export function setSessionHandlers(next: SessionHandlers): () => void {
  handlers = next;
  return () => {
    if (handlers === next) handlers = {};
  };
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { error?: { code?: string } };
    return body.error?.code;
  } catch {
    return undefined;
  }
}

/**
 * fetch() for `${API_BASE}${path}`. Returns the Response for the caller to
 * interpret; only the session-level statuses are acted on here.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (STATE_CHANGING.has(method) && csrfToken !== null) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    headers,
    credentials: "same-origin",
  });

  // A failed login is a 401 too, but it is the Login screen's to report.
  if (response.status === 401 && path !== "/auth/login") {
    handlers.onUnauthenticated?.();
  } else if (response.status === 403) {
    const code = await errorCode(response);
    if (code === "PASSWORD_CHANGE_REQUIRED") handlers.onPasswordChangeRequired?.();
    if (code === "CSRF_INVALID") handlers.onCsrfInvalid?.();
  }

  return response;
}
