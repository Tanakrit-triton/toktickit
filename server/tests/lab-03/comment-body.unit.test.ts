import { describe, it, expect } from "vitest";
import { BODY_MAX, normaliseBody } from "../../src/lab-03/comment-body.js";

// UT-11 from docs/lab-03/tests.md section 2.1 (AC-48, BR-47). One rule serves
// Public Comments and Internal Notes: the body is trimmed, then must be 1 to
// 2000 characters. normaliseBody returns the trimmed body, or null when the
// body is refused.

describe("comment and note body (UT-11 - AC-48, BR-47)", () => {
  it("allows at most 2000 characters", () => {
    expect(BODY_MAX).toBe(2000);
  });

  it("rejects an empty body", () => {
    expect(normaliseBody("")).toBeNull();
  });

  it("rejects a whitespace-only body, line breaks and tabs included", () => {
    expect(normaliseBody("   ")).toBeNull();
    expect(normaliseBody(" \n\t\r\n ")).toBeNull();
  });

  it("accepts 1 character", () => {
    expect(normaliseBody("a")).toBe("a");
  });

  it("accepts 2000 characters", () => {
    const body = "x".repeat(2000);
    expect(normaliseBody(body)).toBe(body);
  });

  it("rejects 2001 characters", () => {
    expect(normaliseBody("x".repeat(2001))).toBeNull();
  });

  it("measures the length after trimming", () => {
    const body = "x".repeat(2000);
    expect(normaliseBody(`  \n${body}\t  `)).toBe(body);
    expect(normaliseBody(`  ${"x".repeat(2001)}  `)).toBeNull();
  });

  it("trims only the ends and keeps inner line breaks and markup", () => {
    expect(normaliseBody("  <b>first</b>\n\nsecond  ")).toBe("<b>first</b>\n\nsecond");
  });

  it("rejects a body that is not a string", () => {
    expect(normaliseBody(undefined)).toBeNull();
    expect(normaliseBody(null)).toBeNull();
    expect(normaliseBody(42)).toBeNull();
    expect(normaliseBody(["text"])).toBeNull();
  });
});
