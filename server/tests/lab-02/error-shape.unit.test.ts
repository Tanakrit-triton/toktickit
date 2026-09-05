import { describe, it, expect } from "vitest";
import { buildError } from "../../src/lab-02/errors.js";

// UT-14 from docs/lab-02/tests.md section 2.1 (BR-29).
//
// Every non-2xx response uses exactly { error: { code, message, details? } }.
// A bare string, a plain { message }, or any extra top-level key is a contract
// violation, so this asserts the shape exhaustively rather than by sampling.

describe("buildError (UT-14 - BR-29)", () => {
  it("emits exactly { error: { code, message } } with no details when none given", () => {
    const body = buildError("NOT_FOUND", "The requested resource does not exist.");

    expect(Object.keys(body)).toEqual(["error"]);
    expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("The requested resource does not exist.");
  });

  it("includes details only when supplied, as a flat field-to-message map", () => {
    const body = buildError("VALIDATION_ERROR", "One or more fields are invalid.", {
      summary: "Ticket Summary must be at least 10 characters.",
      categoryId: "Category is required.",
    });

    expect(Object.keys(body)).toEqual(["error"]);
    expect(Object.keys(body.error).sort()).toEqual(["code", "details", "message"]);
    expect(body.error.details).toEqual({
      summary: "Ticket Summary must be at least 10 characters.",
      categoryId: "Category is required.",
    });
  });

  it("omits the details key entirely rather than emitting undefined or null", () => {
    const body = buildError("INTERNAL_ERROR", "Something went wrong.");

    expect("details" in body.error).toBe(false);
  });

  it("carries no stack trace, SQL, or file path (BR-28)", () => {
    const body = buildError("INTERNAL_ERROR", "Something went wrong.");
    const serialised = JSON.stringify(body);

    expect(serialised).not.toMatch(/\bat\s+\w+.*:\d+:\d+/);
    expect(serialised).not.toMatch(/SELECT |INSERT |prisma\./i);
    expect(serialised).not.toMatch(/[A-Za-z]:\|\/home\/|\/usr\//);
  });
});
