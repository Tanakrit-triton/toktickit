import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { ActionStatus, Priority, TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { loginAs, signInFields, type SignedIn } from "../helpers/session.js";

// PERF-01 from docs/lab-04/tests.md section 2.5 (AC-31, A-03, A-04).
//
// A smoke test on the development machine, not a load test (tests.md section
// 9): it catches an accidental N+1 query. 1,000 extra tickets, each with one
// action, are added, and each dashboard endpoint is called 20 times. The
// Requester calls are made by the Requester of all 1,000 tickets, and the
// staff calls by the Administrator who performs all 1,000 actions, so every
// query and the user counts have the extra rows to work through.

const prisma = getPrisma();

const ADMIN = "sasithorn.pho@kmutt.ac.th";
const REQ_PERF = "zz.perf.requester@example.test";
const MARKER = "[perf-71]";
const EXTRA_TICKETS = 1000;
const CALLS = 20;
const P95_LIMIT_MS = 500;

const STATUSES: TicketStatus[] = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED",
];
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const ACTION_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const DAY_MS = 86_400_000;

let requester: SignedIn;
let admin: SignedIn;

async function clearOwnTickets() {
  const where = { summary: { contains: MARKER } };
  await prisma.actionTaken.deleteMany({ where: { ticket: where } });
  await prisma.ticket.deleteMany({ where });
}

/** The 95th percentile by the nearest-rank method. */
function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}

async function timeCalls(who: SignedIn, url: string): Promise<number[]> {
  // One untimed call first, so connection set-up is not counted.
  expect((await who.agent.get(url)).status).toBe(200);
  const samples: number[] = [];
  for (let i = 0; i < CALLS; i += 1) {
    const started = performance.now();
    const res = await who.agent.get(url);
    samples.push(performance.now() - started);
    expect(res.status).toBe(200);
  }
  return samples;
}

beforeAll(async () => {
  const fields = await signInFields();
  const fixture = { fullName: "ZZ PERF Requester", role: "REQUESTER" as const, isActive: true, ...fields };
  await prisma.user.upsert({ where: { email: REQ_PERF }, update: fixture, create: { email: REQ_PERF, ...fixture } });
  const requesterId = (await prisma.user.findUniqueOrThrow({ where: { email: REQ_PERF } })).id;
  const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } })).id;
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: "asc" } });

  await clearOwnTickets();
  const now = Date.now();
  const tickets = Array.from({ length: EXTRA_TICKETS }, (_, i) => {
    const status = STATUSES[i % STATUSES.length];
    const createdAt = new Date(now - (30 + (i % 30)) * DAY_MS);
    // Spread over the last 14 days, so about half fall inside the window.
    const updatedAt = new Date(now - (i % 14) * DAY_MS - i * 1000);
    return {
      id: randomUUID(),
      // A year no real ticket uses, so the TKT-YYYY sequence is untouched.
      ticketNumber: `TKT-2099-${String(i + 1).padStart(5, "0")}`,
      requesterId,
      ownerId: i % 3 === 0 ? null : adminId,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: `${MARKER} ticket ${i + 1}`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority: PRIORITIES[i % PRIORITIES.length],
      itPriority: PRIORITIES[(i + 1) % PRIORITIES.length],
      currentStatus: status,
      resolvedAt: status === "RESOLVED" || status === "CLOSED" ? updatedAt : null,
      createdAt,
      updatedAt,
    };
  });
  await prisma.ticket.createMany({ data: tickets });
  await prisma.actionTaken.createMany({
    data: tickets.map((ticket, i) => {
      const status = ACTION_STATUSES[i % ACTION_STATUSES.length];
      return {
        ticketId: ticket.id,
        createdById: adminId,
        performedById: adminId,
        actionAt: new Date(ticket.createdAt.getTime() + DAY_MS),
        description: `Performance fixture action ${i + 1}, recorded to give the dashboard queries rows to scan.`,
        result: status === "COMPLETED" || status === "CANCELLED" ? "Recorded for the performance smoke test." : null,
        status,
        clientRequestId: randomUUID(),
      };
    }),
  });

  resetLoginThrottle();
  requester = await loginAs(REQ_PERF);
  admin = await loginAs(ADMIN);
}, 120_000);

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  await clearOwnTickets();
  await prisma.$disconnect();
});

describe("dashboard performance smoke (PERF-01 - AC-31)", () => {
  it.each([
    ["GET /dashboard/requester", () => requester, "/api/v1/dashboard/requester"],
    ["GET /staff/dashboard", () => admin, "/api/v1/staff/dashboard"],
  ] as const)(
    `%s answers ${CALLS} calls with a p95 under ${P95_LIMIT_MS} ms at ${EXTRA_TICKETS} extra tickets`,
    async (name, who, url) => {
      const samples = await timeCalls(who(), url);
      const result = p95(samples);

      // Recorded with the machine details for tests.md section 8 (A-04).
      console.info(
        `PERF-01 ${name}: p95 ${result.toFixed(1)} ms over ${CALLS} calls ` +
          `(min ${Math.min(...samples).toFixed(1)}, max ${Math.max(...samples).toFixed(1)}); ` +
          `${os.cpus()[0]?.model ?? "unknown CPU"}, ${os.cpus().length} logical cores, ` +
          `${Math.round(os.totalmem() / 2 ** 30)} GiB RAM, ${os.platform()} ${os.release()}, Node ${process.version}`,
      );
      expect(result).toBeLessThan(P95_LIMIT_MS);
    },
    60_000,
  );
});
