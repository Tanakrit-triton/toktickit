import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// MIG-01 .. MIG-04 from docs/lab-03/tests.md section 2.2 (AC-61, AC-13, FR-29).
//
// MIG-02 and MIG-03 upgrade a database that starts at the Lab 2 schema, in an
// isolated PostgreSQL schema (tests.md section 1, Test data):
//   1. apply only the Lab 1 and Lab 2 migrations;
//   2. insert Lab 2-shaped rows;
//   3. apply the Lab 3 migration;
//   4. assert on the result.
// Both scratch schemas are dropped afterwards.

const SERVER = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = join(SERVER, "prisma", "migrations");
const SCHEMA_FILE = join(SERVER, "prisma", "schema.prisma");
const PRISMA_CLI = createRequire(import.meta.url).resolve("prisma/build/index.js");

/** The last migration Lab 2 shipped. Everything after it is Lab 3. */
const LAB2_LAST = "20260904000000_lab_02_data_model";

const MIGRATION_SCHEMA = "lab3_migration_test";
const SHADOW_SCHEMA = "lab3_shadow_test";

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

/** The Lab 3 migration's folder name. Section 7.3 specifies exactly one. */
function lab3Migration(): string {
  const later = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name > LAB2_LAST)
    .map((entry) => entry.name);
  expect(later, "Lab 3 adds exactly one migration after the Lab 2 one").toHaveLength(1);
  return later[0];
}

// Lab 2-shaped fixture rows. Every id is fixed so survival can be checked by id.
const R_ACTIVE = "a1111111-1111-4111-8111-111111111111";
const R_INACTIVE = "a2222222-2222-4222-8222-222222222222";
const R_MIXED_CASE = "a3333333-3333-4333-8333-333333333333";
const T_NEW = "b1111111-1111-4111-8111-111111111111";
const T_CLAIMED = "b2222222-2222-4222-8222-222222222222";
const T_PENDING = "b3333333-3333-4333-8333-333333333333";
const A_ACTIVE = "c1111111-1111-4111-8111-111111111111";
const A_REMOVED = "c2222222-2222-4222-8222-222222222222";

const USERS = [
  { id: R_ACTIVE, fullName: "Mig Active", email: "mig.active@kmutt.ac.th", isActive: true },
  { id: R_INACTIVE, fullName: "Mig Inactive", email: "mig.inactive@kmutt.ac.th", isActive: false },
  { id: R_MIXED_CASE, fullName: "Mig Mixed", email: "  Mig.Mixed@KMUTT.ac.th ", isActive: true },
];
const TICKETS = [
  { id: T_NEW, ticketNumber: "TKT-2026-00001", requesterId: R_ACTIVE, priority: "LOW", status: "NEW" },
  { id: T_CLAIMED, ticketNumber: "TKT-2026-00002", requesterId: R_ACTIVE, priority: "HIGH", status: "CLAIMED" },
  { id: T_PENDING, ticketNumber: "TKT-2026-00003", requesterId: R_INACTIVE, priority: "URGENT", status: "PENDING_CONFIRMATION" },
];
const ATTACHMENTS = [
  {
    id: A_ACTIVE,
    ticketId: T_NEW,
    originalFilename: "screenshot.png",
    storedFilename: "c1111111-1111-4111-8111-111111111111.png",
    mimeType: "image/png",
    sizeBytes: 2048,
    uploadedById: R_ACTIVE,
    uploadedAt: "2026-09-01 09:00:00",
    removedAt: null,
    removedById: null,
    removedReason: null,
  },
  {
    id: A_REMOVED,
    ticketId: T_CLAIMED,
    originalFilename: "wrong file.pdf",
    storedFilename: "c2222222-2222-4222-8222-222222222222.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    uploadedById: R_ACTIVE,
    uploadedAt: "2026-09-01 10:00:00",
    removedAt: "2026-09-02 11:30:00",
    removedById: R_ACTIVE,
    removedReason: "Uploaded the wrong file",
  },
];

const sqlText = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);

let scratch = "";
let db: PrismaClient;
let lab3Applied = false;

/** Applies the Lab 3 migration on top of the Lab 2 fixture, once. */
function applyLab3() {
  if (lab3Applied) return;
  const name = lab3Migration();
  cpSync(join(MIGRATIONS, name), join(scratch, "migrations", name), { recursive: true });
  prismaCli(["migrate", "deploy", "--schema", join(scratch, "schema.prisma")], MIGRATION_URL);
  lab3Applied = true;
}

beforeAll(async () => {
  db = new PrismaClient({ datasourceUrl: MIGRATION_URL });
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${MIGRATION_SCHEMA}" CASCADE`);
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SHADOW_SCHEMA}" CASCADE`);

  // Step 1: a copy of the schema whose migrations folder stops at Lab 2.
  scratch = mkdtempSync(join(tmpdir(), "toktickit-mig-"));
  mkdirSync(join(scratch, "migrations"));
  cpSync(SCHEMA_FILE, join(scratch, "schema.prisma"));
  cpSync(join(MIGRATIONS, "migration_lock.toml"), join(scratch, "migrations", "migration_lock.toml"));
  for (const name of readdirSync(MIGRATIONS)) {
    if (name <= LAB2_LAST && name !== "migration_lock.toml") {
      cpSync(join(MIGRATIONS, name), join(scratch, "migrations", name), { recursive: true });
    }
  }
  prismaCli(["migrate", "deploy", "--schema", join(scratch, "schema.prisma")], MIGRATION_URL);

  // Step 2: Lab 2-shaped rows, written as raw SQL against the Lab 2 tables.
  const s = `"${MIGRATION_SCHEMA}"`;
  await db.$executeRawUnsafe(
    `INSERT INTO ${s}."Category" ("id", "name", "updatedAt") VALUES (1, 'Hardware', CURRENT_TIMESTAMP)`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO ${s}."RelatedSystem" ("id", "name", "updatedAt") VALUES (1, 'Printer', CURRENT_TIMESTAMP)`,
  );
  for (const u of USERS) {
    await db.$executeRawUnsafe(
      `INSERT INTO ${s}."RequesterUser" ("id", "fullName", "email", "isActive", "updatedAt")
       VALUES (${sqlText(u.id)}, ${sqlText(u.fullName)}, ${sqlText(u.email)}, ${u.isActive}, CURRENT_TIMESTAMP)`,
    );
  }
  for (const t of TICKETS) {
    await db.$executeRawUnsafe(
      `INSERT INTO ${s}."Ticket" ("id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId",
         "summary", "description", "requestedPriority", "currentStatus", "updatedAt")
       VALUES (${sqlText(t.id)}, ${sqlText(t.ticketNumber)}, ${sqlText(t.requesterId)}, 1, 1,
         'Printer jams on every page', 'The office printer jams on every page since Monday.',
         '${t.priority}', '${t.status}', CURRENT_TIMESTAMP)`,
    );
  }
  for (const a of ATTACHMENTS) {
    await db.$executeRawUnsafe(
      `INSERT INTO ${s}."Attachment" ("id", "ticketId", "originalFilename", "storedFilename", "mimeType",
         "sizeBytes", "uploadedById", "uploadedAt", "removedAt", "removedById", "removedReason")
       VALUES (${sqlText(a.id)}, ${sqlText(a.ticketId)}, ${sqlText(a.originalFilename)},
         ${sqlText(a.storedFilename)}, ${sqlText(a.mimeType)}, ${a.sizeBytes}, ${sqlText(a.uploadedById)},
         ${sqlText(a.uploadedAt)}, ${sqlText(a.removedAt)}, ${sqlText(a.removedById)}, ${sqlText(a.removedReason)})`,
    );
  }
}, 120_000);

afterAll(async () => {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${MIGRATION_SCHEMA}" CASCADE`);
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SHADOW_SCHEMA}" CASCADE`);
  await db.$disconnect();
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe("Lab 3 migration SQL (MIG-01 - AC-61)", () => {
  it("never drops or recreates RequesterUser, Ticket, or Attachment, nor drops TicketStatus", () => {
    const sql = readFileSync(join(MIGRATIONS, lab3Migration(), "migration.sql"), "utf8");

    for (const table of ["RequesterUser", "Ticket", "Attachment"]) {
      const name = `(?:"${table}"|${table}\\b)`;
      expect(sql, `drops ${table}`).not.toMatch(new RegExp(`DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${name}`, "i"));
      expect(sql, `creates ${table}`).not.toMatch(new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${name}`, "i"));
    }
    expect(sql).not.toMatch(/DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?(?:"TicketStatus"|TicketStatus\b)/i);
  });
});

describe("upgrade from a populated Lab 2 database (MIG-02 - AC-61, FR-29)", () => {
  it("keeps every Requester with the same id", async () => {
    applyLab3();

    const rows = await db.$queryRawUnsafe<{ id: string; fullName: string; isActive: boolean }[]>(
      `SELECT "id", "fullName", "isActive" FROM "${MIGRATION_SCHEMA}"."RequesterUser" ORDER BY "id"`,
    );
    expect(rows).toEqual(
      USERS.map(({ id, fullName, isActive }) => ({ id, fullName, isActive })),
    );
  }, 120_000);

  it("keeps every Ticket with the same id, Requester, and Ticket Number", async () => {
    applyLab3();

    const rows = await db.$queryRawUnsafe<{ id: string; ticketNumber: string; requesterId: string }[]>(
      `SELECT "id", "ticketNumber", "requesterId" FROM "${MIGRATION_SCHEMA}"."Ticket" ORDER BY "id"`,
    );
    expect(rows).toEqual(
      TICKETS.map(({ id, ticketNumber, requesterId }) => ({ id, ticketNumber, requesterId })),
    );
  }, 120_000);

  it("keeps every Attachment, active and removed, with identical metadata", async () => {
    applyLab3();

    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "id", "ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes",
              "uploadedById",
              to_char("uploadedAt", 'YYYY-MM-DD HH24:MI:SS') AS "uploadedAt",
              to_char("removedAt", 'YYYY-MM-DD HH24:MI:SS') AS "removedAt",
              "removedById", "removedReason"
       FROM "${MIGRATION_SCHEMA}"."Attachment" ORDER BY "id"`,
    );
    expect(rows).toEqual(ATTACHMENTS);
  }, 120_000);
});

describe("upgrade backfills and renames (MIG-03 - AC-61, AC-13)", () => {
  it("makes every former Development Requester a REQUESTER with no password who must change it", async () => {
    applyLab3();

    const rows = await db.$queryRawUnsafe<
      { role: string; passwordHash: string | null; mustChangePassword: boolean; passwordChangedAt: Date | null }[]
    >(
      `SELECT "role"::text AS "role", "passwordHash", "mustChangePassword", "passwordChangedAt"
       FROM "${MIGRATION_SCHEMA}"."RequesterUser"`,
    );
    expect(rows).toHaveLength(USERS.length);
    for (const row of rows) {
      expect(row).toEqual({
        role: "REQUESTER",
        passwordHash: null,
        mustChangePassword: true,
        passwordChangedAt: null,
      });
    }
  }, 120_000);

  it("normalises existing emails to trimmed lowercase (specification.md 7.3 step 3)", async () => {
    applyLab3();

    const rows = await db.$queryRawUnsafe<{ email: string }[]>(
      `SELECT "email" FROM "${MIGRATION_SCHEMA}"."RequesterUser" WHERE "id" = '${R_MIXED_CASE}'`,
    );
    expect(rows).toEqual([{ email: "mig.mixed@kmutt.ac.th" }]);
  }, 120_000);

  it("renames CLAIMED to OPEN and PENDING_CONFIRMATION to WAITING_FOR_REQUESTER", async () => {
    applyLab3();

    const rows = await db.$queryRawUnsafe<{ id: string; status: string }[]>(
      `SELECT "id", "currentStatus"::text AS "status" FROM "${MIGRATION_SCHEMA}"."Ticket" ORDER BY "id"`,
    );
    expect(rows).toEqual([
      { id: T_NEW, status: "NEW" },
      { id: T_CLAIMED, status: "OPEN" },
      { id: T_PENDING, status: "WAITING_FOR_REQUESTER" },
    ]);
  }, 120_000);

  it("backfills IT Priority from Requested Priority on every ticket", async () => {
    applyLab3();

    const rows = await db.$queryRawUnsafe<{ id: string; requested: string; it: string | null }[]>(
      `SELECT "id", "requestedPriority"::text AS "requested", "itPriority"::text AS "it"
       FROM "${MIGRATION_SCHEMA}"."Ticket" ORDER BY "id"`,
    );
    expect(rows).toEqual(TICKETS.map((t) => ({ id: t.id, requested: t.priority, it: t.priority })));
  }, 120_000);
});

describe("schema drift (MIG-04 - AC-61, DoD)", () => {
  it("reports no difference between the migrations folder and schema.prisma", () => {
    lab3Migration();

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
