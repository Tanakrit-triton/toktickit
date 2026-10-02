import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

// Every suite runs against a dedicated test database (docs/lab-03/tests.md
// section 1, Test data), never the development one. The seed and migration
// suites reseed, alter seeded accounts, and create schemas, so pointing them at
// DATABASE_URL would reset a developer's local data on every run.
//
// Values come from server/.env, and anything already set in the environment
// wins, so CI can supply them directly.
function localEnv(): Record<string, string | undefined> {
  let fromFile: Record<string, string> = {};
  try {
    fromFile = parseEnv(readFileSync(fileURLToPath(new URL(".env", import.meta.url)), "utf8"));
  } catch {
    // No .env: rely on the process environment alone.
  }
  return { ...fromFile, ...process.env };
}

const env = localEnv();
const testDatabaseUrl = env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Copy it from server/.env.example into server/.env.",
  );
}
if (testDatabaseUrl === env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must differ from DATABASE_URL: the test suites reseed and alter fixtures.",
  );
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],

    // Workers see the test database as DATABASE_URL, so getPrisma() and the
    // Prisma CLI need no test-specific code path.
    env: {
      DATABASE_URL: testDatabaseUrl,
      ...(env.SEED_PASSWORD === undefined ? {} : { SEED_PASSWORD: env.SEED_PASSWORD }),
    },

    // Migrates and seeds the test database once, before any file runs.
    globalSetup: ["tests/global-setup.ts"],

    // Run test files one at a time.
    //
    // The API suites share one database and some of them create fixture rows,
    // so files running concurrently can observe each other's fixtures. The
    // concrete case: reference-data.api.test.ts creates an inactive Category
    // to prove it is excluded (API-38), while the Lab 1 categories test asserts
    // that the unfiltered GET /api/categories returns exactly four rows. Those
    // two overlapping is a race, and a race is a flaky test.
    //
    // Serialising is the fix that keeps the Lab 1 route unchanged as A-04
    // requires. The alternative -- filtering isActive in the Lab 1 route --
    // would silently alter behaviour the specification promises to preserve.
    fileParallelism: false,
  },
});
