import type { Prisma, PrismaClient, Role, TicketStatus } from "@prisma/client";
import { PRIORITY_ORDER, STATUS_ORDER } from "../lab-03/queue-query.js";
import { statusesForGroup } from "./status-groups.js";
import { dashboardWindow } from "./dashboard-window.js";

// The two dashboard payloads (docs/lab-04/api-spec.md sections 5.1 and 5.2,
// specification.md section 5.8). Every value is computed from the database
// at request time (BR-35); the counts are the section 5.3 reference queries.
// Lists hold at most 5 items, while counts are full counts (BR-37). Ties in a
// list's order are broken by id, so the order is stable.

const LIST_SIZE = 5;
const DESCRIPTION_LIMIT = 120;

const ACTIVE = [...statusesForGroup("ACTIVE")];
const DONE = [...statusesForGroup("DONE")];
const OPEN_ACTION_STATUSES = ["PLANNED", "IN_PROGRESS"] as const;
const ROLES: Role[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];

/** Cut to 120 characters in all, the last being "…" (api-spec section 5.2). */
export function cutDescription(text: string): string {
  return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT - 1)}…` : text;
}

const ticketItem = {
  id: true,
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect;

type TicketItemRow = Prisma.TicketGetPayload<{ select: typeof ticketItem }>;

const toTicketItem = (row: TicketItemRow) => ({
  id: row.id,
  ticketNumber: row.ticketNumber,
  summary: row.summary,
  currentStatus: row.currentStatus,
  updatedAt: row.updatedAt.toISOString(),
});

const windowOf = (now: Date) => {
  const window = dashboardWindow(now);
  return { from: window.from, json: { from: window.from.toISOString(), to: window.to.toISOString(), timeZone: window.timeZone } };
};

/** GET /dashboard/requester. Every query filters on requesterId = caller (BR-39). */
export async function requesterDashboard(prisma: PrismaClient, requesterId: string, now: Date = new Date()) {
  const { from, json: window } = windowOf(now);
  const mine = { requesterId };
  const recentlyResolvedWhere = { ...mine, currentStatus: { in: DONE }, resolvedAt: { gte: from } };

  const [openTickets, waitingForMe, updatedRecently, resolvedRecently, needsAttention, recentlyUpdated, recentlyResolved] =
    await Promise.all([
      prisma.ticket.count({ where: { ...mine, currentStatus: { in: ACTIVE } } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: "WAITING_FOR_REQUESTER" } }),
      prisma.ticket.count({ where: { ...mine, updatedAt: { gte: from } } }),
      prisma.ticket.count({ where: recentlyResolvedWhere }),
      prisma.ticket.findMany({
        where: { ...mine, currentStatus: "WAITING_FOR_REQUESTER" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: LIST_SIZE,
        select: ticketItem,
      }),
      prisma.ticket.findMany({
        where: { ...mine, updatedAt: { gte: from } },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: LIST_SIZE,
        select: ticketItem,
      }),
      prisma.ticket.findMany({
        where: recentlyResolvedWhere,
        orderBy: [{ resolvedAt: "desc" }, { id: "asc" }],
        take: LIST_SIZE,
        select: { ...ticketItem, resolvedAt: true },
      }),
    ]);

  return {
    generatedAt: window.to,
    window,
    metrics: {
      openTickets: { count: openTickets, link: "/tickets?statusGroup=ACTIVE" },
      waitingForMe: { count: waitingForMe, link: "/tickets?status=WAITING_FOR_REQUESTER" },
      updatedRecently: { count: updatedRecently, link: "/tickets?sortBy=updatedAt&sortOrder=desc" },
      resolvedRecently: { count: resolvedRecently, link: "/tickets?statusGroup=DONE" },
    },
    lists: {
      needsAttention: needsAttention.map(toTicketItem),
      recentlyUpdated: recentlyUpdated.map(toTicketItem),
      // resolvedAt is non-null here: the where clause requires it in the window.
      recentlyResolved: recentlyResolved.map((row) => ({ ...toTicketItem(row), resolvedAt: row.resolvedAt!.toISOString() })),
    },
  };
}

/** The Administrator's user counts (FR-12); IT Staff receive null. */
async function userCounts(prisma: PrismaClient) {
  const groups = await prisma.user.groupBy({ by: ["role", "isActive"], _count: { _all: true } });
  const active = Object.fromEntries(ROLES.map((role) => [role, 0])) as Record<Role, number>;
  let inactive = 0;
  for (const group of groups) {
    if (group.isActive) active[group.role] += group._count._all;
    else inactive += group._count._all;
  }
  return { active, inactive };
}

/** GET /staff/dashboard, for IT Staff and Administrators. */
export async function staffDashboard(
  prisma: PrismaClient,
  caller: { id: string; role: Role },
  now: Date = new Date(),
) {
  const { from, json: window } = windowOf(now);
  const active = { currentStatus: { in: ACTIVE } };
  // Actions on tickets outside the Active group are ignored (BR-35).
  const myOpenActionsWhere = { performedById: caller.id, status: { in: [...OPEN_ACTION_STATUSES] }, ticket: active };

  const [unassigned, ownedByMe, myOpenActions, statusGroups, priorityGroups, actions, urgent, recentlyUpdated, users] =
    await Promise.all([
      prisma.ticket.count({ where: { ownerId: null, ...active } }),
      prisma.ticket.count({ where: { ownerId: caller.id, ...active } }),
      prisma.actionTaken.count({ where: myOpenActionsWhere }),
      prisma.ticket.groupBy({ by: ["currentStatus"], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ["itPriority"], where: active, _count: { _all: true } }),
      prisma.actionTaken.findMany({
        where: myOpenActionsWhere,
        orderBy: [{ actionAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: LIST_SIZE,
        select: {
          id: true,
          ticketId: true,
          description: true,
          status: true,
          actionAt: true,
          ticket: { select: { ticketNumber: true } },
        },
      }),
      prisma.ticket.findMany({
        where: { itPriority: "URGENT", ...active },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: LIST_SIZE,
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          currentStatus: true,
          createdAt: true,
          owner: { select: { id: true, fullName: true } },
        },
      }),
      prisma.ticket.findMany({
        where: { updatedAt: { gte: from } },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: LIST_SIZE,
        select: ticketItem,
      }),
      caller.role === "ADMINISTRATOR" ? userCounts(prisma) : Promise.resolve(null),
    ]);

  // Every status and IT Priority is present, zeros included (api-spec section 5.2).
  const byStatusCount = new Map<TicketStatus, number>(statusGroups.map((g) => [g.currentStatus, g._count._all]));
  const byPriorityCount = new Map(priorityGroups.map((g) => [g.itPriority, g._count._all]));

  return {
    generatedAt: window.to,
    window,
    metrics: {
      unassigned: { count: unassigned, link: "/staff/queue?owner=unassigned&statusGroup=ACTIVE" },
      ownedByMe: { count: ownedByMe, link: "/staff/queue?owner=me&statusGroup=ACTIVE" },
      // The list items are the drill-down (specification section 5.8).
      myOpenActions: { count: myOpenActions, link: null },
    },
    byStatus: STATUS_ORDER.map((status) => ({
      status,
      count: byStatusCount.get(status) ?? 0,
      link: `/staff/queue?status=${status}`,
    })),
    activeByItPriority: [...PRIORITY_ORDER].reverse().map((itPriority) => ({
      itPriority,
      count: byPriorityCount.get(itPriority) ?? 0,
      link: `/staff/queue?itPriority=${itPriority}&statusGroup=ACTIVE`,
    })),
    lists: {
      myOpenActions: actions.map((action) => ({
        actionId: action.id,
        ticketId: action.ticketId,
        ticketNumber: action.ticket.ticketNumber,
        description: cutDescription(action.description),
        status: action.status,
        actionAt: action.actionAt.toISOString(),
      })),
      urgent: urgent.map((row) => ({
        id: row.id,
        ticketNumber: row.ticketNumber,
        summary: row.summary,
        currentStatus: row.currentStatus,
        owner: row.owner,
        createdAt: row.createdAt.toISOString(),
      })),
      recentlyUpdated: recentlyUpdated.map(toTicketItem),
    },
    users,
  };
}
