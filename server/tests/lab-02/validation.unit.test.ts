import { describe, it, expect } from "vitest";
import {
  validateSummary,
  validateDescription,
  validateRequestedPriority,
} from "../../src/lab-02/validation.js";

// UT-04 .. UT-07 from docs/lab-02/tests.md section 2.1.
//
// Each validator returns a message when the value is rejected and null when it
// is accepted, so boundary values are asserted exhaustively without a database
// or HTTP round trip. Lengths are built with repeat() so the intent of each
// case is the number itself, not a string somebody has to count.

const chars = (n: number) => "x".repeat(n);

describe("validateSummary (UT-04 - AC-13, BR-19)", () => {
  it("rejects 9 characters after trimming and accepts 10", () => {
    expect(validateSummary(chars(9))).not.toBeNull();
    expect(validateSummary(chars(10))).toBeNull();
  });

  it("trims before measuring, so padding does not buy length", () => {
    expect(validateSummary(`   ${chars(9)}   `)).not.toBeNull();
    expect(validateSummary(`   ${chars(10)}   `)).toBeNull();
  });

  it("rejects an empty or whitespace-only value as required", () => {
    expect(validateSummary("")).not.toBeNull();
    expect(validateSummary("     ")).not.toBeNull();
    expect(validateSummary(undefined)).not.toBeNull();
  });
});

describe("validateSummary (UT-05 - BR-19)", () => {
  it("accepts 150 characters and rejects 151", () => {
    expect(validateSummary(chars(150))).toBeNull();
    expect(validateSummary(chars(151))).not.toBeNull();
  });
});

describe("validateDescription (UT-06 - BR-20)", () => {
  it("rejects 19 characters and accepts 20", () => {
    expect(validateDescription(chars(19))).not.toBeNull();
    expect(validateDescription(chars(20))).toBeNull();
  });

  it("accepts 5000 characters and rejects 5001", () => {
    expect(validateDescription(chars(5000))).toBeNull();
    expect(validateDescription(chars(5001))).not.toBeNull();
  });

  it("trims before measuring", () => {
    expect(validateDescription(`  ${chars(19)}  `)).not.toBeNull();
    expect(validateDescription(`  ${chars(20)}  `)).toBeNull();
  });
});

describe("validateRequestedPriority (UT-07 - BR-23)", () => {
  it("accepts exactly the four D-03 values", () => {
    for (const value of ["LOW", "MEDIUM", "HIGH", "URGENT"]) {
      expect(validateRequestedPriority(value), `${value} should be accepted`).toBeNull();
    }
  });

  it("rejects anything else, including case variants and near misses", () => {
    for (const value of ["low", "Medium", "CRITICAL", "URGENT ", "", undefined, "NONE"]) {
      expect(validateRequestedPriority(value), `${String(value)} should be rejected`).not.toBeNull();
    }
  });
});
