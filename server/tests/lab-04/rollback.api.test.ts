import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// MIG-05 from docs/lab-04/tests.md section 2.2 (AC-33, Amendment 2).
//
// A scratch schema is migrated to Lab 4, then rolled back with
// prisma/rollback/lab_04_down.sql. The result is compared with the Lab 3
// schema.prisma, read from the commit Lab 3 shipped. PostgreSQL cannot drop
// enum values, so the two new TicketEventType values are the only difference
// allowed (specification.md section 7.4).

const SERVER = fileURLToPath(new URL("../..", import.meta.url));
const REPO = join(SERVER, "..");
const SCHEMA_FILE = join(SERVER, "prisma", "schema.prisma");
const ROLLBACK_FILE = join(SERVER, "prisma", "rollback", "lab_04_down.sql");
const PRISMA_CLI = createRequire(import.meta.url).resolve("prisma/build/index.js");

/** The merge of the Lab 3 release into main. */
const LAB3_COMMIT = "1fea5b2";

const ROLLBACK_SCHEMA = "lab4_rollback_test";
const LAB3_EVENT_TYPES = ["OWNER_CHANGED", "STATUS_CHANGED", "IT_PRIORITY_CHANGED", "RESOLUTION_INDICATED"];

const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", ROLLBACK_SCHEMA);
const ROLLBACK_URL = url.toString();

function prismaCli(args: string[], input?: string) {
  return execFileSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: SERVER,
    env: { ...process.env, DATABASE_URL: ROLLBACK_URL },
    encoding: "utf8",
    stdio: "pipe",
    input,
  });
}

let db: PrismaClient;
let scratch = "";
let actionTakenBeforeRollback = false;
let diffScript = "";

async function tableExists(table: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS "n" FROM information_schema.tables
     WHERE table_schema = '${ROLLBACK_SCHEMA}' AND table_name = '${table}'`,
  );
  return Number(rows[0].n) > 0;
}

beforeAll(async () => {
  db = new PrismaClient({ datasourceUrl: ROLLBACK_URL });
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${ROLLBACK_SCHEMA}" CASCADE`);

  // Every migration, up to and including Lab 4.
  prismaCli(["migrate", "deploy", "--schema", SCHEMA_FILE]);
  actionTakenBeforeRollback = await tableExists("ActionTaken");
}, 180_000);

let rolledBack = false;

/**
 * Runs the rollback script, then diffs against the Lab 3 schema, once. Called
 * from inside each test, so a missing script fails the test rather than the
 * hook: the suite can never report these tests as skipped.
 */
function rollBack() {
  if (rolledBack) return;
  expect(existsSync(ROLLBACK_FILE), `the rollback script is missing: ${ROLLBACK_FILE}`).toBe(true);

  // The rollback script names tables without a schema. The search_path is set
  // here, so it can only ever act on the scratch schema.
  const rollback = readFileSync(ROLLBACK_FILE, "utf8");
  prismaCli(
    ["db", "execute", "--stdin", "--url", ROLLBACK_URL],
    `SET search_path TO "${ROLLBACK_SCHEMA}";\n${rollback}`,
  );

  scratch = mkdtempSync(join(tmpdir(), "toktickit-rollback-"));
  const lab3Schema = join(scratch, "schema.prisma");
  writeFileSync(
    lab3Schema,
    execFileSync("git", ["show", `${LAB3_COMMIT}:server/prisma/schema.prisma`], { cwd: REPO, encoding: "utf8" }),
  );
  diffScript = prismaCli(["migrate", "diff", "--from-url", ROLLBACK_URL, "--to-schema-datamodel", lab3Schema, "--script"]);
  rolledBack = true;
}

afterAll(async () => {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${ROLLBACK_SCHEMA}" CASCADE`);
  await db.$disconnect();
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe("rollback to the Lab 3 schema (MIG-05 - AC-33)", () => {
  it("starts from a database the Lab 4 migration was applied to", () => {
    expect(actionTakenBeforeRollback, "ActionTaken must exist before the rollback runs").toBe(true);
  });

  it("removes ActionTaken, ActionStatus, Ticket.version, and Ticket.resolvedAt", async () => {
    rollBack();
    expect(await tableExists("ActionTaken")).toBe(false);

    const columns = await db.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = '${ROLLBACK_SCHEMA}' AND table_name = 'Ticket'
         AND column_name IN ('version', 'resolvedAt')`,
    );
    expect(columns).toEqual([]);

    const types = await db.$queryRawUnsafe<{ typname: string }[]>(
      `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = '${ROLLBACK_SCHEMA}' AND t.typname = 'ActionStatus'`,
    );
    expect(types).toEqual([]);
  });

  it("deletes the Lab 4 row from _prisma_migrations and keeps the earlier ones", async () => {
    rollBack();
    const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM "${ROLLBACK_SCHEMA}"."_prisma_migrations" ORDER BY migration_name`,
    );
    const names = rows.map((row) => row.migration_name);

    expect(names.filter((name) => name.endsWith("_lab_04_actions_taken"))).toEqual([]);
    expect(names).toContain("20261002213302_lab_03_users_sessions");
    expect(names).toHaveLength(3);
  });

  it("differs from the Lab 3 schema only in the two TicketEventType values", () => {
    rollBack();
    const removed = diffScript.match(/The values? \[([^\]]*)\] on the enum `TicketEventType` will be removed/);
    expect(removed, `no TicketEventType value removal in:\n${diffScript}`).not.toBeNull();
    expect(removed![1].split(",").map((v) => v.trim()).sort()).toEqual(["ACTION_CREATED", "ACTION_UPDATED"]);

    const statements = diffScript
      .replace(/--.*$/gm, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    for (const statement of statements) {
      if (/^(BEGIN|COMMIT)$/i.test(statement)) continue;
      expect(statement, `the diff changes something other than TicketEventType:\n${diffScript}`).toMatch(
        /TicketEventType/,
      );
    }

    // The enum Prisma would rebuild is exactly the Lab 3 one.
    const created = diffScript.match(/CREATE TYPE "TicketEventType_new" AS ENUM \(([^)]*)\)/);
    expect(created, diffScript).not.toBeNull();
    expect(created![1].split(",").map((v) => v.trim().replace(/'/g, ""))).toEqual(LAB3_EVENT_TYPES);
  });
});
