import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IT_STAFF } from "../lab-03/helpers.js";
import { ASSIGNEES, failure, ok } from "../lab-03/ticket-fixtures.js";
import {
  ACTION_AT,
  ACTION_AT_TEXT,
  ARISA,
  CREATE_ACTION,
  HISTORY,
  STAFF_DETAIL,
  action,
  actionId,
  actionSaved,
  historyBody,
  openStaffDetail,
  staffRoutes4,
  staffTicket4,
} from "./action-fixtures.js";

// UI-16 to UI-19 from docs/lab-04/tests.md section 2.7: resolve-blocked
// feedback, conflicts on the ticket workflow, and the History tab (ui-spec.md
// sections 5 and 6).

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const STALE_TEXT = "This ticket was changed by someone else.";
const stale = failure(409, "STALE_UPDATE", "The ticket was changed by someone else. Reload it and try again.");

describe("UI-16 (AC-22) - Resolve blocked by the gate", () => {
  const blockedFields = {
    actionSummary: { total: 3, open: 2, outstandingFollowUps: 1 },
    resolutionBlockers: { openActions: 2, outstandingFollowUps: 1 },
  };
  const blocked = staffTicket4(blockedFields);

  it("disables Resolve, links its reason through aria-describedby, and offers Go to Actions Taken", async () => {
    await openStaffDetail(staffRoutes4(blocked));

    const resolve = screen.getByTestId("btn-transition-RESOLVED");
    expect(resolve).toBeDisabled();
    const notice = screen.getByTestId("notice-resolution-blocked");
    expect(notice).toHaveTextContent("Can't resolve yet: 2 action(s) open, 1 follow-up(s) outstanding.");
    expect(resolve.getAttribute("aria-describedby")?.split(" ")).toContain(notice.id);

    const link = within(notice).getByRole("link", { name: "Go to Actions Taken" });
    expect(link).toHaveAttribute("href", "#actions");
    expect(screen.getByTestId("actions-card")).toHaveAttribute("id", "actions");

    // Only Resolve is held back; the other transitions stay usable.
    expect(screen.getByTestId("btn-transition-WAITING_FOR_REQUESTER")).toBeEnabled();
  });

  it("keeps Resolve disabled when the Requester says the problem appears resolved", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4({ ...blockedFields, requesterIndicatedResolvedAt: ACTION_AT })));
    expect(screen.getByTestId("indicator-appears-resolved")).toBeInTheDocument();
    expect(screen.getByTestId("btn-transition-RESOLVED")).toBeDisabled();
  });

  it("enables Resolve with no notice when nothing blocks it", async () => {
    await openStaffDetail(staffRoutes4());
    expect(screen.getByTestId("btn-transition-RESOLVED")).toBeEnabled();
    expect(screen.getByTestId("btn-transition-RESOLVED")).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByTestId("notice-resolution-blocked")).not.toBeInTheDocument();
  });
});

describe("UI-17 (AC-14) - the server refuses a stale Resolve", () => {
  const MESSAGE = "This ticket cannot be resolved yet: 1 action(s) still open and 0 follow-up(s) outstanding.";

  it("shows RESOLUTION_BLOCKED in the Conflict callout and re-fetches the detail", async () => {
    const api = await openStaffDetail(staffRoutes4());
    api.routes[`POST ${STAFF_DETAIL}/status`] = failure(409, "RESOLUTION_BLOCKED", MESSAGE);
    api.routes[`GET ${STAFF_DETAIL}`] = ok(staffTicket4({ resolutionBlockers: { openActions: 1, outstandingFollowUps: 0 } }));

    await userEvent.click(screen.getByTestId("btn-transition-RESOLVED"));
    await userEvent.click(screen.getByTestId("btn-confirm"));

    expect(await screen.findByTestId("callout-conflict")).toHaveTextContent(MESSAGE);
    await waitFor(() => expect(api.callsTo("GET", STAFF_DETAIL)).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId("btn-transition-RESOLVED")).toBeDisabled());
  });

  it("shows Resolved on under the status after a successful resolve", async () => {
    const api = await openStaffDetail(staffRoutes4());
    expect(screen.queryByTestId("resolved-at")).not.toBeInTheDocument();
    const resolved = staffTicket4({ version: 5, currentStatus: "RESOLVED", resolvedAt: ACTION_AT, availableTransitions: ["CLOSED", "REOPENED"] });
    api.routes[`POST ${STAFF_DETAIL}/status`] = ok(resolved);
    api.routes[`GET ${STAFF_DETAIL}`] = ok(resolved);

    await userEvent.click(screen.getByTestId("btn-transition-RESOLVED"));
    await userEvent.click(screen.getByTestId("btn-confirm"));

    expect(await screen.findByTestId("resolved-at")).toHaveTextContent(`Resolved on ${ACTION_AT_TEXT}`);
  });
});

describe("UI-18 (AC-18, AC-21) - every workflow write carries the version", () => {
  it("sends the detail's version with owner, IT Priority, and status", async () => {
    const ticket = staffTicket4({ version: 7 });
    const api = await openStaffDetail(staffRoutes4(ticket));
    api.routes[`PUT ${STAFF_DETAIL}/owner`] = ok(ticket);
    api.routes[`PUT ${STAFF_DETAIL}/it-priority`] = ok(ticket);
    api.routes[`POST ${STAFF_DETAIL}/status`] = ok(ticket);

    await userEvent.selectOptions(screen.getByTestId("field-assignee"), ASSIGNEES[0].id);
    await userEvent.click(screen.getByTestId("btn-assign"));
    await waitFor(() => expect(screen.getByTestId("btn-save-it-priority")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId("field-it-priority"), "LOW");
    await waitFor(() => expect(screen.getByTestId("btn-save-it-priority")).toBeEnabled());
    await userEvent.click(screen.getByTestId("btn-save-it-priority"));
    await waitFor(() => expect(screen.getByTestId("btn-transition-WAITING_FOR_REQUESTER")).toBeEnabled());
    await userEvent.click(screen.getByTestId("btn-transition-WAITING_FOR_REQUESTER"));

    await waitFor(() => expect(api.callsTo("POST", `${STAFF_DETAIL}/status`)).toHaveLength(1));
    expect(api.callsTo("PUT", `${STAFF_DETAIL}/owner`)[0].body).toEqual({ ownerId: ASSIGNEES[0].id, version: 7 });
    expect(api.callsTo("PUT", `${STAFF_DETAIL}/it-priority`)[0].body).toEqual({ itPriority: "LOW", version: 7 });
    expect(api.callsTo("POST", `${STAFF_DETAIL}/status`)[0].body).toEqual({ status: "WAITING_FOR_REQUESTER", version: 7 });
  });

  it("shows STALE_UPDATE with Reload ticket, which re-fetches the detail", async () => {
    const api = await openStaffDetail(staffRoutes4());
    api.routes[`PUT ${STAFF_DETAIL}/it-priority`] = stale;

    await userEvent.selectOptions(screen.getByTestId("field-it-priority"), "LOW");
    await userEvent.click(screen.getByTestId("btn-save-it-priority"));

    const conflict = await screen.findByTestId("callout-conflict");
    expect(conflict).toHaveTextContent(STALE_TEXT);
    // The user decides when to reload (ui-spec 5): nothing has re-fetched yet.
    expect(api.callsTo("GET", STAFF_DETAIL)).toHaveLength(1);

    api.routes[`GET ${STAFF_DETAIL}`] = ok(staffTicket4({ version: 9, itPriority: "HIGH" }));
    await userEvent.click(screen.getByTestId("btn-reload-ticket"));

    await waitFor(() => expect(api.callsTo("GET", STAFF_DETAIL)).toHaveLength(2));
    await waitFor(() => expect(screen.queryByTestId("callout-conflict")).not.toBeInTheDocument());
    expect(screen.getByTestId("badge-it-priority")).toHaveTextContent("High");
  });

  it("keeps a Reopen reason in its dialog after STALE_UPDATE until the dialog is closed", async () => {
    const resolved = staffTicket4({ currentStatus: "RESOLVED", resolvedAt: ACTION_AT, availableTransitions: ["CLOSED", "REOPENED"] });
    const api = await openStaffDetail(staffRoutes4(resolved));
    api.routes[`POST ${STAFF_DETAIL}/status`] = stale;

    await userEvent.click(screen.getByTestId("btn-transition-REOPENED"));
    await userEvent.type(screen.getByTestId("field-dialog-reason"), "The battery fails again.");
    await userEvent.click(screen.getByTestId("btn-confirm"));

    const dialog = screen.getByTestId("confirm-dialog");
    await waitFor(() => expect(within(dialog).getByText(new RegExp(STALE_TEXT))).toBeInTheDocument());
    expect(screen.getByTestId("field-dialog-reason")).toHaveValue("The battery fails again.");
    expect(screen.getByTestId("callout-conflict")).toHaveTextContent(STALE_TEXT);
    expect(screen.getByTestId("btn-reload-ticket")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("btn-dialog-cancel"));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("after an action save, the next ticket write carries the returned ticketVersion (Amendment 5)", async () => {
    let gets = 0;
    const routes = staffRoutes4(staffTicket4({ version: 4 }));
    routes[`GET ${STAFF_DETAIL}`] = () => {
      gets += 1;
      // The follow-up re-fetch never answers: the version must come from the write.
      return gets === 1 ? ok(staffTicket4({ version: 4 })) : new Promise(() => {});
    };
    const api = await openStaffDetail(routes);
    api.routes[`POST ${CREATE_ACTION}`] = actionSaved(201, action(actionId(1)), 5);
    api.routes[`PUT ${STAFF_DETAIL}/it-priority`] = ok(staffTicket4({ version: 6, itPriority: "LOW" }));

    await userEvent.click(screen.getByTestId("btn-record-action"));
    await userEvent.type(screen.getByTestId("field-action-description"), "Replaced the battery.");
    await userEvent.click(screen.getByTestId("btn-save-action"));
    await waitFor(() => expect(screen.queryByTestId("action-dialog")).not.toBeInTheDocument());

    await userEvent.selectOptions(screen.getByTestId("field-it-priority"), "LOW");
    await waitFor(() => expect(screen.getByTestId("btn-save-it-priority")).toBeEnabled());
    await userEvent.click(screen.getByTestId("btn-save-it-priority"));

    await waitFor(() => expect(api.callsTo("PUT", `${STAFF_DETAIL}/it-priority`)).toHaveLength(1));
    expect(api.callsTo("PUT", `${STAFF_DETAIL}/it-priority`)[0].body).toEqual({ itPriority: "LOW", version: 5 });
  });
});

describe("UI-19 (AC-23) - the History tab", () => {
  const ev = (n: number, eventType: string, actor: { id: string; fullName: string } | null, payload: unknown, minute: number) => ({
    id: `e0000000-0000-4000-8000-00000000000${n}`,
    eventType,
    actor,
    payload,
    createdAt: `2026-10-29T03:${String(minute).padStart(2, "0")}:00.000Z`,
  });
  const wichai = { id: IT_STAFF.id, fullName: IT_STAFF.fullName };
  const arisa = { id: ARISA.id, fullName: ARISA.fullName };
  const events = [
    ev(1, "OWNER_CHANGED", wichai, { fromOwnerId: null, toOwnerId: wichai.id, cause: "CLAIM" }, 0),
    ev(2, "OWNER_CHANGED", wichai, { fromOwnerId: wichai.id, toOwnerId: arisa.id, cause: "ASSIGN" }, 1),
    ev(3, "IT_PRIORITY_CHANGED", arisa, { from: "HIGH", to: "URGENT" }, 2),
    ev(4, "ACTION_CREATED", arisa, { actionId: actionId(1), status: "PLANNED", performedById: arisa.id }, 3),
    ev(5, "ACTION_UPDATED", arisa, { actionId: actionId(1), changes: { result: { changed: true }, followUpRequired: { from: false, to: true }, followUpNote: { changed: true } } }, 4),
    ev(6, "ACTION_UPDATED", arisa, { actionId: actionId(1), changes: { status: { from: "IN_PROGRESS", to: "COMPLETED" }, result: { changed: true } } }, 5),
    ev(7, "STATUS_CHANGED", arisa, { from: "IN_PROGRESS", to: "RESOLVED" }, 6),
    ev(8, "OWNER_CHANGED", null, { fromOwnerId: arisa.id, toOwnerId: null, cause: "OWNER_INELIGIBLE_ON_REOPEN" }, 7),
  ];
  const users = { [wichai.id]: wichai.fullName, [arisa.id]: arisa.fullName };
  const sentences = [
    "Wichai Prasert claimed the ticket.",
    "Wichai Prasert assigned the ticket to Arisa Kongkaew.",
    "Arisa Kongkaew changed IT Priority from High to Urgent.",
    "Arisa Kongkaew recorded an action.",
    "Arisa Kongkaew edited an action (result, follow-up).",
    "Arisa Kongkaew completed an action.",
    "Arisa Kongkaew changed status from In Progress to Resolved.",
    "System removed Arisa Kongkaew as Ticket Owner.",
  ];

  it("lists one sentence per event, oldest first, with System for a null actor", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), [], historyBody(events, users)));

    const tab = screen.getByTestId("tab-history");
    await waitFor(() => expect(tab).toHaveTextContent("History (8)"));
    await userEvent.click(tab);
    expect(tab).toHaveAttribute("aria-selected", "true");

    const items = screen.getAllByTestId(/^history-item-/);
    expect(items.map((item) => item.getAttribute("data-testid"))).toEqual(events.map((e) => `history-item-${e.id}`));
    items.forEach((item, i) => expect(item, sentences[i]).toHaveTextContent(sentences[i]));
    const time = within(items[0]).getByText(ACTION_AT_TEXT.replace("10:15", "10:00"));
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", events[0].createdAt);

    // Read-only: no composer and no primary button in the panel.
    const panel = screen.getByRole("tabpanel");
    expect(panel.querySelectorAll("textarea, input, select, .zg-btn--primary")).toHaveLength(0);
  });

  it("says No history yet. when there is none", async () => {
    await openStaffDetail(staffRoutes4());
    await userEvent.click(screen.getByTestId("tab-history"));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("No history yet.");
  });

  it("moves between the three tabs with the arrow keys", async () => {
    await openStaffDetail(staffRoutes4());
    const user = userEvent.setup();
    const comments = screen.getByTestId("tab-comments");
    const notes = screen.getByTestId("tab-notes");
    const history = screen.getByTestId("tab-history");

    comments.focus();
    await user.keyboard("{ArrowRight}");
    expect(notes).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(history).toHaveFocus();
    expect(history).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-history");
    await user.keyboard("{ArrowRight}");
    expect(comments).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(history).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(notes).toHaveFocus();
  });

  it("re-fetches the history after a workflow change succeeds", async () => {
    const api = await openStaffDetail(staffRoutes4());
    await waitFor(() => expect(api.callsTo("GET", HISTORY)).toHaveLength(1));
    const after = staffTicket4({ version: 5, currentStatus: "WAITING_FOR_REQUESTER", availableTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"] });
    api.routes[`POST ${STAFF_DETAIL}/status`] = ok(after);
    api.routes[`GET ${STAFF_DETAIL}`] = ok(after);

    await userEvent.click(screen.getByTestId("btn-transition-WAITING_FOR_REQUESTER"));
    await waitFor(() => expect(api.callsTo("GET", HISTORY).length).toBeGreaterThan(1));
  });
});
