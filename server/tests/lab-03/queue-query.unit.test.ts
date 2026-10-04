import { describe, it, expect } from "vitest";
import {
  parseQueueQuery,
  priorityRank,
  statusRank,
  queueSortKeys,
  type QueueQuery,
} from "../../src/lab-03/queue-query.js";

// UT-07 and UT-08 from docs/lab-03/tests.md section 2.1 (AC-31, AC-32).
//
// The parser is pure: it checks the shape of every parameter and leaves the
// database checks (the category exists, the owner is IT Staff or an
// Administrator) to the route, so each rule here is asserted without a
// database.

const UUID = "3f8b0c22-0000-4000-8000-0000000000a7";
const chars = (n: number) => "x".repeat(n);

function parsed(raw: Record<string, unknown>): QueueQuery {
  const result = parseQueueQuery(raw);
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.query;
}

const rejects = (raw: Record<string, unknown>) => expect(parseQueueQuery(raw).ok).toBe(false);

describe("parseQueueQuery (UT-07 - AC-32)", () => {
  it("defaults to page 1, page size 20, sorted by IT Priority descending", () => {
    expect(parsed({})).toEqual({ sortBy: "itPriority", sortOrder: "desc", page: 1, pageSize: 20 });
  });

  it("accepts only page sizes 10, 20, and 50", () => {
    expect(parsed({ pageSize: "10" }).pageSize).toBe(10);
    expect(parsed({ pageSize: "20" }).pageSize).toBe(20);
    expect(parsed({ pageSize: "50" }).pageSize).toBe(50);
    for (const value of ["25", "0", "100", "-10", "20.0", "abc", ""]) rejects({ pageSize: value });
  });

  it("rejects a page below 1 or not an integer", () => {
    expect(parsed({ page: "3" }).page).toBe(3);
    for (const value of ["0", "-1", "1.5", "two"]) rejects({ page: value });
  });

  it("rejects an unknown parameter", () => {
    rejects({ foo: "1" });
    // Lab 2 My Tickets parameters are not queue parameters.
    rejects({ requestedPriority: "HIGH" });
    rejects({ relatedSystemId: "1" });
  });

  it("rejects a parameter given more than once", () => {
    rejects({ status: ["NEW", "OPEN"] });
  });

  it("accepts owner me, unassigned, or a UUID, and rejects anything else", () => {
    expect(parsed({ owner: "me" }).owner).toEqual({ kind: "me" });
    expect(parsed({ owner: "unassigned" }).owner).toEqual({ kind: "unassigned" });
    expect(parsed({ owner: UUID }).owner).toEqual({ kind: "user", id: UUID });
    for (const value of ["someone", "ME", "", "3f8b0c22-0000-4000-8000"]) rejects({ owner: value });
  });

  it("accepts each of the eight statuses and rejects anything else", () => {
    for (const status of [
      "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
      "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
    ]) {
      expect(parsed({ status }).status).toBe(status);
    }
    // ASSIGNED is not a Lab 3 status; CLAIMED was renamed to OPEN (DEC-15).
    for (const value of ["ASSIGNED", "CLAIMED", "new", ""]) rejects({ status: value });
  });

  it("accepts each IT Priority and rejects anything else", () => {
    for (const itPriority of ["LOW", "MEDIUM", "HIGH", "URGENT"]) {
      expect(parsed({ itPriority }).itPriority).toBe(itPriority);
    }
    for (const value of ["CRITICAL", "high", ""]) rejects({ itPriority: value });
  });

  it("accepts a positive integer categoryId only", () => {
    expect(parsed({ categoryId: "2" }).categoryId).toBe(2);
    for (const value of ["0", "-2", "2.5", "two", ""]) rejects({ categoryId: value });
  });

  it("accepts each documented sortBy and sortOrder and rejects anything else", () => {
    for (const sortBy of ["ticketNumber", "createdAt", "updatedAt", "itPriority", "status"]) {
      expect(parsed({ sortBy }).sortBy).toBe(sortBy);
    }
    expect(parsed({ sortOrder: "asc" }).sortOrder).toBe("asc");
    rejects({ sortBy: "requestedPriority" });
    rejects({ sortBy: "owner" });
    rejects({ sortOrder: "up" });
  });

  it("trims q, accepts 150 characters, and rejects 151", () => {
    expect(parsed({ q: `  ${chars(150)}  ` }).q).toBe(chars(150));
    rejects({ q: chars(151) });
  });

  it("treats a q that is empty after trimming as absent", () => {
    expect(parsed({ q: "   " }).q).toBeUndefined();
  });
});

describe("queue ordering (UT-08 - AC-31)", () => {
  it("ranks IT Priority by severity, LOW < MEDIUM < HIGH < URGENT", () => {
    expect(priorityRank("LOW")).toBeLessThan(priorityRank("MEDIUM"));
    expect(priorityRank("MEDIUM")).toBeLessThan(priorityRank("HIGH"));
    expect(priorityRank("HIGH")).toBeLessThan(priorityRank("URGENT"));
  });

  it("ranks status in lifecycle order, with REOPENED before RESOLVED", () => {
    const lifecycle = [
      "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
      "REOPENED", "RESOLVED", "CLOSED", "CANCELLED",
    ] as const;
    for (let i = 1; i < lifecycle.length; i++) {
      expect(statusRank(lifecycle[i - 1])).toBeLessThan(statusRank(lifecycle[i]));
    }
  });

  it("uses itPriority desc, createdAt asc, id asc by default", () => {
    expect(queueSortKeys(parsed({}))).toEqual([
      { key: "itPriority", order: "desc" },
      { key: "createdAt", order: "asc" },
      { key: "id", order: "asc" },
    ]);
  });

  it("follows an explicit sort with createdAt asc, then id asc", () => {
    expect(queueSortKeys(parsed({ sortBy: "status", sortOrder: "asc" }))).toEqual([
      { key: "status", order: "asc" },
      { key: "createdAt", order: "asc" },
      { key: "id", order: "asc" },
    ]);
    expect(queueSortKeys(parsed({ sortBy: "updatedAt" }))).toEqual([
      { key: "updatedAt", order: "desc" },
      { key: "createdAt", order: "asc" },
      { key: "id", order: "asc" },
    ]);
  });

  it("does not repeat createdAt when it is the primary key", () => {
    expect(queueSortKeys(parsed({ sortBy: "createdAt", sortOrder: "desc" }))).toEqual([
      { key: "createdAt", order: "desc" },
      { key: "id", order: "asc" },
    ]);
  });
});
