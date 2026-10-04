import { apiFetch } from "./api-client.js";
import type { Role } from "./auth-api.js";
import type { Attachment } from "../lab-02/api.js";

// Ticket operations, comments, notes, and the resolution indication
// (docs/lab-03/api-spec.md sections 5 and 6).
//
// Every function returns the response's `data` or throws a TicketRequestError.
// Screens word their own messages from its kind. The one piece of server text
// a screen may show is a 409 message, which ui-spec.md 5.1 puts in the
// Conflict callout; status codes and error codes never reach the page (AC-68).

export type TicketStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface UserSummary {
  id: string;
  fullName: string;
}

/** GET /staff/tickets/{id}, api-spec.md 5.2. */
export interface StaffTicket {
  id: string;
  ticketNumber: string;
  ticketDate: string;
  requester: UserSummary & { email: string };
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  summary: string;
  description: string;
  requestedPriority: Priority;
  itPriority: Priority;
  currentStatus: TicketStatus;
  owner: UserSummary | null;
  requesterIndicatedResolvedAt: string | null;
  availableTransitions: TicketStatus[];
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

/** GET /staff/assignees, api-spec.md 5.3. */
export interface Assignee extends UserSummary {
  role: Role;
}

/** CommentOrNote, api-spec.md 1.6. */
export interface CommentOrNote {
  id: string;
  ticketId: string;
  author: UserSummary & { role: Role };
  body: string;
  createdAt: string;
}

export type RequestFailure = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "VALIDATION" | "FAILED";

export class TicketRequestError extends Error {
  constructor(
    readonly kind: RequestFailure,
    /** The server's message, kept only for a 409 (ui-spec.md 5.1 Conflict). */
    readonly conflictMessage: string | null = null,
    /** Per-field messages, kept only for a 422. */
    readonly details: Record<string, string> = {},
  ) {
    super(`ticket request refused: ${kind}`);
    this.name = "TicketRequestError";
  }
}

type ErrorBody = { error?: { message?: string; details?: Record<string, string> } };

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path, init);
  } catch {
    throw new TicketRequestError("FAILED");
  }
  if (response.ok) return ((await response.json()) as { data: T }).data;

  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  switch (response.status) {
    case 404:
      throw new TicketRequestError("NOT_FOUND");
    case 403:
      throw new TicketRequestError("FORBIDDEN");
    case 409:
      throw new TicketRequestError("CONFLICT", body.error?.message ?? null);
    case 422:
      throw new TicketRequestError("VALIDATION", null, body.error?.details ?? {});
    default:
      throw new TicketRequestError("FAILED");
  }
}

function withJson(method: string, payload?: unknown): RequestInit {
  if (payload === undefined) return { method };
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}

export const fetchStaffTicket = (ticketId: string) => send<StaffTicket>(`/staff/tickets/${ticketId}`);

export const fetchAssignees = () => send<Assignee[]>(`/staff/assignees`);

export const claimTicket = (ticketId: string) =>
  send<StaffTicket>(`/staff/tickets/${ticketId}/claim`, withJson("POST"));

export const assignTicket = (ticketId: string, ownerId: string) =>
  send<StaffTicket>(`/staff/tickets/${ticketId}/owner`, withJson("PUT", { ownerId }));

export const changeItPriority = (ticketId: string, itPriority: Priority) =>
  send<StaffTicket>(`/staff/tickets/${ticketId}/it-priority`, withJson("PUT", { itPriority }));

/** `reason` is sent only for the targets that take one (api-spec.md 5.7). */
export const changeStatus = (ticketId: string, status: TicketStatus, reason?: string) =>
  send<StaffTicket>(
    `/staff/tickets/${ticketId}/status`,
    withJson("POST", reason === undefined ? { status } : { status, reason }),
  );

export const fetchComments = (ticketId: string) => send<CommentOrNote[]>(`/tickets/${ticketId}/comments`);

export const postComment = (ticketId: string, body: string) =>
  send<CommentOrNote>(`/tickets/${ticketId}/comments`, withJson("POST", { body }));

export const fetchNotes = (ticketId: string) => send<CommentOrNote[]>(`/tickets/${ticketId}/notes`);

export const postNote = (ticketId: string, body: string) =>
  send<CommentOrNote>(`/tickets/${ticketId}/notes`, withJson("POST", { body }));

export const indicateAppearsResolved = (ticketId: string) =>
  send<{ requesterIndicatedResolvedAt: string }>(`/tickets/${ticketId}/appears-resolved`, withJson("POST"));
