import { apiFetch } from "../lab-03/api-client.js";
import type { Priority, TicketStatus, UserSummary } from "../lab-03/tickets-api.js";

// Dashboard reads, docs/lab-04/api-spec.md sections 5.1 and 5.2.
//
// Each function returns the response's `data` or throws a DashboardRequestError.
// Only the kind of failure survives: the screens word their own messages, and
// no status code or server text reaches the page (ui-spec.md section 3.4).

export type ActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface DashboardWindow {
  from: string;
  to: string;
  timeZone: string;
}

export interface Metric {
  count: number;
  /** A client route, rendered as is and never built by the client (api-spec 5.1). */
  link: string | null;
}

export interface DashboardTicketItem {
  id: string;
  ticketNumber: string;
  summary: string;
  currentStatus: TicketStatus;
  updatedAt?: string;
  resolvedAt?: string;
}

export interface RequesterDashboardData {
  generatedAt: string;
  window: DashboardWindow;
  metrics: {
    openTickets: Metric;
    waitingForMe: Metric;
    updatedRecently: Metric;
    resolvedRecently: Metric;
  };
  lists: {
    needsAttention: DashboardTicketItem[];
    recentlyUpdated: DashboardTicketItem[];
    recentlyResolved: DashboardTicketItem[];
  };
}

export interface OpenActionItem {
  actionId: string;
  ticketId: string;
  ticketNumber: string;
  description: string;
  status: ActionStatus;
  actionAt: string;
}

export interface UrgentItem extends DashboardTicketItem {
  owner: UserSummary | null;
  createdAt: string;
}

export interface UserCounts {
  active: { REQUESTER: number; IT_STAFF: number; ADMINISTRATOR: number };
  inactive: number;
}

export interface StaffDashboardData {
  generatedAt: string;
  window: DashboardWindow;
  metrics: {
    unassigned: Metric;
    ownedByMe: Metric;
    myOpenActions: Metric;
  };
  byStatus: { status: TicketStatus; count: number; link: string }[];
  activeByItPriority: { itPriority: Priority; count: number; link: string }[];
  lists: {
    myOpenActions: OpenActionItem[];
    urgent: UrgentItem[];
    recentlyUpdated: DashboardTicketItem[];
  };
  /** Null for IT Staff; the Administrator's user counts otherwise (DEC-10). */
  users: UserCounts | null;
}

export type DashboardFailure = "FORBIDDEN" | "FAILED";

export class DashboardRequestError extends Error {
  constructor(readonly kind: DashboardFailure) {
    super(`dashboard request refused: ${kind}`);
    this.name = "DashboardRequestError";
  }
}

async function read<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path);
  } catch {
    throw new DashboardRequestError("FAILED");
  }
  if (response.ok) {
    try {
      return ((await response.json()) as { data: T }).data;
    } catch {
      throw new DashboardRequestError("FAILED");
    }
  }
  throw new DashboardRequestError(response.status === 403 ? "FORBIDDEN" : "FAILED");
}

/** GET /dashboard/requester (api-spec 5.1). */
export function fetchRequesterDashboard(): Promise<RequesterDashboardData> {
  return read<RequesterDashboardData>("/dashboard/requester");
}

/** GET /staff/dashboard (api-spec 5.2). */
export function fetchStaffDashboard(): Promise<StaffDashboardData> {
  return read<StaffDashboardData>("/staff/dashboard");
}
