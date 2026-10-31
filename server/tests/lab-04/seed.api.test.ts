import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { seedDatabase, seedTicketId } from "../../prisma/seed-lib.js";
import { validateActionFields } from "../../src/lab-04/action-validation.js";
import { countResolutionBlockers, isResolutionBlocked } from "../../src/lab-04/resolution-gate.js";

// SEED-01 and SEED-02 from docs/lab-04/tests.md section 2.2 (AC-34).
//
// The fixtures are written out here from docs/lab-04/specification.md section
// 7.5 and Amendment 2, rather than imported from the seed. seedTicketId() is
// only the fixed-id scheme Lab 3 already uses, not an expected value.

const prisma = getPrisma();
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "";
const reseed = () => seedDatabase(prisma, { password: SEED_PASSWORD });

const ACTIVE = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
const DONE = ["RESOLVED", "CLOSED"];
const TICKET_REQUESTERS = ["napat.cha@kmutt.ac.th", "siriporn.mee@kmutt.ac.th", "thanawat.rat@kmutt.ac.th"];

/**
 * BR-36: 00:00 Asia/Bangkok (fixed +07:00), six calendar days before today.
 * Computed here independently of the dashboard code.
 */
function recentWindowStart(now: Date): Date {
  const BANGKOK_MS = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + BANGKOK_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 6);
  return new Date(midnight - BANGKOK_MS);
}

const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

const actionsOf = (ticketId: string) =>
  prisma.actionTaken.findMany({ where: { ticketId }, orderBy: [{ actionAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] });

const seededTickets = () =>
  prisma.ticket.findMany({ where: { requester: { email: { in: TICKET_REQUESTERS } } } });

beforeAll(() => {
  expect(SEED_PASSWORD, "SEED_PASSWORD must be set in server/.env").not.toBe("");
});

afterAll(async () => {
  // SEED-01 alters fixtures; leave them as every other suite expects them.
  await reseed();
  await prisma.$disconnect();
});

describe("seed idempotency and reset (SEED-01 - AC-34)", () => {
  it("restores an edited action and a ticket's version and resolvedAt, with no duplicate", async () => {
    await reseed();
    const counts = async () => ({
      actions: await prisma.actionTaken.count(),
      tickets: await prisma.ticket.count(),
      events: await prisma.ticketEvent.count(),
    });
    const before = await counts();
    const actions = await prisma.actionTaken.findMany({ orderBy: { id: "asc" } });
    expect(actions.length, "the seed creates actions").toBeGreaterThan(0);
    const resolvedTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: seedTicketId(6) } });
    expect(resolvedTicket.resolvedAt, "the seeded RESOLVED ticket has resolvedAt").not.toBeNull();

    // Alter one action every way an edit could, and one ticket's version fields.
    const edited = actions[0];
    await prisma.actionTaken.update({
      where: { id: edited.id },
      data: {
        status: "CANCELLED",
        description: "Edited by SEED-01.",
        result: "Edited by SEED-01.",
        followUpRequired: true,
        followUpNote: "Edited by SEED-01.",
        attachmentNotes: "Edited by SEED-01.",
        actionAt: new Date("2026-10-01T00:00:00Z"),
        version: 9,
      },
    });
    await prisma.ticket.update({ where: { id: seedTicketId(6) }, data: { version: 7, resolvedAt: null } });

    const started = Date.now();
    await reseed();
    const elapsed = Date.now() - started;

    expect(await counts()).toEqual(before);
    expect(await prisma.actionTaken.findMany({ orderBy: { id: "asc" } })).toEqual(actions);

    const restored = await prisma.ticket.findUniqueOrThrow({ where: { id: seedTicketId(6) } });
    expect(restored.version).toBe(resolvedTicket.version);
    // A recent resolvedAt is relative to the run, so it moves by at most the
    // time between the two runs.
    expect(restored.resolvedAt).not.toBeNull();
    const drift = restored.resolvedAt!.getTime() - resolvedTicket.resolvedAt!.getTime();
    expect(drift).toBeGreaterThanOrEqual(0);
    expect(drift).toBeLessThanOrEqual(elapsed + 60_000);
  }, 120_000);

  it("keeps fixed ids and clientRequestIds across runs", async () => {
    const first = await prisma.actionTaken.findMany({ select: { id: true, clientRequestId: true }, orderBy: { id: "asc" } });
    await reseed();
    const second = await prisma.actionTaken.findMany({ select: { id: true, clientRequestId: true }, orderBy: { id: "asc" } });

    expect(second).toEqual(first);
  }, 120_000);
});

describe("seed fixtures (SEED-02 - AC-34, section 7.5)", () => {
  it("has a zero-action fixture on the seeded OPEN ticket", async () => {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: seedTicketId(3) } });
    expect(ticket.currentStatus).toBe("OPEN");
    expect(await actionsOf(ticket.id)).toEqual([]);
  });

  it("has an Active ticket with exactly one COMPLETED action, no follow-up, that is resolvable", async () => {
    const tickets = await prisma.ticket.findMany({
      where: { currentStatus: { in: ACTIVE as never[] } },
      include: { actions: true },
    });
    const single = tickets.filter(
      (t) => t.actions.length === 1 && t.actions[0].status === "COMPLETED" && !t.actions[0].followUpRequired,
    );
    expect(single.length).toBeGreaterThan(0);
    for (const t of single) expect(isResolutionBlocked(countResolutionBlockers(t.actions))).toBe(false);
  });

  it("gives the seeded IN_PROGRESS ticket the four specified actions, with resolution blocked", async () => {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: seedTicketId(4) }, include: { owner: true } });
    expect(ticket.currentStatus).toBe("IN_PROGRESS");
    const actions = await prisma.actionTaken.findMany({ where: { ticketId: ticket.id }, include: { performedBy: true } });

    expect(actions.map((a) => a.status).sort()).toEqual(["CANCELLED", "COMPLETED", "IN_PROGRESS", "PLANNED"]);
    expect(actions.find((a) => a.status === "COMPLETED")!.performedById).toBe(ticket.ownerId);
    const inProgress = actions.find((a) => a.status === "IN_PROGRESS")!;
    expect(inProgress.performedById).not.toBe(ticket.ownerId);
    expect(inProgress.performedBy.role).toBe("IT_STAFF");
    expect(isResolutionBlocked(countResolutionBlockers(actions))).toBe(true);
  });

  it("gives the seeded WAITING_FOR_REQUESTER ticket one COMPLETED action with a follow-up, blocked", async () => {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: seedTicketId(5) } });
    expect(ticket.currentStatus).toBe("WAITING_FOR_REQUESTER");
    const actions = await actionsOf(ticket.id);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ status: "COMPLETED", followUpRequired: true });
    expect(actions[0].followUpNote).not.toBeNull();
    expect(countResolutionBlockers(actions)).toEqual({ openActions: 0, outstandingFollowUps: 1 });
  });

  it("has a RESOLVED and a CLOSED ticket resolved recently, and a Done ticket resolved before the window", async () => {
    const start = recentWindowStart(new Date());
    const done = (await seededTickets()).filter((t) => DONE.includes(t.currentStatus));
    const recent = done.filter((t) => t.resolvedAt !== null && t.resolvedAt >= start && t.resolvedAt <= new Date());

    expect(recent.some((t) => t.currentStatus === "RESOLVED"), "no recent RESOLVED").toBe(true);
    expect(recent.some((t) => t.currentStatus === "CLOSED"), "no recent CLOSED").toBe(true);
    expect(done.some((t) => t.resolvedAt !== null && t.resolvedAt < start), "no Done ticket outside the window").toBe(true);
  });

  it("sets resolvedAt on every seeded Done ticket and on no other (BR-25)", async () => {
    for (const t of await seededTickets()) {
      if (DONE.includes(t.currentStatus)) expect(t.resolvedAt, t.ticketNumber).not.toBeNull();
      else expect(t.resolvedAt, t.ticketNumber).toBeNull();
    }
  });

  it("adds ticket #10: CLOSED, Thanawat's, owned by Wichai, resolved before the window (Amendment 2)", async () => {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: seedTicketId(10) } });

    expect(ticket.currentStatus).toBe("CLOSED");
    expect(ticket.requesterId).toBe(await userId("thanawat.rat@kmutt.ac.th"));
    expect(ticket.ownerId).toBe(await userId("wichai.pra@kmutt.ac.th"));
    expect(ticket.resolvedAt!.getTime()).toBeLessThan(recentWindowStart(new Date()).getTime());
  });

  it("adds ticket #11: WAITING_FOR_REQUESTER, Napat's, owned by Wichai, one PLANNED action by Arisa, blocked (Amendment 2)", async () => {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: seedTicketId(11) } });

    expect(ticket.currentStatus).toBe("WAITING_FOR_REQUESTER");
    expect(ticket.requesterId).toBe(await userId("napat.cha@kmutt.ac.th"));
    expect(ticket.ownerId).toBe(await userId("wichai.pra@kmutt.ac.th"));
    const actions = await actionsOf(ticket.id);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ status: "PLANNED", performedById: await userId("arisa.kon@kmutt.ac.th") });
    expect(isResolutionBlocked(countResolutionBlockers(actions))).toBe(true);
  });

  it("keeps the zero-metric fixtures: Pimchanok has no ticket, Teerapat performs no open action", async () => {
    expect(await prisma.ticket.count({ where: { requester: { email: "pimchanok.son@kmutt.ac.th" } } })).toBe(0);
    expect(
      await prisma.actionTaken.count({
        where: { performedBy: { email: "teerapat.boo@kmutt.ac.th" }, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      }),
    ).toBe(0);
  });

  it("has the non-zero fixtures: Napat waiting, Arisa's open actions including another owner's ticket, an URGENT Active ticket", async () => {
    expect(
      await prisma.ticket.count({
        where: { requester: { email: "napat.cha@kmutt.ac.th" }, currentStatus: "WAITING_FOR_REQUESTER" },
      }),
    ).toBeGreaterThan(0);

    const arisa = await userId("arisa.kon@kmutt.ac.th");
    const open = await prisma.actionTaken.findMany({
      where: { performedById: arisa, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      include: { ticket: true },
    });
    expect(open.length).toBeGreaterThan(0);
    expect(open.some((a) => a.ticket.ownerId !== arisa), "no open action on another owner's ticket").toBe(true);

    expect(
      await prisma.ticket.count({ where: { itPriority: "URGENT", currentStatus: { in: ACTIVE as never[] } } }),
    ).toBeGreaterThan(0);
  });

  it("only seeds actions that satisfy the action rules, performed and recorded by staff", async () => {
    const actions = await prisma.actionTaken.findMany({ include: { ticket: true, performedBy: true, createdBy: true } });

    for (const action of actions) {
      const checked = validateActionFields(action, {
        status: action.status,
        ticketCreatedAt: action.ticket.createdAt,
        now: new Date(),
      });
      expect(checked.ok, `${action.id}: ${JSON.stringify(checked)}`).toBe(true);
      expect(["IT_STAFF", "ADMINISTRATOR"], action.id).toContain(action.performedBy.role);
      expect(["IT_STAFF", "ADMINISTRATOR"], action.id).toContain(action.createdBy.role);
    }
  });
});
