import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IT_STAFF, mockStartupSession, renderApp } from "../lab-03/helpers.js";
import { ASSIGNEES, TICKET_ID, fakeApi, ok, staffRoutes, staffTicket } from "../lab-03/ticket-fixtures.js";

// UI-31 from docs/lab-04/tests.md section 2.7 (AC-18, Amendment 5).
//
// Every Staff Ticket Detail write that changes the ticket's version (claim,
// assign, IT Priority, status) returns the fresh detail. The screen must use
// that response before it re-enables its controls, so a second operation sent
// at once carries the new version. Waiting for the follow-up re-fetch is not
// enough: here the re-fetch never answers, which is the slowest case.

const DETAIL = `/staff/tickets/${TICKET_ID}`;
const LOADED = 1;
const AFTER_WRITE = 2;

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The first GET answers; every later GET (the re-fetch) stays pending. */
function routesWithStalledRefetch(loaded: ReturnType<typeof staffTicket>) {
  let gets = 0;
  const routes = staffRoutes(loaded);
  routes[`GET ${DETAIL}`] = () => {
    gets += 1;
    return gets === 1 ? ok(loaded) : new Promise(() => {});
  };
  return routes;
}

async function open(loaded: ReturnType<typeof staffTicket>) {
  const api = fakeApi(routesWithStalledRefetch(loaded));
  mockStartupSession(IT_STAFF);
  renderApp(DETAIL);
  await screen.findByTestId("operations-card");
  return api;
}

/** Saves a different IT Priority once the Save control is usable again. */
async function savePriority(value: string) {
  await userEvent.selectOptions(screen.getByTestId("field-it-priority"), value);
  const save = screen.getByTestId("btn-save-it-priority");
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);
}

describe("UI-31 (AC-18, Amendment 5) - the next write carries the version a write returned", () => {
  it("after Claim", async () => {
    const loaded = staffTicket({ version: LOADED, currentStatus: "NEW", owner: null, availableTransitions: ["CANCELLED"] });
    const api = await open(loaded);
    api.routes[`POST ${DETAIL}/claim`] = ok(
      staffTicket({
        version: AFTER_WRITE,
        currentStatus: "OPEN",
        owner: { id: IT_STAFF.id, fullName: IT_STAFF.fullName },
        availableTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
      }),
    );
    api.routes[`PUT ${DETAIL}/it-priority`] = ok(staffTicket({ version: AFTER_WRITE + 1, itPriority: "LOW" }));

    await userEvent.click(screen.getByTestId("btn-claim"));
    await savePriority("LOW");

    await waitFor(() => expect(api.callsTo("PUT", `${DETAIL}/it-priority`)).toHaveLength(1));
    expect(api.callsTo("PUT", `${DETAIL}/it-priority`)[0].body).toEqual({ itPriority: "LOW", version: AFTER_WRITE });
  });

  it("after Assign", async () => {
    const api = await open(staffTicket({ version: LOADED }));
    const target = ASSIGNEES[0];
    api.routes[`PUT ${DETAIL}/owner`] = ok(
      staffTicket({ version: AFTER_WRITE, owner: { id: target.id, fullName: target.fullName } }),
    );
    api.routes[`PUT ${DETAIL}/it-priority`] = ok(staffTicket({ version: AFTER_WRITE + 1, itPriority: "LOW" }));

    await userEvent.selectOptions(screen.getByTestId("field-assignee"), target.id);
    await userEvent.click(screen.getByTestId("btn-assign"));
    await savePriority("LOW");

    await waitFor(() => expect(api.callsTo("PUT", `${DETAIL}/it-priority`)).toHaveLength(1));
    expect(api.callsTo("PUT", `${DETAIL}/it-priority`)[0].body).toEqual({ itPriority: "LOW", version: AFTER_WRITE });
  });

  it("after an IT Priority change", async () => {
    const loaded = staffTicket({ version: LOADED, currentStatus: "OPEN", availableTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"] });
    const api = await open(loaded);
    api.routes[`PUT ${DETAIL}/it-priority`] = ok(
      staffTicket({ version: AFTER_WRITE, itPriority: "LOW", currentStatus: "OPEN", availableTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"] }),
    );
    api.routes[`POST ${DETAIL}/status`] = ok(staffTicket({ version: AFTER_WRITE + 1, currentStatus: "IN_PROGRESS" }));

    await savePriority("LOW");
    const start = screen.getByTestId("btn-transition-IN_PROGRESS");
    await waitFor(() => expect(start).toBeEnabled());
    await userEvent.click(start);

    await waitFor(() => expect(api.callsTo("POST", `${DETAIL}/status`)).toHaveLength(1));
    expect(api.callsTo("POST", `${DETAIL}/status`)[0].body).toEqual({ status: "IN_PROGRESS", version: AFTER_WRITE });
  });

  it("after a status change", async () => {
    const api = await open(staffTicket({ version: LOADED }));
    api.routes[`POST ${DETAIL}/status`] = ok(
      staffTicket({ version: AFTER_WRITE, currentStatus: "WAITING_FOR_REQUESTER", availableTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"] }),
    );
    api.routes[`PUT ${DETAIL}/it-priority`] = ok(staffTicket({ version: AFTER_WRITE + 1, itPriority: "LOW" }));

    await userEvent.click(screen.getByTestId("btn-transition-WAITING_FOR_REQUESTER"));
    await savePriority("LOW");

    await waitFor(() => expect(api.callsTo("PUT", `${DETAIL}/it-priority`)).toHaveLength(1));
    expect(api.callsTo("PUT", `${DETAIL}/it-priority`)[0].body).toEqual({ itPriority: "LOW", version: AFTER_WRITE });
  });
});
