// Lab 2 API client.
//
// Every function here returns parsed data or throws. Callers render a fixed,
// safe message on failure and never surface the thrown error: BR-28 forbids
// leaking a status code, stack trace, or path into the UI, and AC-05 is
// asserted by UI-04.

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface DevRequester {
  id: string;
  fullName: string;
  email: string;
}

type ListResponse<T> = { data: T[] };

/**
 * GET /api/v1/dev-requesters
 *
 * Unscoped: this populates the selector before any Requester exists in
 * context. Only active Requesters are returned, filtered server-side (BR-10),
 * so the inactive seed fixture never reaches the client at all.
 */
export async function fetchDevRequesters(): Promise<DevRequester[]> {
  const response = await fetch(`${API_BASE}/api/v1/dev-requesters`);

  if (!response.ok) {
    throw new Error(`dev-requesters request failed with ${response.status}`);
  }

  const body = (await response.json()) as ListResponse<DevRequester>;
  return body.data;
}
