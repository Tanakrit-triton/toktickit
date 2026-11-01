import { describe, it, expect } from "vitest";
import { STATUS_GROUPS, statusesForGroup } from "../../src/lab-04/status-groups.js";
import { parseTicketListQuery } from "../../src/lab-02/ticket-query.js";
import { parseQueueQuery } from "../../src/lab-03/queue-query.js";

// UT-07 from docs/lab-04/tests.md section 2.1 (AC-28, api-spec section 4).
// The groups are copied from specification.md section 5.4 by hand.

const BOTH = "Use either status or statusGroup, not both.";

describe("status groups (UT-07 - specification section 5.4)", () => {
  it("defines ACTIVE and DONE only", () => {
    expect([...STATUS_GROUPS]).toEqual(["ACTIVE", "DONE"]);
  });

  it("ACTIVE is NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED", () => {
    expect([...statusesForGroup("ACTIVE")].sort()).toEqual(
      ["IN_PROGRESS", "NEW", "OPEN", "REOPENED", "WAITING_FOR_REQUESTER"],
    );
  });

  it("DONE is RESOLVED and CLOSED", () => {
    expect([...statusesForGroup("DONE")].sort()).toEqual(["CLOSED", "RESOLVED"]);
  });

  it("puts CANCELLED in neither group", () => {
    expect(statusesForGroup("ACTIVE")).not.toContain("CANCELLED");
    expect(statusesForGroup("DONE")).not.toContain("CANCELLED");
  });
});

describe("My Tickets status and statusGroup (UT-07 - api-spec section 4.1)", () => {
  const parse = parseTicketListQuery;

  it("accepts one status", () => {
    const r = parse({ status: "WAITING_FOR_REQUESTER" });
    expect(r.ok && r.query.status).toBe("WAITING_FOR_REQUESTER");
  });

  it.each(["ACTIVE", "DONE"])("accepts statusGroup=%s", (g) => {
    const r = parse({ statusGroup: g });
    expect(r.ok && r.query.statusGroup).toBe(g);
  });

  it("leaves both unset by default, so Lab 2 behaviour is unchanged", () => {
    const r = parse({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query).not.toHaveProperty("status");
      expect(r.query).not.toHaveProperty("statusGroup");
    }
  });

  it.each([{ status: "CLAIMED" }, { status: "open" }, { statusGroup: "OPEN" }, { statusGroup: "" }])(
    "rejects an invalid value %o",
    (raw) => {
      expect(parse(raw).ok).toBe(false);
    },
  );

  it("rejects status together with statusGroup", () => {
    const r = parse({ status: "NEW", statusGroup: "ACTIVE" });
    expect(r).toEqual({ ok: false, message: BOTH });
  });

  it("rejects a repeated statusGroup", () => {
    expect(parse({ statusGroup: ["ACTIVE", "DONE"] }).ok).toBe(false);
  });
});

describe("Ticket Queue statusGroup (UT-07 - api-spec section 4.2)", () => {
  it.each(["ACTIVE", "DONE"])("accepts statusGroup=%s alongside owner=me", (g) => {
    const r = parseQueueQuery({ statusGroup: g, owner: "me" });
    expect(r.ok && r.query.statusGroup).toBe(g);
    expect(r.ok && r.query.owner).toEqual({ kind: "me" });
  });

  it("rejects an invalid statusGroup", () => {
    expect(parseQueueQuery({ statusGroup: "CANCELLED" }).ok).toBe(false);
  });

  it("rejects status together with statusGroup", () => {
    expect(parseQueueQuery({ status: "OPEN", statusGroup: "ACTIVE" })).toEqual({ ok: false, message: BOTH });
  });

  it("keeps the Lab 3 default when statusGroup is absent", () => {
    expect(parseQueueQuery({})).toEqual({
      ok: true,
      query: { sortBy: "itPriority", sortOrder: "desc", page: 1, pageSize: 20 },
    });
  });
});
