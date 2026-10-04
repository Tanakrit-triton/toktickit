import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lab-03/password-hash.js";

// UT-01 from docs/lab-03/tests.md section 2.1 (BR-10).

const PASSWORD = "correct horse battery staple";

describe("hashPassword (UT-01 - BR-10)", () => {
  it("produces an Argon2id hash that does not contain the password", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(PASSWORD);
  });

  it("salts every hash, so two hashes of one password differ", async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first).not.toBe(second);
  });
});

describe("verifyPassword (UT-01 - BR-10)", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery stapler")).toBe(false);
  });
});
