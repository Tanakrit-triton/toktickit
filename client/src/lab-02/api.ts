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

export interface ReferenceItem {
  id: number;
  name: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  ticketDate: string;
  requester: { id: string; fullName: string };
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  summary: string;
  requestedPriority: string;
  description: string;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  requestedPriority: string;
  description: string;
}

/**
 * A 422 carrying per-field messages (api-spec.md 1.3). Thrown rather than
 * returned so the caller cannot forget to check, and carrying only the details
 * map: the status code and any other server text stay out of the UI (BR-28).
 */
export class TicketValidationError extends Error {
  constructor(readonly details: Record<string, string>) {
    super("validation failed");
    this.name = "TicketValidationError";
  }
}

/** GET /api/v1/categories -- active Categories (FR-06). Unscoped. */
export async function fetchCategories(): Promise<ReferenceItem[]> {
  const response = await fetch(`${API_BASE}/api/v1/categories`);
  if (!response.ok) {
    throw new Error(`categories request failed with ${response.status}`);
  }
  return ((await response.json()) as ListResponse<ReferenceItem>).data;
}

/** GET /api/v1/related-systems -- active Related Systems (FR-07). Unscoped. */
export async function fetchRelatedSystems(): Promise<ReferenceItem[]> {
  const response = await fetch(`${API_BASE}/api/v1/related-systems`);
  if (!response.ok) {
    throw new Error(`related-systems request failed with ${response.status}`);
  }
  return ((await response.json()) as ListResponse<ReferenceItem>).data;
}

/**
 * POST /api/v1/tickets -- Scoped (DEC-02).
 *
 * requesterId is deliberately not sent: ownership is taken from the header on
 * the server and a body value would be ignored (BR-08).
 */
export async function createTicket(
  requesterId: string,
  input: CreateTicketInput,
): Promise<Ticket> {
  const response = await fetch(`${API_BASE}/api/v1/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dev-Requester-Id": requesterId,
    },
    body: JSON.stringify(input),
  });

  if (response.status === 422) {
    const body = (await response.json()) as { error: { details?: Record<string, string> } };
    throw new TicketValidationError(body.error.details ?? {});
  }
  if (!response.ok) {
    throw new Error(`create ticket failed with ${response.status}`);
  }
  return ((await response.json()) as { data: Ticket }).data;
}
