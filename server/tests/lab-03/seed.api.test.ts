import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { seedDatabase } from "../../prisma/seed-lib.js";
import { hashPassword, verifyPassword } from "../../src/lab-03/password-hash.js";
import { createSession, resolveSession } from "../../src/lab-03/sessions.js";

// SEED-01 .. SEED-04 from docs/lab-03/tests.md section 2.2 (AC-62, AC-63).
//
// The fixture accounts are written out here as literals, from
// docs/lab-03/specification.md section 7.5, rather than imported from the
// seed. An expectation read from the code under test cannot fail.

const prisma = getPrisma();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "";

type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
type Account = { email: string; role: Role; isActive: boolean; mustChangePassword: boolean };

const ACCOUNTS: Account[] = [
  // The five Lab 2 Development Requesters, emails unchanged.
  { email: "napat.cha@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { email: "siriporn.mee@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { email: "thanawat.rat@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { email: "pimchanok.son@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { email: "kittipong.won@kmutt.ac.th", role: "REQUESTER", isActive: false, mustChangePassword: false },
  // The first-login fixture.
  { email: "chayanin.boo@kmutt.ac.th", role: "REQUESTER", isActive: true, mustChangePassword: true },
  // IT Staff and the Administrator.
  { email: "wichai.pra@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { email: "arisa.kon@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { email: "teerapat.boo@kmutt.ac.th", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { email: "nattapong.sae@kmutt.ac.th", role: "IT_STAFF", isActive: false, mustChangePassword: false },
  { email: "sasithorn.pho@kmutt.ac.th", role: "ADMINISTRATOR", isActive: true, mustChangePassword: false },
];
const SEEDED_EMAILS = ACCOUNTS.map((account) => account.email);

/** Seeded tickets belong to these three only (specification.md section 7.5). */
const TICKET_REQUESTERS = [
  "napat.cha@kmutt.ac.th",
  "siriporn.mee@kmutt.ac.th",
  "thanawat.rat@kmutt.ac.th",
];

/** The Lab 2 empty-list fixture (L2 AC-24), which the seed must leave ticket-free. */
const EMPTY_REQUESTER = "pimchanok.son@kmutt.ac.th";

const STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const reseed = () => seedDatabase(prisma, { password: SEED_PASSWORD });

/** Row counts of every table the seed can touch. */
async function countAll() {
  const [
    categories,
    relatedSystems,
    users,
    tickets,
    attachments,
    sequences,
    comments,
    notes,
    events,
    sessions,
  ] = await Promise.all([
    prisma.category.count(),
    prisma.relatedSystem.count(),
    prisma.user.count(),
    prisma.ticket.count(),
    prisma.attachment.count(),
    prisma.ticketNumberSequence.count(),
    prisma.publicComment.count(),
    prisma.internalNote.count(),
    prisma.ticketEvent.count(),
    prisma.session.count(),
  ]);
  return {
    categories,
    relatedSystems,
    users,
    tickets,
    attachments,
    sequences,
    comments,
    notes,
    events,
    sessions,
  };
}

beforeAll(() => {
  expect(SEED_PASSWORD, "SEED_PASSWORD must be set in server/.env").not.toBe("");
});

afterAll(async () => {
  // SEED-02 alters fixtures; leave them as every other suite expects them.
  await reseed();
  await prisma.$disconnect();
});

describe("seed idempotency (SEED-01 - AC-62)", () => {
  it("leaves every table's row count unchanged when run twice", async () => {
    await reseed();
    const first = await countAll();

    await reseed();

    expect(await countAll()).toEqual(first);
  }, 60_000);
});

describe("seed fixture reset (SEED-02 - AC-62)", () => {
  it("restores an altered account's password, flag, role, and activation and revokes its session", async () => {
    const target = await prisma.user.findUniqueOrThrow({
      where: { email: "wichai.pra@kmutt.ac.th" },
    });
    await prisma.user.update({
      where: { id: target.id },
      data: {
        passwordHash: await hashPassword("an altered password, not the seed one"),
        mustChangePassword: true,
        role: "REQUESTER",
        isActive: false,
      },
    });
    const { token } = await createSession(target.id);

    await reseed();

    const restored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword(restored.passwordHash!, SEED_PASSWORD)).toBe(true);
    expect(restored.mustChangePassword).toBe(false);
    expect(restored.role).toBe("IT_STAFF");
    expect(restored.isActive).toBe(true);
    expect(await resolveSession(token)).toBeNull();
  }, 60_000);

  it("puts the must-change fixture back into the must-change state", async () => {
    await prisma.user.update({
      where: { email: "chayanin.boo@kmutt.ac.th" },
      data: { mustChangePassword: false },
    });

    await reseed();

    const restored = await prisma.user.findUniqueOrThrow({
      where: { email: "chayanin.boo@kmutt.ac.th" },
    });
    expect(restored.mustChangePassword).toBe(true);
  }, 60_000);
});

describe("seeded accounts (SEED-03 - AC-63)", () => {
  it("contains exactly the specified accounts, by role, activation, and password-change state", async () => {
    const users = await prisma.user.findMany({ where: { email: { in: SEEDED_EMAILS } } });

    expect(users).toHaveLength(ACCOUNTS.length);
    for (const account of ACCOUNTS) {
      const user = users.find((u) => u.email === account.email);
      expect(user, `${account.email} is missing`).toBeDefined();
      expect(
        { role: user!.role, isActive: user!.isActive, mustChangePassword: user!.mustChangePassword },
        account.email,
      ).toEqual({
        role: account.role,
        isActive: account.isActive,
        mustChangePassword: account.mustChangePassword,
      });
    }
  });

  it("matches the counts in specification.md section 7.5", async () => {
    const users = await prisma.user.findMany({ where: { email: { in: SEEDED_EMAILS } } });
    const count = (predicate: (u: (typeof users)[number]) => boolean) => users.filter(predicate).length;

    expect(count((u) => u.role === "REQUESTER" && u.isActive && !u.mustChangePassword)).toBe(4);
    expect(count((u) => u.role === "REQUESTER" && !u.isActive)).toBe(1);
    expect(count((u) => u.role === "REQUESTER" && u.mustChangePassword)).toBe(1);
    expect(count((u) => u.role === "IT_STAFF" && u.isActive)).toBe(3);
    expect(count((u) => u.role === "IT_STAFF" && !u.isActive)).toBe(1);
    expect(count((u) => u.role === "ADMINISTRATOR" && u.isActive)).toBe(1);
  });

  it("gives every seeded account the SEED_PASSWORD", async () => {
    const users = await prisma.user.findMany({ where: { email: { in: SEEDED_EMAILS } } });

    for (const user of users) {
      expect(user.passwordHash, `${user.email} has no password`).not.toBeNull();
      expect(await verifyPassword(user.passwordHash!, SEED_PASSWORD), user.email).toBe(true);
    }
  }, 60_000);
});

describe("seeded tickets and history (SEED-04 - AC-63)", () => {
  const seededTickets = () =>
    prisma.ticket.findMany({
      where: { requester: { email: { in: TICKET_REQUESTERS } } },
      include: { owner: true },
    });

  it("has at least one ticket in every status and every priority", async () => {
    const tickets = await seededTickets();

    const statuses = new Set(tickets.map((t) => t.currentStatus));
    for (const status of STATUSES) {
      expect(statuses.has(status as never), `no seeded ticket is ${status}`).toBe(true);
    }
    const priorities = new Set(tickets.map((t) => t.requestedPriority));
    for (const priority of PRIORITIES) {
      expect(priorities.has(priority as never), `no seeded ticket is ${priority}`).toBe(true);
    }
  });

  it("has both assigned and unassigned tickets, owned only by IT Staff or Administrators", async () => {
    const tickets = await seededTickets();

    expect(tickets.some((t) => t.ownerId === null), "no unassigned ticket").toBe(true);
    expect(tickets.some((t) => t.ownerId !== null), "no assigned ticket").toBe(true);
    for (const ticket of tickets.filter((t) => t.owner !== null)) {
      expect(["IT_STAFF", "ADMINISTRATOR"], ticket.ticketNumber).toContain(ticket.owner!.role);
    }
  });

  it("leaves the Lab 2 empty-list Requester without a ticket", async () => {
    const owned = await prisma.ticket.count({ where: { requester: { email: EMPTY_REQUESTER } } });

    expect(owned).toBe(0);
  });

  it("has Public Comments from a Requester and from IT Staff, and an Internal Note from IT Staff", async () => {
    const commentRoles = (
      await prisma.publicComment.findMany({ include: { author: true } })
    ).map((c) => c.author.role);
    const noteRoles = (await prisma.internalNote.findMany({ include: { author: true } })).map(
      (n) => n.author.role,
    );

    expect(commentRoles).toContain("REQUESTER");
    expect(commentRoles).toContain("IT_STAFF");
    expect(noteRoles).toContain("IT_STAFF");
  });

  it("records Ticket Events consistent with each seeded owner and status", async () => {
    const tickets = await seededTickets();

    for (const ticket of tickets) {
      const latest = async (eventType: "OWNER_CHANGED" | "STATUS_CHANGED") =>
        prisma.ticketEvent.findFirst({
          where: { ticketId: ticket.id, eventType },
          orderBy: { createdAt: "desc" },
        });

      if (ticket.ownerId !== null) {
        const event = await latest("OWNER_CHANGED");
        expect(event, `${ticket.ticketNumber} has an owner but no OWNER_CHANGED event`).not.toBeNull();
        expect((event!.payload as { toOwnerId: string }).toOwnerId).toBe(ticket.ownerId);
      }
      if (ticket.currentStatus !== "NEW") {
        const event = await latest("STATUS_CHANGED");
        expect(event, `${ticket.ticketNumber} left NEW but has no STATUS_CHANGED event`).not.toBeNull();
        expect((event!.payload as { to: string }).to).toBe(ticket.currentStatus);
      }
    }
  });
});
