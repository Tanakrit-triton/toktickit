import { describe, it, expect } from "vitest";
import { EMAIL_MAX, normaliseEmail, validateEmail } from "../../src/lab-03/email.js";

// UT-02 from docs/lab-03/tests.md section 2.1 (BR-06).

const DOMAIN = "@example.test";

/** A syntactically valid address of exactly `length` characters. */
const addressOf = (length: number) => "a".repeat(length - DOMAIN.length) + DOMAIN;

describe("normaliseEmail (UT-02 - BR-06)", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Napat.CHA@KMUTT.AC.TH \t")).toBe("napat.cha@kmutt.ac.th");
  });
});

describe("validateEmail (UT-02 - BR-06)", () => {
  it("caps the length at 254 characters", () => {
    expect(EMAIL_MAX).toBe(254);
  });

  it("accepts 254 characters and rejects 255", () => {
    expect(validateEmail(addressOf(254))).toBeNull();
    expect(validateEmail(addressOf(255))).not.toBeNull();
  });

  it("measures the length after trimming", () => {
    expect(validateEmail("  " + addressOf(254) + "  ")).toBeNull();
  });

  it("accepts a mixed-case address, which is valid once normalised", () => {
    expect(validateEmail(" Napat.CHA@KMUTT.AC.TH ")).toBeNull();
  });

  it("rejects invalid syntax", () => {
    for (const value of [
      "",
      "   ",
      "plainaddress",
      "@example.test",
      "user@",
      "user@@example.test",
      "user name@example.test",
      "user@example",
    ]) {
      expect(validateEmail(value), `${JSON.stringify(value)} should be rejected`).not.toBeNull();
    }
  });

  it("rejects a value that is not a string", () => {
    for (const value of [undefined, null, 42, {}]) {
      expect(validateEmail(value), `${String(value)} should be rejected`).not.toBeNull();
    }
  });
});
