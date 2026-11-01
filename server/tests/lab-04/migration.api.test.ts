import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// MIG-01 .. MIG-04 from docs/lab-04/tests.md section 2.2 (AC-32).
//
// MIG-02 and MIG-03 upgrade a database that starts at the Lab 3 schema, in an
// isolated PostgreSQL schema, as the Lab 3 migration test does:
//   1. apply only the Lab 1 to Lab 3 migrations;
//   2. insert Lab 3-shaped rows;
//   3. apply the Lab 4 migration;
//   4. assert on the result.
// Both scratch schemas are dropped afterwards.

const SERVER = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = join(SERVER, "prisma", "migrations");
const SCHEMA_FILE = join(SERVER, "prisma", "schema.prisma");
const PRISMA_CLI = createRequire(import.meta.url).resolve("prisma/build/index.js");

/** The last migration Lab 3 shipped. Everything after it is Lab 4. */
const LAB3_LAST = "20261002213302_lab_03_users_sessions";

const MIGRATION_SCHEMA = "lab4_migration_test";
const SHADOW_SCHEMA = "lab4_shadow_test";

function urlWithSchema(schema: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  return url.toString();
}
const MIGRATION_URL = urlWithSchema(MIGRATION_SCHEMA);
const SHADOW_URL = urlWithSchema(SHADOW_SCHEMA);

function prismaCli(args: string[], databaseUrl: string) {
  return execFileSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: SERVER,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: "pipe",
  });
}

/** The Lab 4 migration's folder name. Section 7.4 specifies exactly one. */
function lab4Migration(): string {
  const later = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name > LAB3_LAST)
    .map((entry) => entry.name);
  expect(later, "Lab 4 adds exactly one migration after the Lab 3 one").toHaveLength(1);
  expect(later[0]).toMatch(/_lab_04_actions_taken$/);
  return later[0];
}

// Lab 3-shaped fixture rows. Every id is fixed so survival can be checked by id.
const U_REQUESTER = "d1111111-1111-4111-8111-111111111111";
const U_STAFF = "d2222222-2222-4222-8222-222222222222";
const T_RESOLVED = "e1111111-1111-4111-8111-111111111111";
const T_CLOSED = "e2222222-2222-4222-8222-222222222222";
const T_OPEN = "e3333333-3333-4333-8333-333333333333";
const T_REOPENED = "e4444444-4444-4444-8444-444444444444";

const USERS = [
  { id: U_REQUESTER, fullName: "Mig Four Requester", email: "mig4.req@kmutt.ac.th", role: "REQUESTER" },
  { id: U_STAFF, fullName: "Mig Four Staff", email: "mig4.staff@kmutt.ac.th", role: "IT_STAFF" },
];

// updatedAt is the MIG-03 fallback, so each ticket has a distinct one.
const TICKETS = [
  { id: T_RESOLVED, ticketNumber: "TKT-2026-00101", status: "RESOLVED", updatedAt: "2026-09-10 12:00:00" },
  { id: T_CLOSED, ticketNumber: "TKT-2026-00102", status: "CLOSED", updatedAt: "2026-09-11 13:30:00" },
  { id: T_OPEN, ticketNumber: "TKT-2026-00103", status: "OPEN", updatedAt: "2026-09-12 09:15:00" },
  { id: T_REOPENED, ticketNumber: "TKT-2026-00104", status: "REOPENED", updatedAt: "2026-09-13 16:45:00" },
];

const ATTACHMENT = "f1111111-1111-4111-8111-111111111111";
const COMMENT = "f2222222-2222-4222-8222-222222222222";
const NOTE = "f3333333-3333-4333-8333-333333333333";
const SESSION = "a".repeat(64);

type EventRow = { id: string; ticketId: string; eventType: string; payload: object; createdAt: string };

// T_RESOLVED was resolved twice: the latest STATUS_CHANGED -> RESOLVED wins,
// and a later event of another type does not count. T_CLOSED has no RESOLVED
// event at all. T_REOPENED was resolved once, then reopened, so it gets none.
const EVENTS: EventRow[] = [
  { id: "f4000000-0000-4000-8000-000000000001", ticketId: T_RESOLVED, eventType: "STATUS_CHANGED", payload: { from: "OPEN", to: "RESOLVED" }, createdAt: "2026-09-05 08:00:00" },
  { id: "f4000000-0000-4000-8000-000000000002", ticketId: T_RESOLVED, eventType: "STATUS_CHANGED", payload: { from: "RESOLVED", to: "REOPENED", reason: "Still broken." }, createdAt: "2026-09-06 08:00:00" },
  { id: "f4000000-0000-4000-8000-000000000003", ticketId: T_RESOLVED, eventType: "STATUS_CHANGED", payload: { from: "REOPENED", to: "RESOLVED" }, createdAt: "2026-09-07 10:20:30" },
  { id: "f4000000-0000-4000-8000-000000000004", ticketId: T_RESOLVED, eventType: "IT_PRIORITY_CHANGED", payload: { from: "LOW", to: "HIGH" }, createdAt: "2026-09-08 11:00:00" },
  { id: "f4000000-0000-4000-8000-000000000005", ticketId: T_CLOSED, eventType: "OWNER_CHANGED", payload: { fromOwnerId: null, toOwnerId: U_STAFF, cause: "CLAIM" }, createdAt: "2026-09-04 07:00:00" },
  { id: "f4000000-0000-4000-8000-000000000006", ticketId: T_REOPENED, eventType: "STATUS_CHANGED", payload: { from: "OPEN", to: "RESOLVED" }, createdAt: "2026-09-09 07:00:00" },
  { id: "f4000000-0000-4000-8000-000000000007", ticketId: T_REOPENED, eventType: "STATUS_CHANGED", payload: { from: "RESOLVED", to: "REOPENED", reason: "Came back." }, createdAt: "2026-09-09 09:00:00" },
];

/** The Lab 3 tables MIG-02 checks for survival (CLAUDE.md database rules). */
const SURVIVING_TABLES = [
  "RequesterUser",
  "Ticket",
  "Attachment",
  "PublicComment",
  "InternalNote",
  "TicketEvent",
  "Session",
];

const sqlText = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);
const s = `"${MIGRATION_SCHEMA}"`;

let scratch = "";
let db: PrismaClient;
let lab4Applied = false;
let beforeUpgrade: Record<string, string[]> = {};

async function idsOf(table: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM ${s}."${table}" ORDER BY "id"`);
  return rows.map((row) => row.id);
}

/** Applies the Lab 4 migration on top of the Lab 3 fixture, once. */
function applyLab4() {
  if (lab4Applied) return;
  const name = lab4Migration();
  cpSync(join(MIGRATIONS, name), join(scratch, "migrations", name), { recursive: true });
  prismaCli(["migrate", "deploy", "--schema", join(scratch, "schema.prisma")], MIGRATION_URL);
  lab4Applied = true;
}

beforeAll(async () => {
  db = new PrismaClient({ datasourceUrl: MIGRATION_URL });
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${MIGRATION_SCHEMA}" CASCADE`);
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SHADOW_SCHEMA}" CASCADE`);

  // Step 1: a copy of the schema whose migrations folder stops at Lab 3.
  scratch = mkdtempSync(join(tmpdir(), "toktickit-mig4-"));
  mkdirSync(join(scratch, "migrations"));
  cpSync(SCHEMA_FILE, join(scratch, "schema.prisma"));
  cpSync(join(MIGRATIONS, "migration_lock.toml"), join(scratch, "migrations", "migration_lock.toml"));
  for (const name of readdirSync(MIGRATIONS)) {
    if (name <= LAB3_LAST && name !== "migration_lock.toml") {
      cpSync(join(MIGRATIONS, name), join(scratch, "migrations", name), { recursive: true });
    }
  }
  prismaCli(["migrate", "deploy", "--schema", join(scratch, "schema.prisma")], MIGRATION_URL);

  // Step 2: Lab 3-shaped rows, written as raw SQL against the Lab 3 tables.
  await db.$executeRawUnsafe(
    `INSERT INTO ${s}."Category" ("id", "name", "updatedAt") VALUES (1, 'Hardware', CURRENT_TIMESTAMP)`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO ${s}."RelatedSystem" ("id", "name", "updatedAt") VALUES (1, 'Printer', CURRENT_TIMESTAMP)`,
  );
  for (const u of USERS) {
    await db.$executeRawUnsafe(
      `INSERT INTO ${s}."RequesterUser" ("id", "fullName", "email", "role", "mustChangePassword", "updatedAt")
       VALUES (${sqlText(u.id)}, ${sqlText(u.fullName)}, ${sqlText(u.email)}, '${u.role}', false, CURRENT_TIMESTAMP)`,
    );
  }
  for (const t of TICKETS) {
    await db.$executeRawUnsafe(
      `INSERT INTO ${s}."Ticket" ("id", "ticketNumber", "requesterId", "ownerId", "categoryId", "relatedSystemId",
         "summary", "description", "requestedPriority", "itPriority", "currentStatus", "updatedAt")
       VALUES (${sqlText(t.id)}, ${sqlText(t.ticketNumber)}, ${sqlText(U_REQUESTER)}, ${sqlText(U_STAFF)}, 1, 1,
         'Printer jams on every page', 'The office printer jams on every page since Monday.',
         'MEDIUM', 'HIGH', '${t.status}', ${sqlText(t.updatedAt)})`,
    );
  }
  await db.$executeRawUnsafe(
    `INSERT INTO ${s}."Attachment" ("id", "ticketId", "originalFilename", "storedFilename", "mimeType",
       "sizeBytes", "uploadedById")
     VALUES (${sqlText(ATTACHMENT)}, ${sqlText(T_OPEN)}, 'screenshot.png', '${ATTACHMENT}.png', 'image/png', 2048,
       ${sqlText(U_REQUESTER)})`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO ${s}."PublicComment" ("id", "ticketId", "authorId", "body")
     VALUES (${sqlText(COMMENT)}, ${sqlText(T_OPEN)}, ${sqlText(U_STAFF)}, 'Please restart the printer.')`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO ${s}."InternalNote" ("id", "ticketId", "authorId", "body")
     VALUES (${sqlText(NOTE)}, ${sqlText(T_OPEN)}, ${sqlText(U_STAFF)}, 'Roller looks worn.')`,
  );
  for (const e of EVENTS) {
    await db.$executeRawUnsafe(
      `INSERT INTO ${s}."TicketEvent" ("id", "ticketId", "actorId", "eventType", "payload", "createdAt")
       VALUES (${sqlText(e.id)}, ${sqlText(e.ticketId)}, ${sqlText(U_STAFF)}, '${e.eventType}',
         ${sqlText(JSON.stringify(e.payload))}::jsonb, ${sqlText(e.createdAt)})`,
    );
  }
  await db.$executeRawUnsafe(
    `INSERT INTO ${s}."Session" ("id", "userId", "csrfToken", "expiresAt")
     VALUES (${sqlText(SESSION)}, ${sqlText(U_STAFF)}, 'csrf', CURRENT_TIMESTAMP + interval '1 day')`,
  );

  for (const table of SURVIVING_TABLES) {
    beforeUpgrade[table] = await idsOf(table);
  }
}, 120_000);

afterAll(async () => {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${MIGRATION_SCHEMA}" CASCADE`);
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SHADOW_SCHEMA}" CASCADE`);
  await db.$disconnect();
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

/** The SQL with comments removed, so commented-out text cannot satisfy or fail a check. */
function lab4Sql(): string {
  const raw = readFileSync(join(MIGRATIONS, lab4Migration(), "migration.sql"), "utf8");
  return raw.replace(/--.*$/gm, "");
}

describe("Lab 4 migration SQL (MIG-01 - AC-32)", () => {
  it("drops no table, no type, and no column", () => {
    const sql = lab4Sql();

    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+TYPE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  it("never recreates an existing table or enum", () => {
    const sql = lab4Sql();

    for (const table of ["RequesterUser", "Ticket", "Attachment", "PublicComment", "InternalNote", "TicketEvent", "Session"]) {
      expect(sql, `creates ${table}`).not.toMatch(new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"${table}"`, "i"));
    }
    for (const type of ["TicketEventType", "TicketStatus", "RequestedPriority", "Role"]) {
      expect(sql, `creates ${type}`).not.toMatch(new RegExp(`CREATE\\s+TYPE\\s+"${type}`, "i"));
      expect(sql, `renames ${type}`).not.toMatch(new RegExp(`ALTER\\s+TYPE\\s+"${type}"\\s+RENAME`, "i"));
    }
  });

  it("extends TicketEventType with ADD VALUE only", () => {
    const sql = lab4Sql();

    expect(sql).toMatch(/ALTER\s+TYPE\s+"TicketEventType"\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'ACTION_CREATED'/i);
    expect(sql).toMatch(/ALTER\s+TYPE\s+"TicketEventType"\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'ACTION_UPDATED'/i);
  });

  it("creates the follow-up check constraint (BR-09 backstop)", () => {
    const sql = lab4Sql();

    expect(sql).toMatch(
      /CHECK\s*\(\s*\(?\s*"followUpRequired"\s*=\s*false\s*\)?\s+OR\s+\(?\s*"followUpNote"\s+IS\s+NOT\s+NULL\s*\)?\s*\)/i,
    );
  });

  it("makes every new foreign key ON DELETE RESTRICT", () => {
    const sql = lab4Sql();

    const keys = sql.match(/FOREIGN\s+KEY[^;]*;/gi) ?? [];
    expect(keys, "ActionTaken has three foreign keys").toHaveLength(3);
    for (const key of keys) expect(key).toMatch(/ON\s+DELETE\s+RESTRICT/i);
  });
});

describe("upgrade from a populated Lab 3 database (MIG-02 - AC-32)", () => {
  it("keeps the row count and ids of every Lab 3 table", async () => {
    applyLab4();

    for (const table of SURVIVING_TABLES) {
      expect(await idsOf(table), table).toEqual(beforeUpgrade[table]);
    }
    expect(beforeUpgrade.Ticket).toHaveLength(TICKETS.length);
    expect(beforeUpgrade.TicketEvent).toHaveLength(EVENTS.length);
  }, 120_000);

  it("leaves existing ticket fields and Ticket Events unchanged", async () => {
    applyLab4();

    const tickets = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "id", "ticketNumber", "currentStatus"::text AS "status", "itPriority"::text AS "itPriority",
              to_char("updatedAt", 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt"
       FROM ${s}."Ticket" ORDER BY "id"`,
    );
    expect(tickets).toEqual(
      TICKETS.map((t) => ({ id: t.id, ticketNumber: t.ticketNumber, status: t.status, itPriority: "HIGH", updatedAt: t.updatedAt })),
    );

    const events = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "id", "eventType"::text AS "eventType", "payload",
              to_char("createdAt", 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
       FROM ${s}."TicketEvent" ORDER BY "id"`,
    );
    expect(events).toEqual(
      EVENTS.map((e) => ({ id: e.id, eventType: e.eventType, payload: e.payload, createdAt: e.createdAt })),
    );
  }, 120_000);

  it("gives every existing ticket version 0", async () => {
    applyLab4();

    const rows = await db.$queryRawUnsafe<{ version: number }[]>(`SELECT "version" FROM ${s}."Ticket"`);
    expect(rows).toHaveLength(TICKETS.length);
    for (const row of rows) expect(row.version).toBe(0);
  }, 120_000);

  it("adds an empty ActionTaken table", async () => {
    applyLab4();

    const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS "n" FROM ${s}."ActionTaken"`);
    expect(Number(rows[0].n)).toBe(0);
  }, 120_000);
});

describe("resolvedAt backfill (MIG-03 - AC-32, section 7.4 step 4)", () => {
  async function resolvedAt(id: string): Promise<string | null> {
    const rows = await db.$queryRawUnsafe<{ resolvedAt: string | null }[]>(
      `SELECT to_char("resolvedAt", 'YYYY-MM-DD HH24:MI:SS') AS "resolvedAt" FROM ${s}."Ticket" WHERE "id" = '${id}'`,
    );
    return rows[0].resolvedAt;
  }

  it("uses the latest STATUS_CHANGED -> RESOLVED event for a RESOLVED ticket", async () => {
    applyLab4();
    expect(await resolvedAt(T_RESOLVED)).toBe("2026-09-07 10:20:30");
  }, 120_000);

  it("falls back to updatedAt for a CLOSED ticket with no such event", async () => {
    applyLab4();
    expect(await resolvedAt(T_CLOSED)).toBe("2026-09-11 13:30:00");
  }, 120_000);

  it("leaves resolvedAt null for tickets that are not RESOLVED or CLOSED", async () => {
    applyLab4();
    expect(await resolvedAt(T_OPEN)).toBeNull();
    expect(await resolvedAt(T_REOPENED)).toBeNull();
  }, 120_000);
});

describe("schema drift (MIG-04 - AC-32, DoD)", () => {
  it("reports no difference between the migrations folder and schema.prisma", () => {
    lab4Migration();

    const result = spawnSync(
      process.execPath,
      [
        PRISMA_CLI,
        "migrate",
        "diff",
        "--from-migrations",
        MIGRATIONS,
        "--to-schema-datamodel",
        SCHEMA_FILE,
        "--shadow-database-url",
        SHADOW_URL,
        "--exit-code",
      ],
      { cwd: SERVER, encoding: "utf8" },
    );
    expect(result.status, `migrate diff reported drift:\n${result.stdout}${result.stderr}`).toBe(0);
  }, 120_000);
});
