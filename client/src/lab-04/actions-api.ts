import { apiFetch } from "../lab-03/api-client.js";
import { TicketRequestError } from "../lab-03/tickets-api.js";
import type { Priority, RequestFailure, StaffTicket, TicketStatus } from "../lab-03/tickets-api.js";

// Lab 4 client calls: Actions Taken, ticket history, and the versioned ticket
// writes (docs/lab-04/api-spec.md sections 2 and 3).
//
// Errors are thrown as WorkflowRequestError, a TicketRequestError that also
// keeps the server's error code. The screens need the code to tell
// STALE_UPDATE (reload offered, nothing re-fetched behind the user's back) from
// the other 409s (ui-spec.md sections 4.4 and 5). As in Lab 3, only a 409
// message and 422 field messages ever reach the page.

export type ActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface StaffUserRef {
  id: string;
  fullName: string;
  isActive: boolean;
}

/** ActionTaken, api-spec 1.2. */
export interface ActionTaken {
  id: string;
  ticketId: string;
  actionAt: string;
  description: string;
  result: string | null;
  status: ActionStatus;
  performedBy: StaffUserRef;
  createdBy: StaffUserRef;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActionSummary {
  total: number;
  open: number;
  outstandingFollowUps: number;
}

export interface ResolutionBlockers {
  openActions: number;
  outstandingFollowUps: number;
}

/**
 * GET /staff/tickets/{id} with the api-spec 3.1 additions. They are optional so
 * a Lab 3 body without them still renders.
 */
export type StaffTicketDetail = StaffTicket & {
  resolvedAt?: string | null;
  actionSummary?: ActionSummary;
  resolutionBlockers?: ResolutionBlockers | null;
};

/** POST and PATCH answer the action plus the ticket's new version (api-spec 2.2, 2.3). */
export interface ActionWriteResult {
  data: ActionTaken;
  ticketVersion: number;
}

export interface CreateActionInput {
  clientRequestId: string;
  actionAt: string;
  description: string;
  status: ActionStatus;
  result: string | null;
  performedById: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
}

/** Only the fields present are changed (api-spec 2.3). */
export type UpdateActionInput = { version: number } & Partial<Omit<CreateActionInput, "clientRequestId">>;

/** A Ticket Event, api-spec 3.4. */
export interface HistoryEvent {
  id: string;
  eventType: string;
  actor: { id: string; fullName: string } | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TicketHistory {
  data: HistoryEvent[];
  users: Record<string, string>;
}

export class WorkflowRequestError extends TicketRequestError {
  constructor(
    kind: RequestFailure,
    /** The server's error code, e.g. STALE_UPDATE; null when there was no body. */
    readonly code: string | null = null,
    conflictMessage: string | null = null,
    details: Record<string, string> = {},
  ) {
    super(kind, conflictMessage, details);
    this.name = "WorkflowRequestError";
  }
}

export const isStaleUpdate = (error: unknown) => error instanceof WorkflowRequestError && error.code === "STALE_UPDATE";

type ErrorBody = { error?: { code?: string; message?: string; details?: Record<string, string> } };

/** The whole response body on success; a WorkflowRequestError otherwise. */
async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path, init);
  } catch {
    throw new WorkflowRequestError("FAILED");
  }
  if (response.ok) {
    try {
      return (await response.json()) as T;
    } catch {
      throw new WorkflowRequestError("FAILED");
    }
  }

  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  const code = body.error?.code ?? null;
  switch (response.status) {
    case 404:
      throw new WorkflowRequestError("NOT_FOUND", code);
    case 403:
      throw new WorkflowRequestError("FORBIDDEN", code);
    case 409:
      throw new WorkflowRequestError("CONFLICT", code, body.error?.message ?? null);
    case 422:
      throw new WorkflowRequestError("VALIDATION", code, null, body.error?.details ?? {});
    default:
      throw new WorkflowRequestError("FAILED", code);
  }
}

function withJson(method: string, payload: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}

const dataOf = async <T>(request: Promise<{ data: T }>) => (await request).data;

/** GET /tickets/{id}/actions, in BR-19 order. Requester (own ticket), IT Staff, Administrator. */
export const fetchActions = (ticketId: string) => dataOf(send<{ data: ActionTaken[] }>(`/tickets/${ticketId}/actions`));

export const createAction = (ticketId: string, input: CreateActionInput) =>
  send<ActionWriteResult>(`/staff/tickets/${ticketId}/actions`, withJson("POST", input));

export const updateAction = (actionId: string, input: UpdateActionInput) =>
  send<ActionWriteResult>(`/staff/actions/${actionId}`, withJson("PATCH", input));

/** GET /staff/tickets/{id}/history, oldest first. */
export const fetchHistory = (ticketId: string) => send<TicketHistory>(`/staff/tickets/${ticketId}/history`);

// The three versioned ticket writes (api-spec 3.2). Same requests as the Lab 3
// client in tickets-api.ts; these keep the error code.

export const assignTicket = (ticketId: string, ownerId: string, version: number) =>
  dataOf(send<{ data: StaffTicketDetail }>(`/staff/tickets/${ticketId}/owner`, withJson("PUT", { ownerId, version })));

export const changeItPriority = (ticketId: string, itPriority: Priority, version: number) =>
  dataOf(send<{ data: StaffTicketDetail }>(`/staff/tickets/${ticketId}/it-priority`, withJson("PUT", { itPriority, version })));

/** `reason` is sent only for the targets that take one. */
export const changeStatus = (ticketId: string, status: TicketStatus, version: number, reason?: string) =>
  dataOf(
    send<{ data: StaffTicketDetail }>(
      `/staff/tickets/${ticketId}/status`,
      withJson("POST", reason === undefined ? { status, version } : { status, reason, version }),
    ),
  );
