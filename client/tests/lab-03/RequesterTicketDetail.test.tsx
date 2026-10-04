import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IT_STAFF, REQUESTER, mockStartupSession, renderApp } from "./helpers.js";
import {
  ACTIVE_ATTACHMENT,
  ALL_STATUSES,
  STATUS_TEXT,
  TICKET_ID,
  asAuthor,
  created,
  entry,
  fakeApi,
  ok,
  requesterRoutes,
  requesterTicket,
} from "./ticket-fixtures.js";

// UI-35 to UI-38 from docs/lab-03/tests.md section 2.10: the Lab 3 additions
// to Requester Ticket Detail, ui-spec.md section 6.3, against api-spec.md
// sections 4 and 6. UI-35 and UI-37 supersede L2 UI-28 (tests.md 4.1).

const DETAIL = `/tickets/${TICKET_ID}`;
const ELIGIBLE = ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

async function openDetail(api: ReturnType<typeof fakeApi>) {
  mockStartupSession(REQUESTER);
  renderApp(DETAIL);
  await screen.findByTestId("ticket-information");
  await screen.findByTestId("comments-card");
  return api;
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UI-35 (AC-25) - Requester comments", () => {
  const staffReply = entry("c0000000-0000-4000-8000-000000000001", "Please restart with the charger connected.", asAuthor(IT_STAFF));
  const ownComment = entry("c0000000-0000-4000-8000-000000000002", "Restarted, still drains.", asAuthor(REQUESTER), "2026-09-02T09:00:00.000Z");

  it("lists the comments oldest first with author and time, between ticket information and attachments", async () => {
    await openDetail(fakeApi(requesterRoutes(requesterTicket(), [staffReply, ownComment])));

    const card = screen.getByTestId("comments-card");
    expect(card).toHaveTextContent("Comments");
    const items = within(card).getAllByTestId(/^comment-item-/);
    expect(items.map((i) => i.getAttribute("data-testid"))).toEqual([
      `comment-item-${staffReply.id}`,
      `comment-item-${ownComment.id}`,
    ]);
    expect(items[0]).toHaveTextContent(IT_STAFF.fullName);
    expect(items[0]).toHaveTextContent(staffReply.body);
    expect(items[0].querySelector(`[title="${staffReply.createdAt}"]`)).not.toBeNull();

    const info = screen.getByTestId("ticket-information");
    const attachments = screen.getByTestId("attachment-section");
    expect(info.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(attachments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("posts a comment and appends the server's copy", async () => {
    const api = await openDetail(fakeApi(requesterRoutes(requesterTicket(), [staffReply])));
    const posted = entry("c0000000-0000-4000-8000-000000000003", "Thanks, will try.", asAuthor(REQUESTER));
    api.routes[`POST /tickets/${TICKET_ID}/comments`] = created(posted);

    const field = screen.getByLabelText("Add a comment");
    expect(field).toBe(screen.getByTestId("field-comment-body"));
    await userEvent.type(field, "Thanks, will try.");
    expect(screen.getByTestId("comments-card")).toHaveTextContent("17/2000");
    await userEvent.click(screen.getByTestId("btn-post-comment"));

    expect(await screen.findByTestId(`comment-item-${posted.id}`)).toHaveTextContent(REQUESTER.fullName);
    expect(api.callsTo("POST", `/tickets/${TICKET_ID}/comments`)[0].body).toEqual({ body: "Thanks, will try." });
    expect(within(screen.getByTestId("comments-card")).getAllByTestId(/^comment-item-/)).toHaveLength(2);
    expect(field).toHaveValue("");
    expect(screen.getByTestId("btn-post-comment").className).toMatch(/zg-btn--secondary/);
  });

  it("blocks an empty comment without a request", async () => {
    const api = await openDetail(fakeApi(requesterRoutes()));

    await userEvent.click(screen.getByTestId("btn-post-comment"));

    expect(screen.getByText("Write something before posting.")).toBeInTheDocument();
    expect(api.writes()).toHaveLength(0);
  });

  it("shows no notes, no note tab, and never asks for notes", async () => {
    const api = await openDetail(fakeApi(requesterRoutes(requesterTicket(), [staffReply])));

    expect(screen.queryByTestId("tab-notes")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByTestId("field-note-body")).not.toBeInTheDocument();
    expect(document.querySelector("[data-testid^='note-item-']")).toBeNull();
    expect((document.body.textContent ?? "").toLowerCase()).not.toContain("internal note");
    expect(api.calls.some((c) => c.path.includes("/notes"))).toBe(false);
  });

  it("replaces the composer on a CLOSED ticket, keeping the list", async () => {
    await openDetail(fakeApi(requesterRoutes(requesterTicket({ currentStatus: "CLOSED" }), [staffReply])));

    expect(screen.queryByTestId("field-comment-body")).not.toBeInTheDocument();
    expect(screen.getByText("Comments are closed for this ticket.")).toBeInTheDocument();
    expect(screen.getByTestId(`comment-item-${staffReply.id}`)).toBeInTheDocument();
  });

  it("shows No comments yet. for an empty list", async () => {
    await openDetail(fakeApi(requesterRoutes()));
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
  });
});

describe("UI-36 (AC-26) - appears resolved", () => {
  it.each(ELIGIBLE)("offers Problem appears resolved in %s", async (status) => {
    await openDetail(fakeApi(requesterRoutes(requesterTicket({ currentStatus: status }))));

    const panel = screen.getByTestId("resolution-panel");
    expect(panel).toHaveTextContent("Has the problem gone away?");
    expect(within(panel).getByTestId("btn-appears-resolved")).toHaveTextContent("Problem appears resolved");
  });

  it.each(["NEW", "RESOLVED", "CLOSED", "CANCELLED"])("hides the resolution panel in %s", async (status) => {
    await openDetail(fakeApi(requesterRoutes(requesterTicket({ currentStatus: status }))));

    expect(screen.queryByTestId("resolution-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-appears-resolved")).not.toBeInTheDocument();
  });

  it("confirming records the indication, shows the indicator, and hides the button", async () => {
    const api = await openDetail(fakeApi(requesterRoutes()));
    const at = "2026-10-02T09:00:00.000Z";
    api.routes[`POST /tickets/${TICKET_ID}/appears-resolved`] = ok({ requesterIndicatedResolvedAt: at });
    api.routes[`GET ${DETAIL}`] = ok(requesterTicket({ requesterIndicatedResolvedAt: at }));

    await userEvent.click(screen.getByTestId("btn-appears-resolved"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog).toHaveTextContent("Tell IT the problem appears resolved?");
    expect(dialog).toHaveTextContent("IT will review and formally resolve the ticket.");
    expect(within(dialog).getByTestId("btn-confirm")).toHaveTextContent("Yes, it appears resolved");
    expect(api.writes()).toHaveLength(0);

    await userEvent.click(within(dialog).getByTestId("btn-confirm"));

    const indicator = await screen.findByTestId("indicator-appears-resolved");
    expect(indicator).toHaveTextContent("Requester says the problem appears resolved");
    expect(screen.queryByTestId("btn-appears-resolved")).not.toBeInTheDocument();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(api.callsTo("POST", `/tickets/${TICKET_ID}/appears-resolved`)).toHaveLength(1);
  });

  it("cancelling the dialog sends nothing and returns focus to the button", async () => {
    const api = await openDetail(fakeApi(requesterRoutes()));

    const trigger = screen.getByTestId("btn-appears-resolved");
    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId("btn-dialog-cancel"));

    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(api.writes()).toHaveLength(0);
    expect(screen.queryByTestId("indicator-appears-resolved")).not.toBeInTheDocument();
  });

  it("shows the indicator instead of the button once indicated", async () => {
    await openDetail(
      fakeApi(requesterRoutes(requesterTicket({ requesterIndicatedResolvedAt: "2026-10-02T09:00:00.000Z" }))),
    );

    expect(screen.getByTestId("indicator-appears-resolved")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-appears-resolved")).not.toBeInTheDocument();
  });
});

describe("UI-37 (AC-27) - no staff controls for the Requester", () => {
  const STAFF_HOOKS = [
    "operations-card",
    "btn-claim",
    "field-assignee",
    "btn-assign",
    "field-it-priority",
    "btn-save-it-priority",
    "tab-notes",
    "field-note-body",
    "btn-post-note",
  ];
  const STAFF_LABELS = /^(claim|assign|save|start work|resume work|wait for requester|resolve|close|reopen|cancel ticket)$/i;

  it.each(ALL_STATUSES)("offers no status, cancel, reopen, claim, assign, or IT Priority control in %s", async (status) => {
    await openDetail(fakeApi(requesterRoutes(requesterTicket({ currentStatus: status }))));

    // The screen renders the status it was given (ui-spec 6.3: all eight).
    expect(screen.getByTestId("badge-status")).toHaveTextContent(new RegExp(`^${STATUS_TEXT[status]}$`));

    for (const hook of STAFF_HOOKS) {
      expect(screen.queryByTestId(hook), `${hook} in ${status}`).not.toBeInTheDocument();
    }
    expect(document.querySelector("[data-testid^='btn-transition-']")).toBeNull();
    expect(document.querySelectorAll("select")).toHaveLength(0);
    for (const button of screen.queryAllByRole("button")) {
      expect(button.textContent?.trim() ?? "", status).not.toMatch(STAFF_LABELS);
    }
    expect(screen.getByTestId("ticket-information").querySelectorAll("input, select, textarea, button")).toHaveLength(0);
  });

  it("shows the owner's name, or Not yet assigned", async () => {
    await openDetail(fakeApi(requesterRoutes()));
    expect(screen.getByTestId("ticket-information")).toHaveTextContent(IT_STAFF.fullName);

    cleanup();
    vi.restoreAllMocks();
    await openDetail(fakeApi(requesterRoutes(requesterTicket({ owner: null, currentStatus: "NEW" }))));
    expect(screen.getByTestId("ticket-information")).toHaveTextContent("Not yet assigned");
  });
});

describe("UI-38 (AC-24) - attachment lock in the UI", () => {
  const LOCKED_TEXT = "Attachments cannot be changed on a closed or cancelled ticket.";

  it.each(["CLOSED", "CANCELLED"])("offers no Add Attachment and no Remove in %s, but keeps Download", async (status) => {
    await openDetail(fakeApi(requesterRoutes(requesterTicket({ currentStatus: status, attachments: [ACTIVE_ATTACHMENT] }))));

    const section = screen.getByTestId("attachment-section");
    expect(within(section).queryByTestId("field-attachments")).not.toBeInTheDocument();
    expect(within(section).queryByTestId("btn-remove")).not.toBeInTheDocument();
    expect(section).toHaveTextContent(LOCKED_TEXT);
    expect(within(section).getByTestId("btn-download")).toHaveAttribute(
      "href",
      `/api/v1/attachments/${ACTIVE_ATTACHMENT.id}/download`,
    );
  });

  it("keeps Add Attachment and Remove on an open ticket", async () => {
    await openDetail(fakeApi(requesterRoutes(requesterTicket({ attachments: [ACTIVE_ATTACHMENT] }))));

    const section = screen.getByTestId("attachment-section");
    expect(within(section).getByTestId("field-attachments")).toBeInTheDocument();
    expect(within(section).getByTestId("btn-remove")).toBeInTheDocument();
    expect(section).not.toHaveTextContent(LOCKED_TEXT);
  });
});
