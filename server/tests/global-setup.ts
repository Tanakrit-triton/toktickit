import { execSync } from "node:child_process";
import type { GlobalSetupContext } from "vitest/node";

// Brings the dedicated test database to the current schema and seeds it before
// any test file runs (docs/lab-03/tests.md section 1, Test data).
//
// config.env carries the DATABASE_URL that vitest.config.ts points at the test
// database, so both commands below act on it and never on the development one.

export default function setup({ config }: GlobalSetupContext): void {
  const env = { ...process.env, ...config.env };

  for (const command of ["npx prisma migrate deploy", "npx tsx prisma/seed.ts"]) {
    try {
      execSync(command, { cwd: config.root, env, stdio: "pipe" });
    } catch (error) {
      const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
      throw new Error(
        `Test database setup failed at "${command}":\n${stdout ?? ""}${stderr ?? ""}`,
      );
    }
  }
}
