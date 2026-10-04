import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IT_STAFF, mockStartupSession, renderApp } from "./helpers.js";
import {
  ACTIVE_ATTACHMENT,
  ASSIGNEES,
  REMOVED_ATTACHMENT,
  TICKET_ID,
  TICKET_NUMBER,
  asAuthor,
  created,
  entry,
  failure,
  fakeApi,
  ok,
  staffRoutes,
  staffTicket,
} from "./ticket-fixtures.js";

// UI-27 to UI-34 from docs/lab-03/tests.md section 2.10: IT Staff Ticket
// Detail, ui-spec.md section 6.5, against api-spec.md sections 5 and 6.

const DETAIL = `/staff/tickets/${TICKET_ID}`;
const NOTE_LABEL = "Internal note — not visible to Requester";

async function openDetail(api: ReturnType<typeof fakeApi>) {
  mockStartupSession(IT_STAFF);
  renderApp(DETAIL);
  await screen.findByTestId("staff-ticket-detail-screen");
  await screen.findByTestId("operations-card");
  return api;
}

function detailGets(api: ReturnType<typeof fakeApi>) {
  return api.callsTo("GET", DETAIL).length;
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UI-27 (AC-34) - staff detail layout", () => {
  it("shows the ticket information read-only, with no control in it", async () => {
    await openDetail(fakeApi(staffRoutes()));

    const info = screen.getByTestId("ticket-information");
    for (const value of [
      "Napat Chaiwong",
      "napat.cha@kmutt.ac.th",
      "Hardware",
      "Corporate Laptop",
      "Laptop battery drains within one hour",
      "Started after the update.",
    ]) {
      expect(info, value).toHaveTextContent(value);
    }
    expect(info.querySelectorAll("input, select, textarea, button")).toHaveLength(0);
  });

  it("keeps every editable operational field inside operations-card", async () => {
    await openDetail(fakeApi(staffRoutes(staffTicket({ owner: null, currentStatus: "NEW", availableTransitions: ["CANCELLED"] }))));

    const operations = screen.getByTestId("operations-card");
    expect(within(operations).getByTestId("field-assignee")).toBeInTheDocument();
    expect(within(operations).getByTestId("field-it-priority")).toBeInTheDocument();

    // Selects and inputs exist only in the operations card. The one textarea
    // outside it is the active composer, which edits a new message rather than
    // the ticket (ui-spec 6.5: "the only region with editable operational fields").
    for (const field of document.querySelectorAll("input, select")) {
      expect(operations.contains(field), field.outerHTML).toBe(true);
    }
    for (const field of document.querySelectorAll("textarea")) {
      if (operations.contains(field)) continue;
      expect(field.getAttribute("data-testid")).toMatch(/^field-(comment|note)-body$/);
    }
  });

  it("shows the IT Priority select with the current value, and Save only once it changes", async () => {
    const api = await openDetail(fakeApi(staffRoutes()));
    api.routes[`PUT /staff/tickets/${TICKET_ID}/it-priority`] = ok(staffTicket({ itPriority: "LOW" }));

    const select = screen.getByTestId("field-it-priority") as HTMLSelectElement;
    expect(select.value).toBe("URGENT");
    expect(screen.getByTestId("btn-save-it-priority")).toBeDisabled();

    await userEvent.selectOptions(select, "LOW");
    await userEvent.click(screen.getByTestId("btn-save-it-priority"));

    await waitFor(() => expect(detailGets(api)).toBe(2));
    expect(api.callsTo("PUT", `/staff/tickets/${TICKET_ID}/it-priority`)[0].body).toEqual({ itPriority: "LOW" });
  });

  it("shows IT Priority read-only on CLOSED and CANCELLED tickets", async () => {
    for (const status of ["CLOSED", "CANCELLED"]) {
      cleanup();
      vi.restoreAllMocks();
      await openDetail(fakeApi(staffRoutes(staffTicket({ currentStatus: status, availableTransitions: ["REOPENED"] }))));

      expect(screen.queryByTestId("field-it-priority"), status).not.toBeInTheDocument();
      expect(within(screen.getByTestId("operations-card")).getByTestId("badge-it-priority")).toHaveTextContent(/Urgent/);
    }
  });
});

describe("UI-28 (AC-35, AC-37) - owner controls", () => {
  it("offers Claim only on an unassigned ticket in a claimable status", async () => {
    const cases: [Record<string, unknown>, boolean][] = [
      [{ owner: null, currentStatus: "NEW", availableTransitions: ["CANCELLED"] }, true],
      [{ owner: null, currentStatus: "REOPENED", availableTransitions: ["CANCELLED"] }, true],
      [{ currentStatus: "OPEN" }, false],
      [{ owner: null, currentStatus: "RESOLVED", availableTransitions: ["REOPENED"] }, false],
      [{ owner: null, currentStatus: "CLOSED", availableTransitions: ["REOPENED"] }, false],
      [{ owner: null, currentStatus: "CANCELLED", availableTransitions: ["REOPENED"] }, false],
    ];
    for (const [overrides, claimable] of cases) {
      cleanup();
      vi.restoreAllMocks();
      await openDetail(fakeApi(staffRoutes(staffTicket(overrides))));

      const label = JSON.stringify(overrides);
      if (claimable) expect(screen.getByTestId("btn-claim"), label).toBeInTheDocument();
      else expect(screen.queryByTestId("btn-claim"), label).not.toBeInTheDocument();
    }
  });

  it("shows the owner's name, or Unassigned", async () => {
    await openDetail(fakeApi(staffRoutes()));
    expect(screen.getByTestId("ticket-owner")).toHaveTextContent(IT_STAFF.fullName);

    cleanup();
    vi.restoreAllMocks();
    await openDetail(fakeApi(staffRoutes(staffTicket({ owner: null, currentStatus: "NEW", availableTransitions: ["CANCELLED"] }))));
    expect(screen.getByTestId("ticket-owner")).toHaveTextContent("Unassigned");
  });

  it("lists GET /staff/assignees in the Assign to select", async () => {
    await openDetail(fakeApi(staffRoutes()));

    const select = screen.getByTestId("field-assignee") as HTMLSelectElement;
    const names = Array.from(select.options).map((o) => o.textContent);
    for (const assignee of ASSIGNEES) expect(names).toContain(assignee.fullName);
    for (const assignee of ASSIGNEES) {
      expect(Array.from(select.options).some((o) => o.value === assignee.id), assignee.fullName).toBe(true);
    }
  });

  it("hides Assign outside the assignable statuses", async () => {
    for (const status of ["RESOLVED", "CLOSED", "CANCELLED"]) {
      cleanup();
      vi.restoreAllMocks();
      await openDetail(fakeApi(staffRoutes(staffTicket({ currentStatus: status, availableTransitions: [] }))));
      expect(screen.queryByTestId("field-assignee"), status).not.toBeInTheDocument();
      expect(screen.queryByTestId("btn-assign"), status).not.toBeInTheDocument();
    }
  });

  it("re-fetches the detail after a successful claim and shows the server's owner", async () => {
    const unassigned = staffTicket({ owner: null, currentStatus: "NEW", availableTransitions: ["CANCELLED"] });
    const api = await openDetail(fakeApi(staffRoutes(unassigned)));
    const claimed = staffTicket({ currentStatus: "OPEN", availableTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"] });
    api.routes[`POST /staff/tickets/${TICKET_ID}/claim`] = ok(claimed);
    api.routes[`GET ${DETAIL}`] = ok(claimed);

    await userEvent.click(screen.getByTestId("btn-claim"));

    await waitFor(() => expect(detailGets(api)).toBe(2));
    expect(api.callsTo("POST", `/staff/tickets/${TICKET_ID}/claim`)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId("btn-claim")).not.toBeInTheDocument());
    expect(screen.getByTestId("ticket-owner")).toHaveTextContent(IT_STAFF.fullName);
  });

  it("re-fetches the detail after a successful assign, sending the chosen ownerId", async () => {
    const api = await openDetail(fakeApi(staffRoutes()));
    const target = ASSIGNEES[0];
    const reassigned = staffTicket({ owner: { id: target.id, fullName: target.fullName } });
    api.routes[`PUT /staff/tickets/${TICKET_ID}/owner`] = ok(reassigned);
    api.routes[`GET ${DETAIL}`] = ok(reassigned);

    await userEvent.selectOptions(screen.getByTestId("field-assignee"), target.id);
    await userEvent.click(screen.getByTestId("btn-assign"));

    await waitFor(() => expect(detailGets(api)).toBe(2));
    expect(api.callsTo("PUT", `/staff/tickets/${TICKET_ID}/owner`)[0].body).toEqual({ ownerId: target.id });
    await waitFor(() => expect(screen.getByTestId("ticket-owner")).toHaveTextContent(target.fullName));
  });
});

describe("UI-29 (AC-39) - transition buttons", () => {
  const cases: [string, string[], Record<string, string>][] = [
    ["OPEN", ["IN_PROGRESS", "RESOLVED", "CANCELLED"], { IN_PROGRESS: "Start work", RESOLVED: "Resolve", CANCELLED: "Cancel ticket" }],
    ["REOPENED", ["IN_PROGRESS", "RESOLVED", "CANCELLED"], { IN_PROGRESS: "Start work", RESOLVED: "Resolve", CANCELLED: "Cancel ticket" }],
    ["IN_PROGRESS", ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"], { WAITING_FOR_REQUESTER: "Wait for requester", RESOLVED: "Resolve", CANCELLED: "Cancel ticket" }],
    ["WAITING_FOR_REQUESTER", ["IN_PROGRESS", "RESOLVED", "CANCELLED"], { IN_PROGRESS: "Resume work", RESOLVED: "Resolve", CANCELLED: "Cancel ticket" }],
    ["RESOLVED", ["CLOSED", "REOPENED"], { CLOSED: "Close", REOPENED: "Reopen" }],
    ["CLOSED", ["REOPENED"], { REOPENED: "Reopen" }],
    ["NEW", ["CANCELLED"], { CANCELLED: "Cancel ticket" }],
  ];

  it.each(cases)("renders exactly one labelled button per availableTransitions entry in %s", async (status, transitions, labels) => {
    await openDetail(fakeApi(staffRoutes(staffTicket({ currentStatus: status, availableTransitions: transitions }))));

    const buttons = document.querySelectorAll("[data-testid^='btn-transition-']");
    expect(buttons).toHaveLength(transitions.length);
    for (const target of transitions) {
      expect(screen.getByTestId(`btn-transition-${target}`)).toHaveTextContent(new RegExp(`^${labels[target]}$`));
    }
  });

  it("renders no button for a status the server did not list", async () => {
    // The server knows the owner rule: an unowned REOPENED ticket offers only
    // CANCELLED, so Start work and Resolve must not appear (BR-36).
    await openDetail(fakeApi(staffRoutes(staffTicket({ owner: null, currentStatus: "REOPENED", availableTransitions: ["CANCELLED"] }))));

    expect(document.querySelectorAll("[data-testid^='btn-transition-']")).toHaveLength(1);
    expect(screen.queryByTestId("btn-transition-IN_PROGRESS")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-transition-RESOLVED")).not.toBeInTheDocument();

    cleanup();
    vi.restoreAllMocks();
    await openDetail(fakeApi(staffRoutes(staffTicket({ currentStatus: "OPEN", availableTransitions: [] }))));
    expect(document.querySelectorAll("[data-testid^='btn-transition-']")).toHaveLength(0);
  });

  it("styles Cancel ticket as destructive and the others as secondary", async () => {
    await openDetail(fakeApi(staffRoutes()));

    expect(screen.getByTestId("btn-transition-CANCELLED").className).toMatch(/zg-btn--destructive/);
    expect(screen.getByTestId("btn-transition-RESOLVED").className).toMatch(/zg-btn--secondary/);
    expect(screen.getByTestId("btn-transition-WAITING_FOR_REQUESTER").className).toMatch(/zg-btn--secondary/);
  });

  it("sends a transition without a dialog when none is required, then re-fetches", async () => {
    const api = await openDetail(fakeApi(staffRoutes()));
    api.routes[`POST /staff/tickets/${TICKET_ID}/status`] = ok(staffTicket({ currentStatus: "WAITING_FOR_REQUESTER" }));

    await userEvent.click(screen.getByTestId("btn-transition-WAITING_FOR_REQUESTER"));

    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(detailGets(api)).toBe(2));
    expect(api.callsTo("POST", `/staff/tickets/${TICKET_ID}/status`)[0].body).toEqual({ status: "WAITING_FOR_REQUESTER" });
  });
});

describe("UI-30 (AC-41) - confirmation dialogs", () => {
  const statusPath = `/staff/tickets/${TICKET_ID}/status`;

  it("Resolve opens a dialog, sends nothing until confirmed, then sends RESOLVED", async () => {
    const api = await openDetail(fakeApi(staffRoutes()));
    api.routes[`POST ${statusPath}`] = ok(staffTicket({ currentStatus: "RESOLVED", availableTransitions: ["CLOSED", "REOPENED"] }));

    await userEvent.click(screen.getByTestId("btn-transition-RESOLVED"));

    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent(`Mark ${TICKET_NUMBER} as resolved?`);
    expect(api.writes()).toHaveLength(0);

    await userEvent.click(within(dialog).getByTestId("btn-confirm"));

    await waitFor(() => expect(api.callsTo("POST", statusPath)).toHaveLength(1));
    expect(api.callsTo("POST", statusPath)[0].body).toEqual({ status: "RESOLVED" });
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
  });

  it("Close opens a dialog naming the lock", async () => {
    const api = await openDetail(
      fakeApi(staffRoutes(staffTicket({ currentStatus: "RESOLVED", availableTransitions: ["CLOSED", "REOPENED"] }))),
    );

    await userEvent.click(screen.getByTestId("btn-transition-CLOSED"));

    expect(screen.getByTestId("confirm-dialog")).toHaveTextContent(`Close ${TICKET_NUMBER}? Closed tickets are locked.`);
    expect(screen.queryByTestId("field-dialog-reason")).not.toBeInTheDocument();
    expect(api.writes()).toHaveLength(0);
  });

  it("Cancel ticket requires a reason of at least 5 characters before anything is sent", async () => {
    const api = await openDetail(fakeApi(staffRoutes()));
    api.routes[`POST ${statusPath}`] = ok(staffTicket({ currentStatus: "CANCELLED", availableTransitions: ["REOPENED"] }));

    await userEvent.click(screen.getByTestId("btn-transition-CANCELLED"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog).toHaveTextContent(`Cancel ${TICKET_NUMBER}?`);
    // Two "Cancel" labels never appear together (ui-spec 5.2).
    expect(within(dialog).getByTestId("btn-dialog-cancel")).toHaveTextContent("Keep ticket");
    expect(within(dialog).getByTestId("btn-confirm").className).toMatch(/zg-btn--destructive/);

    await userEvent.click(within(dialog).getByTestId("btn-confirm"));
    expect(api.writes()).toHaveLength(0);
    expect(within(dialog).getByTestId("field-dialog-reason")).toHaveAttribute("aria-invalid", "true");

    await userEvent.type(within(dialog).getByTestId("field-dialog-reason"), "  abcd  ");
    await userEvent.click(within(dialog).getByTestId("btn-confirm"));
    expect(api.writes()).toHaveLength(0);

    await userEvent.clear(within(dialog).getByTestId("field-dialog-reason"));
    await userEvent.type(within(dialog).getByTestId("field-dialog-reason"), "Duplicate of TKT-2026-00040");
    await userEvent.click(within(dialog).getByTestId("btn-confirm"));

    await waitFor(() => expect(api.callsTo("POST", statusPath)).toHaveLength(1));
    expect(api.callsTo("POST", statusPath)[0].body).toEqual({ status: "CANCELLED", reason: "Duplicate of TKT-2026-00040" });
  });

  it("Reopen requires a reason of at least 5 characters before anything is sent", async () => {
    const api = await openDetail(
      fakeApi(staffRoutes(staffTicket({ currentStatus: "CLOSED", availableTransitions: ["REOPENED"] }))),
    );
    api.routes[`POST ${statusPath}`] = ok(staffTicket({ currentStatus: "REOPENED" }));

    await userEvent.click(screen.getByTestId("btn-transition-REOPENED"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog).toHaveTextContent(`Reopen ${TICKET_NUMBER}?`);

    await userEvent.type(within(dialog).getByTestId("field-dialog-reason"), "abcd");
    await userEvent.click(within(dialog).getByTestId("btn-confirm"));
    expect(api.writes()).toHaveLength(0);

    await userEvent.type(within(dialog).getByTestId("field-dialog-reason"), "e");
    await userEvent.click(within(dialog).getByTestId("btn-confirm"));

    await waitFor(() => expect(api.callsTo("POST", statusPath)).toHaveLength(1));
    expect(api.callsTo("POST", statusPath)[0].body).toEqual({ status: "REOPENED", reason: "abcde" });
  });

  it("dismissing the dialog sends nothing and returns focus to the trigger", async () => {
    const api = await openDetail(fakeApi(staffRoutes()));

    const trigger = screen.getByTestId("btn-transition-CANCELLED");
    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId("btn-dialog-cancel"));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await userEvent.click(screen.getByTestId("btn-transition-RESOLVED"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-transition-RESOLVED")).toHaveFocus();

    expect(api.writes()).toHaveLength(0);
  });
});

describe("UI-31 (AC-36, AC-68) - conflict handling", () => {
  it("shows the server's 409 message in callout-conflict and re-fetches the detail", async () => {
    const unassigned = staffTicket({ owner: null, currentStatus: "NEW", availableTransitions: ["CANCELLED"] });
    const api = await openDetail(fakeApi(staffRoutes(unassigned)));
    api.routes[`POST /staff/tickets/${TICKET_ID}/claim`] = failure(409, "TICKET_ALREADY_CLAIMED", "This ticket has already been claimed.");
    const claimedByOther = staffTicket({ owner: { id: ASSIGNEES[0].id, fullName: ASSIGNEES[0].fullName }, currentStatus: "OPEN" });
    api.routes[`GET ${DETAIL}`] = ok(claimedByOther);

    await userEvent.click(screen.getByTestId("btn-claim"));

    const callout = await screen.findByTestId("callout-conflict");
    expect(callout).toHaveTextContent("This ticket has already been claimed.");
    expect(callout).toHaveTextContent("The ticket has been reloaded.");
    expect(callout).not.toHaveTextContent(/409|TICKET_ALREADY_CLAIMED/);
    await waitFor(() => expect(detailGets(api)).toBe(2));
    await waitFor(() => expect(screen.getByTestId("ticket-owner")).toHaveTextContent(ASSIGNEES[0].fullName));
  });

  it("handles a 409 from a confirmed transition the same way and closes the dialog", async () => {
    const api = await openDetail(fakeApi(staffRoutes()));
    api.routes[`POST /staff/tickets/${TICKET_ID}/status`] = failure(
      409,
      "INVALID_STATUS_TRANSITION",
      "This ticket cannot move from Closed to Resolved.",
    );

    await userEvent.click(screen.getByTestId("btn-transition-RESOLVED"));
    await userEvent.click(screen.getByTestId("btn-confirm"));

    expect(await screen.findByTestId("callout-conflict")).toHaveTextContent("This ticket cannot move from Closed to Resolved.");
    await waitFor(() => expect(detailGets(api)).toBe(2));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("shows the not-found state for a 404, with no status code", async () => {
    fakeApi({
      ...staffRoutes(),
      [`GET ${DETAIL}`]: failure(404, "NOT_FOUND", "Ticket not found."),
    });
    mockStartupSession(IT_STAFF);
    renderApp(DETAIL);

    const state = await screen.findByTestId("state-not-found");
    expect(state).toHaveTextContent("This ticket could not be found.");
    expect(document.body.textContent).not.toMatch(/\b404\b/);
  });

  it("shows a safe failure with Retry for an unexpected response", async () => {
    const api = fakeApi({
      ...staffRoutes(),
      [`GET ${DETAIL}`]: failure(500, "INTERNAL_ERROR", "Database exploded at db.ts:12"),
    });
    mockStartupSession(IT_STAFF);
    renderApp(DETAIL);

    const callout = await screen.findByTestId("callout-error");
    expect(document.body.textContent).not.toMatch(/\b500\b|db\.ts|INTERNAL_ERROR/);

    api.routes[`GET ${DETAIL}`] = ok(staffTicket());
    await userEvent.click(within(callout.parentElement!).getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("operations-card")).toBeInTheDocument();
  });
});

describe("UI-32 (AC-50) - comment and note regions", () => {
  const comments = [entry("c0000000-0000-4000-8000-000000000001", "Please restart with the charger connected.")];
  const notes = [
    entry("n0000000-0000-4000-8000-000000000001", "Battery health is 61 percent."),
    entry("n0000000-0000-4000-8000-000000000002", "Replacement ordered."),
  ];

  it("separates comments and notes into tabs, with only the active tab's composer rendered", async () => {
    await openDetail(fakeApi(staffRoutes(staffTicket(), comments, notes)));

    const tablist = screen.getByRole("tablist");
    const commentsTab = within(tablist).getByTestId("tab-comments");
    const notesTab = within(tablist).getByTestId("tab-notes");
    expect(commentsTab).toHaveAttribute("role", "tab");
    expect(commentsTab).toHaveTextContent("Public Comments (1)");
    expect(notesTab).toHaveTextContent("Internal Notes (2)");
    expect(commentsTab).toHaveAttribute("aria-selected", "true");

    expect(screen.getByTestId("field-comment-body")).toBeInTheDocument();
    expect(screen.getByLabelText("Reply to the requester (visible to the requester)")).toBe(screen.getByTestId("field-comment-body"));
    expect(screen.queryByTestId("field-note-body")).not.toBeInTheDocument();
    expect(screen.getByTestId(`comment-item-${comments[0].id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`note-item-${notes[0].id}`)).not.toBeInTheDocument();

    await userEvent.click(notesTab);

    expect(notesTab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("field-comment-body")).not.toBeInTheDocument();
    expect(screen.getByLabelText(NOTE_LABEL)).toBe(screen.getByTestId("field-note-body"));
    expect(screen.queryByTestId(`comment-item-${comments[0].id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-post-note")).toHaveTextContent("Post internal note");
  });

  it("labels every note item as not visible to the Requester", async () => {
    await openDetail(fakeApi(staffRoutes(staffTicket(), comments, notes)));
    await userEvent.click(screen.getByTestId("tab-notes"));

    for (const note of notes) {
      const item = screen.getByTestId(`note-item-${note.id}`);
      expect(item).toHaveTextContent(NOTE_LABEL);
      expect(item).toHaveTextContent(note.body);
      expect(item).toHaveTextContent(IT_STAFF.fullName);
    }
    expect(screen.queryByTestId(`comment-item-${comments[0].id}`)).not.toBeInTheDocument();
  });

  it("posts a note to the notes endpoint and appends it", async () => {
    const api = await openDetail(fakeApi(staffRoutes(staffTicket(), comments, [])));
    const posted = entry("n0000000-0000-4000-8000-000000000009", "Checked the charger.", asAuthor(IT_STAFF));
    api.routes[`POST /tickets/${TICKET_ID}/notes`] = created(posted);

    await userEvent.click(screen.getByTestId("tab-notes"));
    expect(screen.getByTestId("tab-notes")).toHaveTextContent("Internal Notes (0)");
    expect(screen.getByText("No internal notes yet.")).toBeInTheDocument();
    await userEvent.type(screen.getByTestId("field-note-body"), "Checked the charger.");
    await userEvent.click(screen.getByTestId("btn-post-note"));

    expect(await screen.findByTestId(`note-item-${posted.id}`)).toHaveTextContent("Checked the charger.");
    expect(api.callsTo("POST", `/tickets/${TICKET_ID}/notes`)[0].body).toEqual({ body: "Checked the charger." });
    expect(api.callsTo("POST", `/tickets/${TICKET_ID}/comments`)).toHaveLength(0);
    expect(screen.getByTestId("field-note-body")).toHaveValue("");
  });

  it("posts a comment to the comments endpoint and appends it", async () => {
    const api = await openDetail(fakeApi(staffRoutes(staffTicket(), [], notes)));
    const posted = entry("c0000000-0000-4000-8000-000000000009", "Try the spare charger.", asAuthor(IT_STAFF));
    api.routes[`POST /tickets/${TICKET_ID}/comments`] = created(posted);

    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    await userEvent.type(screen.getByTestId("field-comment-body"), "Try the spare charger.");
    await userEvent.click(screen.getByTestId("btn-post-comment"));

    expect(await screen.findByTestId(`comment-item-${posted.id}`)).toHaveTextContent("Try the spare charger.");
    expect(api.callsTo("POST", `/tickets/${TICKET_ID}/notes`)).toHaveLength(0);
  });

  it("blocks an empty body without a request", async () => {
    const api = await openDetail(fakeApi(staffRoutes()));

    await userEvent.type(screen.getByTestId("field-comment-body"), "   ");
    await userEvent.click(screen.getByTestId("btn-post-comment"));

    expect(screen.getByText("Write something before posting.")).toBeInTheDocument();
    expect(api.writes()).toHaveLength(0);
  });

  it("replaces both composers on a CLOSED ticket", async () => {
    await openDetail(fakeApi(staffRoutes(staffTicket({ currentStatus: "CLOSED", availableTransitions: ["REOPENED"] }), comments, notes)));
    const closedText = "This ticket is closed. Reopen it to add comments or notes.";

    expect(screen.queryByTestId("field-comment-body")).not.toBeInTheDocument();
    expect(screen.getByText(closedText)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("tab-notes"));
    expect(screen.queryByTestId("field-note-body")).not.toBeInTheDocument();
    expect(screen.getByText(closedText)).toBeInTheDocument();
  });
});

describe("UI-33 (AC-49) - safe body rendering", () => {
  const BODY = "<script>alert(1)</script>\nline two";

  it("renders markup in comments and notes as literal text, keeping line breaks", async () => {
    const comment = entry("c0000000-0000-4000-8000-000000000003", BODY);
    const note = entry("n0000000-0000-4000-8000-000000000003", BODY);
    await openDetail(fakeApi(staffRoutes(staffTicket(), [comment], [note])));

    const commentItem = screen.getByTestId(`comment-item-${comment.id}`);
    expect(commentItem.textContent).toContain(BODY);
    expect(document.querySelectorAll("script")).toHaveLength(0);
    const commentBody = within(commentItem).getByText((_, el) => el?.textContent === BODY && el.children.length === 0);
    expect(commentBody.className).toMatch(/zg-preserve-lines/);

    await userEvent.click(screen.getByTestId("tab-notes"));
    const noteItem = screen.getByTestId(`note-item-${note.id}`);
    expect(noteItem.textContent).toContain(BODY);
    expect(document.querySelectorAll("script")).toHaveLength(0);
    const noteBody = within(noteItem).getByText((_, el) => el?.textContent === BODY && el.children.length === 0);
    expect(noteBody.className).toMatch(/zg-preserve-lines/);
  });
});

describe("UI-34 (AC-34) - staff attachments read-only", () => {
  it("offers Download and nothing that changes attachments", async () => {
    await openDetail(fakeApi(staffRoutes(staffTicket({ attachments: [ACTIVE_ATTACHMENT, REMOVED_ATTACHMENT] }))));

    const section = screen.getByTestId("attachment-section");
    const downloads = within(section).getAllByTestId("btn-download");
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toHaveAttribute("href", `/api/v1/attachments/${ACTIVE_ATTACHMENT.id}/download`);
    expect(within(section).getByTestId(`attachment-row-${REMOVED_ATTACHMENT.id}`)).toHaveTextContent("Removed");

    expect(screen.queryByTestId("field-attachments")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-remove")).not.toBeInTheDocument();
    expect(section.querySelector(".zg-dropzone")).toBeNull();
    expect(section).not.toHaveTextContent(/add an attachment/i);
  });
});
