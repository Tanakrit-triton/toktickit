import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { loginAs, signInFields, type SignedIn } from "../helpers/session.js";

// QUE-01 to QUE-11 from docs/lab-03/tests.md section 2.5 (AC-16, AC-28 to
// AC-32).
//
// The queue spans every ticket, seeded ones included, so this suite creates
// its own 25 tickets and isolates them with a word that appears in every one
// of their summaries and in no seeded ticket. Every expected set below is
// taken from the FIXTURES literal, never from querying the table the endpoint
// reads. Orderings are checked pair by pair against the documented rule, not
// against a sort written in the test.
//
// Seeded accounts are only signed in as, never altered. The users and tickets
// this suite creates are its own, and afterAll removes them.

const prisma = getPrisma();

const STAFF_SEEDED = "wichai.pra@kmutt.ac.th";
const ADMIN = "sasithorn.pho@kmutt.ac.th";
const REQUESTER = "napat.cha@kmutt.ac.th";

const MARKER = "zqueue39";
const PROJECTOR = "Zephyrscope"; // a summary word in every fifth ticket
const DESCRIPTION_ONLY = "Xylograph"; // in every description, never in a summary
const NUMBER_PREFIX = "TKT-2099-9"; // a year no allocator reaches during the course

const USERS = {
  reqA: { email: "zz.queue.a@example.test", fullName: "ZZ Queue Quokka Alpha", role: "REQUESTER" },
  reqB: { email: "zz.queue.b@example.test", fullName: "ZZ Queue Quokka Beta", role: "REQUESTER" },
  staffMe: { email: "zz.queue.me@example.test", fullName: "ZZ Queue Wombat Staff", role: "IT_STAFF" },
  staffOther: { email: "zz.queue.other@example.test", fullName: "ZZ Queue Other Staff", role: "IT_STAFF" },
} as const;
type UserKey = keyof typeof USERS;

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const LIFECYCLE = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
  "REOPENED", "RESOLVED", "CLOSED", "CANCELLED",
] as const;
// Declaration order in the schema, deliberately different from LIFECYCLE.
const STATUSES = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
  "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
] as const;

const TOTAL = 25;

type Fixture = {
  index: number;
  ticketNumber: string;
  requester: "reqA" | "reqB";
  owner: "staffMe" | "staffOther" | null;
  status: (typeof STATUSES)[number];
  itPriority: (typeof PRIORITIES)[number];
  requestedPriority: (typeof PRIORITIES)[number];
  category: "Hardware" | "Software";
  summary: string;
  createdAt: Date;
  updatedAt: Date;
};

// Each attribute cycles with a different period, so no two sort keys agree
// and every tie in the primary key is broken by createdAt.
const FIXTURES: Fixture[] = Array.from({ length: TOTAL }, (_, index) => {
  const status = STATUSES[index % 8];
  const owner = status === "NEW" ? null : (["staffMe", null, "staffOther"] as const)[index % 3];
  return {
    index,
    // Scrambled against creation order: 11 and 25 are coprime.
    ticketNumber: `${NUMBER_PREFIX}${String(((index * 11) % TOTAL) + 1).padStart(4, "0")}`,
    requester: index % 2 === 0 ? "reqA" : "reqB",
    owner,
    status,
    itPriority: PRIORITIES[index % 4],
    // Never equal to itPriority, so a sort on the wrong column shows.
    requestedPriority: PRIORITIES[(index + 2) % 4],
    category: index % 2 === 0 ? "Hardware" : "Software",
    summary: `${MARKER} ${index % 5 === 0 ? `${PROJECTOR} flickers in room` : "Laptop battery drains"} ${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1 + index, 9, 0, 0)),
    // Scrambled against creation order: 7 and 25 are coprime.
    updatedAt: new Date(Date.UTC(2026, 5, 1, (index * 7) % TOTAL, 0, 0)),
  };
});

const userIds: Record<UserKey, string> = { reqA: "", reqB: "", staffMe: "", staffOther: "" };
const categoryIds = { Hardware: 0, Software: 0 };
const ticketIdByNumber = new Map<string, string>();

let staff: SignedIn;
let staffMe: SignedIn;
let admin: SignedIn;
let requester: SignedIn;

const FORBIDDEN = { error: { code: "FORBIDDEN", message: expect.any(String) } };
const BAD_REQUEST = { error: { code: "BAD_REQUEST", message: expect.any(String) } };

type Item = {
  id: string;
  ticketNumber: string;
  summary: string;
  requester: { id: string; fullName: string };
  category: { id: number; name: string };
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  owner: { id: string; fullName: string } | null;
  requesterIndicatedResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function queue(who: SignedIn, query: Record<string, string | number> = {}) {
  const params = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  const suffix = params.toString() === "" ? "" : `?${params}`;
  return who.agent.get(`/api/v1/staff/tickets${suffix}`);
}

/** Only this suite's tickets, all on one page. */
async function ours(who: SignedIn, query: Record<string, string | number> = {}): Promise<Item[]> {
  const res = await queue(who, { q: MARKER, pageSize: 50, ...query });
  expect(res.status).toBe(200);
  return res.body.data as Item[];
}

const numbers = (items: Item[]) => items.map((item) => item.ticketNumber).sort();
const expected = (keep: (f: Fixture) => boolean) =>
  FIXTURES.filter(keep).map((f) => f.ticketNumber).sort();

const fixtureFor = (item: Item) => FIXTURES.find((f) => f.ticketNumber === item.ticketNumber)!;
const pRank = (p: string) => PRIORITIES.indexOf(p as (typeof PRIORITIES)[number]);
const sRank = (s: string) => LIFECYCLE.indexOf(s as (typeof LIFECYCLE)[number]);
const time = (iso: string) => new Date(iso).getTime();

/**
 * Asserts each adjacent pair is ordered by `primary` in the given direction,
 * and that a tie falls back to createdAt ascending.
 */
function expectOrdered(items: Item[], primary: (item: Item) => number | string, order: "asc" | "desc") {
  for (let i = 1; i < items.length; i++) {
    const [a, b] = [primary(items[i - 1]), primary(items[i])];
    if (a === b) {
      expect(time(items[i - 1].createdAt)).toBeLessThan(time(items[i].createdAt));
    } else if (order === "asc") {
      expect(a < b).toBe(true);
    } else {
      expect(a > b).toBe(true);
    }
  }
}

/** The distinct values in the order they first appear. */
const runs = (values: string[]) => values.filter((v, i) => i === 0 || values[i - 1] !== v);

async function removeOwnData() {
  const emails = Object.values(USERS).map((u) => u.email);
  await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: NUMBER_PREFIX } } });
  await prisma.session.deleteMany({ where: { user: { email: { in: emails } } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

beforeAll(async () => {
  resetLoginThrottle();
  // A run that died before afterAll would otherwise collide on ticketNumber.
  await removeOwnData();

  const signIn = await signInFields();
  for (const key of Object.keys(USERS) as UserKey[]) {
    const user = USERS[key];
    const row = await prisma.user.create({
      data: { email: user.email, fullName: user.fullName, role: user.role, isActive: true, ...signIn },
    });
    userIds[key] = row.id;
  }

  for (const name of ["Hardware", "Software"] as const) {
    categoryIds[name] = (await prisma.category.findUniqueOrThrow({ where: { name } })).id;
  }
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  for (const f of FIXTURES) {
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: f.ticketNumber,
        requesterId: userIds[f.requester],
        ownerId: f.owner === null ? null : userIds[f.owner],
        categoryId: categoryIds[f.category],
        relatedSystemId: relatedSystem.id,
        summary: f.summary,
        description: `${DESCRIPTION_ONLY} appears only in this description.`,
        requestedPriority: f.requestedPriority,
        itPriority: f.itPriority,
        currentStatus: f.status,
        createdAt: f.createdAt,
      },
    });
    // @updatedAt is set by Prisma on every write, so the fixture value is
    // written directly.
    await prisma.$executeRaw`UPDATE "Ticket" SET "updatedAt" = ${f.updatedAt} WHERE id = ${ticket.id}`;
    ticketIdByNumber.set(f.ticketNumber, ticket.id);
  }

  staff = await loginAs(STAFF_SEEDED);
  staffMe = await loginAs(USERS.staffMe.email);
  admin = await loginAs(ADMIN);
  requester = await loginAs(REQUESTER);
});

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  await removeOwnData();
});

describe("QUE-01 queue contents (AC-28)", () => {
  it("shows IT Staff and the Administrator tickets from every Requester", async () => {
    for (const who of [staff, admin]) {
      const items = await ours(who);
      expect(numbers(items)).toEqual(expected(() => true));
      expect(new Set(items.map((item) => item.requester.id))).toEqual(
        new Set([userIds.reqA, userIds.reqB]),
      );
    }
  });

  it("includes seeded tickets from more than one seeded Requester", async () => {
    const res = await queue(staff, { pageSize: 50 });
    expect(res.status).toBe(200);
    const seededNames = new Set(
      (res.body.data as Item[])
        .filter((item) => !item.ticketNumber.startsWith(NUMBER_PREFIX))
        .map((item) => item.requester.fullName),
    );
    expect(seededNames.size).toBeGreaterThan(1);
  });

  it("carries exactly the api-spec 5.1 fields, and no description", async () => {
    const items = await ours(staff);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          "category", "createdAt", "currentStatus", "id", "itPriority", "owner",
          "requestedPriority", "requester", "requesterIndicatedResolvedAt",
          "summary", "ticketNumber", "updatedAt",
        ].sort(),
      );
      expect(item).not.toHaveProperty("description");
      expect(JSON.stringify(item)).not.toContain(DESCRIPTION_ONLY);
    }
  });

  it("returns each field's value from the ticket", async () => {
    const items = await ours(staff);
    for (const item of items) {
      const f = fixtureFor(item);
      expect(item).toEqual({
        id: ticketIdByNumber.get(f.ticketNumber),
        ticketNumber: f.ticketNumber,
        summary: f.summary,
        requester: { id: userIds[f.requester], fullName: USERS[f.requester].fullName },
        category: { id: categoryIds[f.category], name: f.category },
        requestedPriority: f.requestedPriority,
        itPriority: f.itPriority,
        currentStatus: f.status,
        owner: f.owner === null ? null : { id: userIds[f.owner], fullName: USERS[f.owner].fullName },
        requesterIndicatedResolvedAt: null,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      });
    }
  });
});

describe("QUE-02 Requester refused (AC-16, AC-28)", () => {
  it("gives a Requester the same 403 whatever the parameters", async () => {
    const queries: Record<string, string | number>[] = [
      {},
      { q: MARKER },
      { status: "OPEN", owner: "me", sortBy: "status", page: 2, pageSize: 10 },
      { pageSize: 25 },
      { foo: 1 },
    ];
    const bodies: string[] = [];
    for (const query of queries) {
      const res = await queue(requester, query);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
      expect(res.body).not.toHaveProperty("data");
      bodies.push(res.text);
    }
    expect(new Set(bodies).size).toBe(1);
  });
});

describe("QUE-03 search (AC-29)", () => {
  it("matches a partial Ticket Number, case-insensitively", async () => {
    const partial = `${NUMBER_PREFIX}001`.toLowerCase(); // tkt-2099-9001 -> 0010 to 0019
    const items = await ours(staff, { q: partial });
    expect(numbers(items)).toEqual(expected((f) => f.ticketNumber.toLowerCase().includes(partial)));
    expect(items.length).toBe(10);
  });

  it("matches a summary word, case-insensitively", async () => {
    const items = await ours(staff, { q: "zEPHYRSCOPE" });
    expect(numbers(items)).toEqual(expected((f) => f.index % 5 === 0));
    expect(items.length).toBe(5);
  });

  it("matches part of the Requester's name, case-insensitively", async () => {
    const items = await ours(staff, { q: "quokka ALPHA" });
    expect(numbers(items)).toEqual(expected((f) => f.requester === "reqA"));
    expect(items.length).toBe(13);
  });

  it("matches nothing else: not the description, the owner's name, or the category", async () => {
    for (const q of [DESCRIPTION_ONLY, "wombat", "ZZ Queue Other Staff"]) {
      const res = await queue(staff, { q });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.totalItems).toBe(0);
    }
    // "Hardware" names half of this suite's tickets' category and no summary.
    const items = await ours(staff, { q: `${MARKER} Hardware` });
    expect(items).toEqual([]);
  });
});

describe("QUE-04 status filter (AC-30)", () => {
  it("returns only tickets in the given status, for each status", async () => {
    for (const status of STATUSES) {
      const items = await ours(staff, { status });
      expect(numbers(items)).toEqual(expected((f) => f.status === status));
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item.currentStatus).toBe(status);
    }
  });
});

describe("QUE-05 IT Priority and category filters (AC-30)", () => {
  it("filters by IT Priority, not Requested Priority", async () => {
    for (const itPriority of PRIORITIES) {
      const items = await ours(staff, { itPriority });
      expect(numbers(items)).toEqual(expected((f) => f.itPriority === itPriority));
    }
  });

  it("filters by category", async () => {
    const items = await ours(staff, { categoryId: categoryIds.Software });
    expect(numbers(items)).toEqual(expected((f) => f.category === "Software"));
    expect(items.length).toBe(12);
  });

  it("applies both filters together", async () => {
    const items = await ours(staff, { itPriority: "MEDIUM", categoryId: categoryIds.Software });
    expect(numbers(items)).toEqual(
      expected((f) => f.itPriority === "MEDIUM" && f.category === "Software"),
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("returns nothing when the filters exclude each other", async () => {
    // Even indexes are Hardware; MEDIUM and URGENT fall on odd indexes only.
    const items = await ours(staff, { itPriority: "URGENT", categoryId: categoryIds.Hardware });
    expect(items).toEqual([]);
  });
});

describe("QUE-06 owner filter (AC-30)", () => {
  it("owner=me returns the caller's tickets", async () => {
    const items = await ours(staffMe, { owner: "me" });
    expect(numbers(items)).toEqual(expected((f) => f.owner === "staffMe"));
    expect(items.length).toBeGreaterThan(0);
  });

  it("owner=me is the caller, so another staff member gets their own set", async () => {
    // The seeded staff member owns none of this suite's tickets.
    expect(await ours(staff, { owner: "me" })).toEqual([]);
  });

  it("owner=unassigned returns tickets with no owner", async () => {
    const items = await ours(staff, { owner: "unassigned" });
    expect(numbers(items)).toEqual(expected((f) => f.owner === null));
    for (const item of items) expect(item.owner).toBeNull();
  });

  it("owner={uuid} returns that user's tickets", async () => {
    const items = await ours(staff, { owner: userIds.staffOther });
    expect(numbers(items)).toEqual(expected((f) => f.owner === "staffOther"));
    expect(items.length).toBeGreaterThan(0);
  });

  it("owner set to a Requester's UUID is a 400", async () => {
    const res = await queue(staff, { owner: userIds.reqA });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(BAD_REQUEST);
  });

  it("owner set to a UUID that matches no user is a 400", async () => {
    const res = await queue(staff, { owner: "3f8b0c22-0000-4000-8000-0000000000a7" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(BAD_REQUEST);
  });
});

describe("QUE-07 default order (AC-31)", () => {
  it("puts URGENT before HIGH, and within a priority the oldest first", async () => {
    const items = await ours(staff);
    expect(items.length).toBe(TOTAL);
    expect(runs(items.map((item) => item.itPriority))).toEqual(["URGENT", "HIGH", "MEDIUM", "LOW"]);
    expectOrdered(items, (item) => pRank(item.itPriority), "desc");
  });
});

describe("QUE-08 explicit sorts (AC-31)", () => {
  it("sorts itPriority ascending and descending by severity", async () => {
    const asc = await ours(staff, { sortBy: "itPriority", sortOrder: "asc" });
    expect(runs(asc.map((item) => item.itPriority))).toEqual(["LOW", "MEDIUM", "HIGH", "URGENT"]);
    expectOrdered(asc, (item) => pRank(item.itPriority), "asc");

    const desc = await ours(staff, { sortBy: "itPriority", sortOrder: "desc" });
    expect(runs(desc.map((item) => item.itPriority))).toEqual(["URGENT", "HIGH", "MEDIUM", "LOW"]);
    expectOrdered(desc, (item) => pRank(item.itPriority), "desc");
  });

  it("sorts status in lifecycle order, both directions", async () => {
    const asc = await ours(staff, { sortBy: "status", sortOrder: "asc" });
    expect(runs(asc.map((item) => item.currentStatus))).toEqual([...LIFECYCLE]);
    expectOrdered(asc, (item) => sRank(item.currentStatus), "asc");

    const desc = await ours(staff, { sortBy: "status", sortOrder: "desc" });
    expect(runs(desc.map((item) => item.currentStatus))).toEqual([...LIFECYCLE].reverse());
    expectOrdered(desc, (item) => sRank(item.currentStatus), "desc");
  });

  it("sorts updatedAt descending", async () => {
    const items = await ours(staff, { sortBy: "updatedAt", sortOrder: "desc" });
    expect(items.length).toBe(TOTAL);
    expectOrdered(items, (item) => time(item.updatedAt), "desc");
  });

  it("sorts ticketNumber ascending", async () => {
    const items = await ours(staff, { sortBy: "ticketNumber", sortOrder: "asc" });
    expect(items.map((item) => item.ticketNumber)).toEqual(expected(() => true));
  });

  it("sorts createdAt ascending and descending", async () => {
    const asc = await ours(staff, { sortBy: "createdAt", sortOrder: "asc" });
    expect(asc.map((item) => fixtureFor(item).index)).toEqual(FIXTURES.map((f) => f.index));

    const desc = await ours(staff, { sortBy: "createdAt" });
    expect(desc.map((item) => fixtureFor(item).index)).toEqual(FIXTURES.map((f) => f.index).reverse());
  });
});

describe("QUE-09 pagination (AC-32)", () => {
  it("defaults to 20 per page, and page 2 returns the rest with correct meta", async () => {
    const first = await queue(staff, { q: MARKER });
    expect(first.status).toBe(200);
    expect(first.body.meta).toEqual({ page: 1, pageSize: 20, totalItems: TOTAL, totalPages: 2 });
    expect(first.body.data).toHaveLength(20);

    const second = await queue(staff, { q: MARKER, page: 2 });
    expect(second.status).toBe(200);
    expect(second.body.meta).toEqual({ page: 2, pageSize: 20, totalItems: TOTAL, totalPages: 2 });
    expect(second.body.data).toHaveLength(5);

    const all = [...first.body.data, ...second.body.data] as Item[];
    expect(new Set(all.map((item) => item.id)).size).toBe(TOTAL);
    // The two pages are one continuous default order.
    expectOrdered(all, (item) => pRank(item.itPriority), "desc");
  });

  it("honours page size 10", async () => {
    const res = await queue(staff, { q: MARKER, pageSize: 10, page: 3 });
    expect(res.body.meta).toEqual({ page: 3, pageSize: 10, totalItems: TOTAL, totalPages: 3 });
    expect(res.body.data).toHaveLength(5);
  });
});

describe("QUE-10 invalid parameters (AC-32)", () => {
  it.each([
    ["pageSize=25", { pageSize: 25 }],
    ["foo=1", { foo: 1 }],
    ["owner=someone", { owner: "someone" }],
    ["status=ASSIGNED", { status: "ASSIGNED" }],
  ])("%s gives 400", async (_label, query) => {
    const res = await queue(staff, query);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(BAD_REQUEST);
  });

  it("a categoryId that does not exist gives 400", async () => {
    const res = await queue(staff, { categoryId: 999999 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(BAD_REQUEST);
  });
});

describe("QUE-11 page past the end (AC-32)", () => {
  it("returns empty data with correct meta", async () => {
    const res = await queue(staff, { q: MARKER, page: 9 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [],
      meta: { page: 9, pageSize: 20, totalItems: TOTAL, totalPages: 2 },
    });
  });
});
