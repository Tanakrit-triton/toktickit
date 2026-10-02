import type { Prisma, PrismaClient } from "@prisma/client";
import { allocateTicketNumber } from "../src/lab-02/ticket-number.js";
import { hashPassword } from "../src/lab-03/password-hash.js";
import { revokeAllSessions } from "../src/lab-03/sessions.js";

// Lab 3 seed, per docs/lab-03/specification.md section 7.5.
//
// Idempotent. Reference data and users are upserted on their natural unique
// keys; tickets, comments, notes, and events on fixed UUIDs, so ids stay
// stable across runs and tests can hold references to them. A ticket receives
// its Ticket Number from the normal allocator only when first created.
//
// Every run also resets each seeded account's password, password-change flag,
// role, and activation to its fixture value and revokes its sessions (AC-62),
// which keeps first-login and password-change tests repeatable.
//
// All names and text are fictional.

type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type Status =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

const CATEGORIES = ["Account and Access", "Hardware", "Software", "Network"];

const RELATED_SYSTEMS = [
  "Campus Wi-Fi",
  "Corporate Laptop",
  "Email",
  "Grade Submission App",
  "LEB2 App",
  "Printer",
  "VPN",
];

type Account = {
  key: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
};

// The five Lab 2 Development Requesters keep their names and emails, so Lab 2
// tests and E2E specs that address them by name keep working. Pimchanok Sonthi
// is the Lab 2 empty-list fixture (L2 AC-24) and is given no ticket below.
export const SEED_ACCOUNTS: Account[] = [
  { key: "napat", fullName: "Napat Chaiwong", email: "napat.cha@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { key: "siriporn", fullName: "Siriporn Meesuk", email: "siriporn.mee@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { key: "thanawat", fullName: "Thanawat Rattana", email: "thanawat.rat@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { key: "pimchanok", fullName: "Pimchanok Sonthi", email: "pimchanok.son@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { key: "kittipong", fullName: "Kittipong Wong (inactive)", email: "kittipong.won@kmutt.ac.th", role: "REQUESTER", isActive: false, mustChangePassword: false },
  // The first-login fixture: the only seeded account that must change its password.
  { key: "chayanin", fullName: "Chayanin Boonmee", email: "chayanin.boo@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: true },
  { key: "wichai", fullName: "Wichai Prasert", email: "wichai.pra@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { key: "arisa", fullName: "Arisa Kongkaew", email: "arisa.kon@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { key: "teerapat", fullName: "Teerapat Boonsri", email: "teerapat.boo@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  // The ineligible-assignee and reopen-clearance fixture.
  { key: "nattapong", fullName: "Nattapong Saelim (inactive)", email: "nattapong.sae@kmutt.ac.th", role: "IT_STAFF", isActive: false, mustChangePassword: false },
  { key: "sasithorn", fullName: "Sasithorn Pholchai", email: "sasithorn.pho@kmutt.ac.th", role: "ADMINISTRATOR", isActive: true, mustChangePassword: false },
];

// ---------------------------------------------------------------------------
// Tickets and their history
//
// Each ticket's events replay how it reached its seeded owner and status, so
// the latest OWNER_CHANGED and STATUS_CHANGED always agree with the row.

type EventSpec =
  | { type: "OWNER_CHANGED"; actor: string; from: string | null; to: string; cause: "CLAIM" | "ASSIGN" }
  | { type: "STATUS_CHANGED"; actor: string; from: Status; to: Status; reason?: string }
  | { type: "RESOLUTION_INDICATED"; actor: string };

type TicketSpec = {
  n: number;
  requester: string;
  owner: string | null;
  category: string;
  system: string;
  summary: string;
  description: string;
  priority: Priority;
  status: Status;
  indicatedResolved: boolean;
  createdAt: string;
  events: EventSpec[];
  comments: { author: string; body: string }[];
  notes: { author: string; body: string }[];
};

const claim = (who: string): EventSpec[] => [
  { type: "OWNER_CHANGED", actor: who, from: null, to: who, cause: "CLAIM" },
  { type: "STATUS_CHANGED", actor: who, from: "NEW", to: "OPEN" },
];

const TICKETS: TicketSpec[] = [
  {
    n: 1,
    requester: "napat",
    owner: null,
    category: "Account and Access",
    system: "Email",
    summary: "Cannot sign in to campus email after password reset",
    description: "Since resetting my password yesterday, the email client rejects the new password on both laptop and phone.",
    priority: "LOW",
    status: "NEW",
    indicatedResolved: false,
    createdAt: "2026-09-21T02:00:00Z",
    events: [],
    comments: [],
    notes: [],
  },
  {
    n: 2,
    requester: "siriporn",
    owner: null,
    category: "Network",
    system: "Campus Wi-Fi",
    summary: "Wi-Fi drops every few minutes in Building 4",
    description: "The connection drops roughly every five minutes on the third floor of Building 4, on every device I have tried.",
    priority: "URGENT",
    status: "NEW",
    indicatedResolved: false,
    createdAt: "2026-09-22T03:00:00Z",
    events: [],
    comments: [],
    notes: [],
  },
  {
    n: 3,
    requester: "thanawat",
    owner: "wichai",
    category: "Software",
    system: "LEB2 App",
    summary: "LEB2 assignment upload stalls at 99 percent",
    description: "Uploading a PDF assignment to LEB2 stalls at 99 percent and never completes, even for a 1 MB file.",
    priority: "MEDIUM",
    status: "OPEN",
    indicatedResolved: false,
    createdAt: "2026-09-22T04:00:00Z",
    events: claim("wichai"),
    comments: [],
    notes: [],
  },
  {
    n: 4,
    requester: "napat",
    owner: "arisa",
    category: "Hardware",
    system: "Corporate Laptop",
    summary: "Laptop battery drains within one hour",
    description: "Since the last update the battery drops from full to empty in about an hour with only a browser open.",
    priority: "HIGH",
    status: "IN_PROGRESS",
    indicatedResolved: false,
    createdAt: "2026-09-23T02:30:00Z",
    events: [...claim("arisa"), { type: "STATUS_CHANGED", actor: "arisa", from: "OPEN", to: "IN_PROGRESS" }],
    comments: [
      { author: "arisa", body: "Thanks for the report. Could you bring the laptop to the IT counter on Thursday?" },
      { author: "napat", body: "Yes, I can come on Thursday afternoon." },
    ],
    notes: [{ author: "arisa", body: "Battery health reads 61 percent. Replacement part requested." }],
  },
  {
    n: 5,
    requester: "siriporn",
    owner: "teerapat",
    category: "Software",
    system: "VPN",
    summary: "VPN client refuses to connect from home",
    description: "The VPN client shows an authentication error from home, although it worked last week with the same account.",
    priority: "MEDIUM",
    status: "WAITING_FOR_REQUESTER",
    indicatedResolved: false,
    createdAt: "2026-09-23T06:00:00Z",
    events: [
      { type: "OWNER_CHANGED", actor: "wichai", from: null, to: "teerapat", cause: "ASSIGN" },
      { type: "STATUS_CHANGED", actor: "wichai", from: "NEW", to: "OPEN" },
      { type: "STATUS_CHANGED", actor: "teerapat", from: "OPEN", to: "IN_PROGRESS" },
      { type: "STATUS_CHANGED", actor: "teerapat", from: "IN_PROGRESS", to: "WAITING_FOR_REQUESTER" },
    ],
    comments: [
      { author: "teerapat", body: "Which version of the VPN client is installed? It is shown under Help, then About." },
    ],
    notes: [],
  },
  {
    n: 6,
    requester: "thanawat",
    owner: "wichai",
    category: "Hardware",
    system: "Printer",
    summary: "Printer on floor 2 prints blank pages",
    description: "The shared printer on floor 2 feeds paper but every page comes out blank, for any document.",
    priority: "HIGH",
    status: "RESOLVED",
    indicatedResolved: true,
    createdAt: "2026-09-24T02:00:00Z",
    events: [
      ...claim("wichai"),
      { type: "STATUS_CHANGED", actor: "wichai", from: "OPEN", to: "IN_PROGRESS" },
      { type: "RESOLUTION_INDICATED", actor: "thanawat" },
      { type: "STATUS_CHANGED", actor: "wichai", from: "IN_PROGRESS", to: "RESOLVED" },
    ],
    comments: [{ author: "wichai", body: "The toner cartridge was replaced. Please confirm that pages print correctly." }],
    notes: [{ author: "wichai", body: "Cartridge was a counterfeit batch. Reported to procurement." }],
  },
  {
    n: 7,
    requester: "napat",
    owner: "arisa",
    category: "Account and Access",
    system: "Grade Submission App",
    summary: "Grade Submission App shows the wrong course list",
    description: "The Grade Submission App lists last semester's courses instead of the current ones after I sign in.",
    priority: "LOW",
    status: "CLOSED",
    indicatedResolved: false,
    createdAt: "2026-09-15T02:00:00Z",
    events: [
      ...claim("arisa"),
      { type: "STATUS_CHANGED", actor: "arisa", from: "OPEN", to: "RESOLVED" },
      { type: "STATUS_CHANGED", actor: "arisa", from: "RESOLVED", to: "CLOSED" },
    ],
    comments: [{ author: "arisa", body: "The course cache was refreshed. The current semester now appears." }],
    notes: [],
  },
  {
    n: 8,
    requester: "siriporn",
    owner: "sasithorn",
    category: "Hardware",
    system: "Printer",
    summary: "Badge printer jams on every card",
    description: "The badge printer at the front desk jams on every card and shows a feeder error after the jam is cleared.",
    priority: "URGENT",
    status: "REOPENED",
    indicatedResolved: false,
    createdAt: "2026-09-16T02:00:00Z",
    events: [
      { type: "OWNER_CHANGED", actor: "sasithorn", from: null, to: "sasithorn", cause: "ASSIGN" },
      { type: "STATUS_CHANGED", actor: "sasithorn", from: "NEW", to: "OPEN" },
      { type: "STATUS_CHANGED", actor: "sasithorn", from: "OPEN", to: "RESOLVED" },
      {
        type: "STATUS_CHANGED",
        actor: "wichai",
        from: "RESOLVED",
        to: "REOPENED",
        reason: "The printer started jamming again the next day.",
      },
    ],
    comments: [],
    notes: [{ author: "wichai", body: "Feeder roller looks worn. Vendor visit may be needed." }],
  },
  {
    n: 9,
    requester: "thanawat",
    owner: null,
    category: "Network",
    system: "Campus Wi-Fi",
    summary: "Duplicate report of the Building 4 Wi-Fi drops",
    description: "Wi-Fi in Building 4 keeps disconnecting, the same problem as the ticket my colleague raised earlier.",
    priority: "MEDIUM",
    status: "CANCELLED",
    indicatedResolved: false,
    createdAt: "2026-09-22T05:00:00Z",
    events: [
      {
        type: "STATUS_CHANGED",
        actor: "teerapat",
        from: "NEW",
        to: "CANCELLED",
        reason: "Duplicate of the earlier Building 4 Wi-Fi ticket.",
      },
    ],
    comments: [],
    notes: [],
  },
];

// Fixed, valid version-4-shaped UUIDs: 5eed<kind>-0000-4000-8000-<ticket><index>.
const pad = (value: number, width: number) => String(value).padStart(width, "0");
const fixedId = (kind: number, ticket: number, index = 0) =>
  `5eed${pad(kind, 4)}-0000-4000-8000-${pad(ticket, 8)}${pad(index, 4)}`;
export const seedTicketId = (n: number) => fixedId(1, n);
const commentId = (n: number, i: number) => fixedId(2, n, i);
const noteId = (n: number, i: number) => fixedId(3, n, i);
const eventId = (n: number, i: number) => fixedId(4, n, i);

/** History entries are spaced a minute apart after the ticket's creation. */
const minutesAfter = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60 * 1000);

function eventPayload(event: EventSpec, ids: Map<string, string>): Prisma.InputJsonObject {
  switch (event.type) {
    case "OWNER_CHANGED":
      return {
        fromOwnerId: event.from === null ? null : ids.get(event.from)!,
        toOwnerId: ids.get(event.to)!,
        cause: event.cause,
      };
    case "STATUS_CHANGED":
      return event.reason === undefined
        ? { from: event.from, to: event.to }
        : { from: event.from, to: event.to, reason: event.reason };
    case "RESOLUTION_INDICATED":
      return {};
  }
}

// ---------------------------------------------------------------------------

export async function seedDatabase(
  prisma: PrismaClient,
  options: { password: string },
): Promise<void> {
  if (!options.password) {
    throw new Error(
      "SEED_PASSWORD is not set. Add the local development value from server/.env.example to server/.env.",
    );
  }

  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }
  for (const name of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }

  // Accounts: upserted by email, then reset to their fixture state.
  const userIds = new Map<string, string>();
  for (const account of SEED_ACCOUNTS) {
    const fixture = {
      fullName: account.fullName,
      role: account.role,
      isActive: account.isActive,
      mustChangePassword: account.mustChangePassword,
      passwordHash: await hashPassword(options.password),
      passwordChangedAt: null,
    };
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: fixture,
      create: { email: account.email, ...fixture },
    });
    await revokeAllSessions(user.id, prisma);
    userIds.set(account.key, user.id);
  }

  const categoryIds = new Map(
    (await prisma.category.findMany({ where: { name: { in: CATEGORIES } } })).map((c) => [c.name, c.id]),
  );
  const systemIds = new Map(
    (await prisma.relatedSystem.findMany({ where: { name: { in: RELATED_SYSTEMS } } })).map((s) => [
      s.name,
      s.id,
    ]),
  );

  for (const ticket of TICKETS) {
    const id = seedTicketId(ticket.n);
    const lastMinute = ticket.events.length + ticket.comments.length + ticket.notes.length;
    const state = {
      requesterId: userIds.get(ticket.requester)!,
      ownerId: ticket.owner === null ? null : userIds.get(ticket.owner)!,
      categoryId: categoryIds.get(ticket.category)!,
      relatedSystemId: systemIds.get(ticket.system)!,
      summary: ticket.summary,
      description: ticket.description,
      requestedPriority: ticket.priority,
      itPriority: ticket.priority,
      currentStatus: ticket.status,
      requesterIndicatedResolvedAt: ticket.indicatedResolved
        ? minutesAfter(ticket.createdAt, ticket.events.findIndex((e) => e.type === "RESOLUTION_INDICATED") + 1)
        : null,
      createdAt: new Date(ticket.createdAt),
      updatedAt: minutesAfter(ticket.createdAt, lastMinute),
    };

    await prisma.$transaction(async (tx) => {
      const existing = await tx.ticket.findUnique({ where: { id }, select: { id: true } });
      if (existing) {
        await tx.ticket.update({ where: { id }, data: state });
      } else {
        const ticketNumber = await allocateTicketNumber(tx, new Date(ticket.createdAt));
        await tx.ticket.create({ data: { id, ticketNumber, ...state } });
      }
    });

    // History is append-only (BR-46, BR-54): an existing row is left as it is.
    for (const [i, event] of ticket.events.entries()) {
      await prisma.ticketEvent.upsert({
        where: { id: eventId(ticket.n, i) },
        update: {},
        create: {
          id: eventId(ticket.n, i),
          ticketId: id,
          actorId: userIds.get(event.actor)!,
          eventType: event.type,
          payload: eventPayload(event, userIds),
          createdAt: minutesAfter(ticket.createdAt, i + 1),
        },
      });
    }
    for (const [i, comment] of ticket.comments.entries()) {
      await prisma.publicComment.upsert({
        where: { id: commentId(ticket.n, i) },
        update: {},
        create: {
          id: commentId(ticket.n, i),
          ticketId: id,
          authorId: userIds.get(comment.author)!,
          body: comment.body,
          createdAt: minutesAfter(ticket.createdAt, ticket.events.length + i + 1),
        },
      });
    }
    for (const [i, note] of ticket.notes.entries()) {
      await prisma.internalNote.upsert({
        where: { id: noteId(ticket.n, i) },
        update: {},
        create: {
          id: noteId(ticket.n, i),
          ticketId: id,
          authorId: userIds.get(note.author)!,
          body: note.body,
          createdAt: minutesAfter(ticket.createdAt, ticket.events.length + ticket.comments.length + i + 1),
        },
      });
    }
  }
}
