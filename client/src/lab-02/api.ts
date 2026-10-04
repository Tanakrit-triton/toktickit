// Lab 2 API client.
//
// Every function here returns parsed data or throws. Callers render a fixed,
// safe message on failure and never surface the thrown error: BR-28 forbids
// leaking a status code, stack trace, or path into the UI, and AC-05 is
// asserted by UI-04.
//
// Since Lab 3 #38 every call goes through apiFetch (src/lab-03/api-client.ts):
// relative /api/v1 URLs through the Vite proxy, the session cookie as identity,
// and the CSRF token on state changes. The X-Dev-Requester-Id header is gone.
// The leading requesterId parameters are kept so the callers and the Lab 2
// tests are unchanged; the server takes identity from the session and they
// are no longer sent (BR-03).

import { API_BASE, apiFetch } from "../lab-03/api-client.js";

type ListResponse<T> = { data: T[] };

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
  const response = await apiFetch(`/categories`);
  if (!response.ok) {
    throw new Error(`categories request failed with ${response.status}`);
  }
  return ((await response.json()) as ListResponse<ReferenceItem>).data;
}

/** GET /api/v1/related-systems -- active Related Systems (FR-07). Unscoped. */
export async function fetchRelatedSystems(): Promise<ReferenceItem[]> {
  const response = await apiFetch(`/related-systems`);
  if (!response.ok) {
    throw new Error(`related-systems request failed with ${response.status}`);
  }
  return ((await response.json()) as ListResponse<ReferenceItem>).data;
}

/**
 * POST /api/v1/tickets -- Scoped (DEC-02).
 *
 * requesterId is deliberately not sent: ownership is taken from the session on
 * the server and a body value would be ignored (BR-08).
 */
export async function createTicket(
  requesterId: string,
  input: CreateTicketInput,
): Promise<Ticket> {
  const response = await apiFetch(`/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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

export interface TicketListItem {
  id: string;
  ticketNumber: string;
  summary: string;
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  requestedPriority: string;
  currentStatus: string;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TicketListPage {
  data: TicketListItem[];
  meta: TicketListMeta;
}

export interface TicketListParams {
  q?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: string;
  sortBy: string;
  sortOrder: string;
  page: number;
  pageSize: number;
}

/**
 * GET /api/v1/tickets -- Scoped.
 *
 * Only defined parameters are sent. The server rejects unknown or empty ones
 * rather than defaulting them (BR-47), so sending `q=` for an empty search box
 * would be a 400 rather than "no search".
 */
export async function fetchTickets(
  requesterId: string,
  params: TicketListParams,
): Promise<TicketListPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const response = await apiFetch(`/tickets?${search.toString()}`);

  if (!response.ok) {
    throw new Error(`ticket list failed with ${response.status}`);
  }
  return (await response.json()) as TicketListPage;
}

export interface Attachment {
  id: string;
  ticketId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  status: "ACTIVE" | "REMOVED";
  removedAt: string | null;
  removedReason: string | null;
  uploadedBy?: { id: string; fullName: string };
}

export interface TicketDetail extends Ticket {
  attachments: Attachment[];
  /** Lab 3 additions (api-spec.md section 4); never itPriority or notes. */
  owner?: { id: string; fullName: string } | null;
  requesterIndicatedResolvedAt?: string | null;
}

/** GET /api/v1/tickets/{id} -- Scoped. A foreign ticket is refused as a miss. */
export async function fetchTicket(requesterId: string, ticketId: string): Promise<TicketDetail> {
  const response = await apiFetch(`/tickets/${ticketId}`);
  if (!response.ok) {
    throw new Error(`ticket request failed with ${response.status}`);
  }
  return ((await response.json()) as { data: TicketDetail }).data;
}

/**
 * A refusal the caller can act on without seeing the status code. The UI needs
 * to distinguish "too big", "wrong type" and "too many" to word its message,
 * and must not render the server's text verbatim (BR-28).
 */
export type UploadRefusal = "TOO_LARGE" | "UNSUPPORTED_TYPE" | "LIMIT_REACHED" | "FAILED";

export class AttachmentUploadError extends Error {
  constructor(readonly refusal: UploadRefusal) {
    super("attachment upload refused");
    this.name = "AttachmentUploadError";
  }
}

/** POST /api/v1/tickets/{id}/attachments -- Scoped, multipart. */
export async function uploadAttachment(
  requesterId: string,
  ticketId: string,
  file: File,
): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);

  const response = await apiFetch(`/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const refusal: UploadRefusal =
      response.status === 413
        ? "TOO_LARGE"
        : response.status === 415
          ? "UNSUPPORTED_TYPE"
          : response.status === 409
            ? "LIMIT_REACHED"
            : "FAILED";
    throw new AttachmentUploadError(refusal);
  }
  return ((await response.json()) as { data: Attachment }).data;
}

/** DELETE /api/v1/attachments/{id} -- Scoped soft removal. */
export async function removeAttachment(
  requesterId: string,
  attachmentId: string,
  removalReason: string,
): Promise<Attachment> {
  const response = await apiFetch(`/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ removalReason }),
  });
  if (!response.ok) {
    throw new Error(`attachment removal failed with ${response.status}`);
  }
  return ((await response.json()) as { data: Attachment }).data;
}

/** The download is a plain navigation so the browser handles the save dialogue. */
export function attachmentDownloadUrl(attachmentId: string): string {
  return `${API_BASE}/attachments/${attachmentId}/download`;
}
