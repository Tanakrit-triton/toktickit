import { screen } from "@testing-library/react";
import { IT_STAFF, REQUESTER, mockStartupSession, renderApp } from "../lab-03/helpers.js";
import { TICKET_ID, fakeApi, ok, requesterRoutes, requesterTicket, staffRoutes, staffTicket } from "../lab-03/ticket-fixtures.js";

// Fixtures for the Lab 4 Actions Taken and workflow suites (docs/lab-04/
// tests.md UI-08 to UI-19, STY-01).
//
// They extend the Lab 3 ticket fixtures without editing them: the Lab 4 detail
// fields (api-spec 3.1) and the actions and history routes are added here.

export const STAFF_DETAIL = `/staff/tickets/${TICKET_ID}`;
export const ACTIONS = `/tickets/${TICKET_ID}/actions`;
export const CREATE_ACTION = `/staff/tickets/${TICKET_ID}/actions`;
export const HISTORY = `/staff/tickets/${TICKET_ID}/history`;
export const patchAction = (id: string) => `/staff/actions/${id}`;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 29 Oct 2026, 10:15 in Bangkok. */
export const ACTION_AT = "2026-10-29T03:15:00.000Z";
export const ACTION_AT_TEXT = "29 Oct 2026, 10:15";

export const WICHAI = { id: IT_STAFF.id, fullName: IT_STAFF.fullName, isActive: true };
export const ARISA = { id: "99999999-0000-4000-8000-000000000007", fullName: "Arisa Kongkaew", isActive: true };
export const NATTAPONG_INACTIVE = { id: "99999999-0000-4000-8000-000000000008", fullName: "Nattapong Saelim", isActive: false };

/** ActionTaken, api-spec 1.2. Defaults to a PLANNED action Wichai recorded for himself. */
export function action(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    ticketId: TICKET_ID,
    actionAt: ACTION_AT,
    description: "Checked the battery health report.",
    result: null,
    status: "PLANNED",
    performedBy: WICHAI,
    createdBy: WICHAI,
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    version: 0,
    createdAt: ACTION_AT,
    updatedAt: ACTION_AT,
    ...overrides,
  };
}

export const actionId = (n: number) => `ac000000-0000-4000-8000-00000000000${n}`;

/** The Lab 3 staff detail plus the api-spec 3.1 fields. */
export function staffTicket4(overrides: Record<string, unknown> = {}) {
  return staffTicket({
    version: 4,
    resolvedAt: null,
    actionSummary: { total: 0, open: 0, outstandingFollowUps: 0 },
    resolutionBlockers: null,
    ...overrides,
  });
}

export function historyBody(events: unknown[] = [], users: Record<string, string> = {}) {
  return { status: 200, body: { data: events, users } };
}

/** Everything Staff Ticket Detail reads on load in Lab 4. */
export function staffRoutes4(
  ticket = staffTicket4(),
  actions: unknown[] = [],
  history = historyBody(),
): ReturnType<typeof staffRoutes> {
  return {
    ...staffRoutes(ticket),
    [`GET ${ACTIONS}`]: ok(actions),
    [`GET ${HISTORY}`]: history,
  };
}

export function requesterRoutes4(actions: unknown[] = [], ticket = requesterTicket()): ReturnType<typeof requesterRoutes> {
  return { ...requesterRoutes(ticket), [`GET ${ACTIONS}`]: ok(actions) };
}

/** POST and PATCH answer `{ data, ticketVersion }` (api-spec 2.2, 2.3). */
export const actionSaved = (status: number, data: unknown, ticketVersion: number) => ({
  status,
  body: { data, ticketVersion },
});

export const invalid = (details: Record<string, string>) => ({
  status: 422,
  body: { error: { code: "VALIDATION_FAILED", message: "Some fields are not valid.", details } },
});

export async function openStaffDetail(routes: ReturnType<typeof staffRoutes4>) {
  const api = fakeApi(routes);
  mockStartupSession(IT_STAFF);
  renderApp(STAFF_DETAIL);
  await screen.findByTestId("operations-card");
  await screen.findByTestId("actions-card");
  return api;
}

export async function openRequesterDetail(routes: ReturnType<typeof requesterRoutes4>) {
  const api = fakeApi(routes);
  mockStartupSession(REQUESTER);
  renderApp(`/tickets/${TICKET_ID}`);
  await screen.findByTestId("ticket-information");
  await screen.findByTestId("actions-card");
  return api;
}

/** A promise the test settles by hand, for requests that must stay in flight. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Makes useMediaQuery report the mobile layout until restored. */
export function useMobileLayout() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}
