import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IT_STAFF } from "../lab-03/helpers.js";
import { ASSIGNEES, failure } from "../lab-03/ticket-fixtures.js";
import {
  ACTIONS,
  ACTION_AT,
  ACTION_AT_TEXT,
  ARISA,
  CREATE_ACTION,
  NATTAPONG_INACTIVE,
  STAFF_DETAIL,
  UUID,
  WICHAI,
  action,
  actionId,
  actionSaved,
  deferred,
  invalid,
  openRequesterDetail,
  openStaffDetail,
  patchAction,
  requesterRoutes4,
  staffRoutes4,
  staffTicket4,
  useMobileLayout,
} from "./action-fixtures.js";

// UI-08 to UI-15 from docs/lab-04/tests.md section 2.7: the Actions Taken card
// and its Create and Edit dialogs (ui-spec.md section 4), with the API faked at
// fetch() so the screens are held to the api-spec section 2 contract.

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const card = () => screen.getByTestId("actions-card");
const dialog = () => screen.getByTestId("action-dialog");

async function openCreateDialog() {
  await userEvent.click(within(card()).getByTestId("btn-record-action"));
  return screen.findByTestId("action-dialog");
}

async function openEditDialog(id: string) {
  await userEvent.click(within(card()).getByTestId(`btn-edit-action-${id}`));
  return screen.findByTestId("action-dialog");
}

const optionValues = (select: HTMLElement) =>
  Array.from((select as HTMLSelectElement).options).map((option) => option.value);

describe("UI-08 (AC-02, AC-10) - the actions list", () => {
  const first = action(actionId(1), { description: "First: checked the battery report.", status: "COMPLETED", result: "Battery health is 61 percent." });
  const second = action(actionId(2), {
    description: "Second: ordered a replacement battery.",
    status: "IN_PROGRESS",
    performedBy: ARISA,
    createdBy: WICHAI,
    followUpRequired: true,
    followUpNote: "Fit the battery once it arrives.",
  });
  const third = action(actionId(3), { description: "Third: asked the old performer.", performedBy: NATTAPONG_INACTIVE, createdBy: NATTAPONG_INACTIVE });
  const summary = { total: 3, open: 2, outstandingFollowUps: 1 };

  it("lists the actions in the order the server gave, with the summary line", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4({ actionSummary: summary }), [first, second, third]));

    const rows = within(card()).getAllByTestId(/^action-row-/);
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      `action-row-${first.id}`,
      `action-row-${second.id}`,
      `action-row-${third.id}`,
    ]);
    expect(screen.getByTestId("actions-summary")).toHaveTextContent("3 actions · 2 open · 1 follow-ups outstanding");
  });

  it("shows the date in Bangkok time with the ISO value in <time datetime>", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), [first]));

    const time = within(screen.getByTestId(`action-row-${first.id}`)).getByText(ACTION_AT_TEXT);
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", ACTION_AT);
  });

  it("abbreviates every month to three letters, so September reads Sep, not Sept", async () => {
    // en-GB in current ICU writes "Sept"; ui-spec 4.2 uses "29 Oct 2026, 10:15".
    const september = action(actionId(1), { actionAt: "2026-09-24T03:00:00.000Z" });
    await openStaffDetail(staffRoutes4(staffTicket4(), [september]));

    const time = within(screen.getByTestId(`action-row-${september.id}`)).getByText("24 Sep 2026, 10:00");
    expect(time.tagName).toBe("TIME");
  });

  it("marks an inactive performer and names the recorder when it is someone else", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), [first, second, third]));

    const delegated = screen.getByTestId(`action-row-${second.id}`);
    expect(delegated).toHaveTextContent(ARISA.fullName);
    expect(delegated).toHaveTextContent(`Recorded by ${WICHAI.fullName}`);

    const inactive = screen.getByTestId(`action-row-${third.id}`);
    const suffix = within(inactive).getByText("(inactive)");
    expect(suffix).toHaveClass("zg-muted");
    expect(inactive).not.toHaveTextContent("Recorded by");

    expect(screen.getByTestId(`action-row-${first.id}`)).not.toHaveTextContent("Recorded by");
  });

  it("shows the follow-up indicator with its note, or a dash", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), [first, second]));

    const flagged = screen.getByTestId(`action-row-${second.id}`);
    expect(within(flagged).getByTestId("indicator-follow-up")).toHaveTextContent("⚑ Follow-up required");
    expect(flagged).toHaveTextContent("Fit the battery once it arrives.");
    expect(within(screen.getByTestId(`action-row-${first.id}`)).queryByTestId("indicator-follow-up")).not.toBeInTheDocument();
  });

  it("shows one card per action instead of a table on mobile", async () => {
    const restore = useMobileLayout();
    try {
      await openStaffDetail(staffRoutes4(staffTicket4(), [first, second]));
      expect(within(card()).queryByRole("table")).not.toBeInTheDocument();
      const cards = within(card()).getAllByTestId(/^action-card-/);
      expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([`action-card-${first.id}`, `action-card-${second.id}`]);
      // The card shows everything, including the result (ui-spec 4.2).
      expect(cards[0]).toHaveTextContent("Battery health is 61 percent.");
    } finally {
      restore();
    }
  });

  it("says so when no action has been recorded", async () => {
    await openStaffDetail(staffRoutes4());
    expect(screen.getByTestId("actions-empty")).toHaveTextContent("No actions have been recorded yet.");
    expect(within(card()).getByTestId("btn-record-action")).toHaveClass("zg-btn--secondary");
  });
});

describe("UI-09 (AC-01, AC-20) - the Create dialog", () => {
  it("defaults Performed by to the signed-in user and Status to Planned", async () => {
    await openStaffDetail(staffRoutes4());
    await openCreateDialog();

    expect(screen.getByTestId("field-action-performer")).toHaveValue(IT_STAFF.id);
    expect(optionValues(screen.getByTestId("field-action-performer"))).toEqual(expect.arrayContaining(ASSIGNEES.map((a) => a.id)));
    expect(screen.getByTestId("field-action-status")).toHaveValue("PLANNED");
    expect(optionValues(screen.getByTestId("field-action-status"))).toEqual(["PLANNED", "IN_PROGRESS", "COMPLETED"]);
    expect(dialog()).toHaveAttribute("role", "dialog");
  });

  it("sends exactly one POST for a double click on Save, with a UUID clientRequestId", async () => {
    const api = await openStaffDetail(staffRoutes4());
    const reply = deferred<ReturnType<typeof actionSaved>>();
    api.routes[`POST ${CREATE_ACTION}`] = () => reply.promise;
    await openCreateDialog();
    await userEvent.type(screen.getByTestId("field-action-description"), "Replaced the battery.");

    const save = screen.getByTestId("btn-save-action");
    await userEvent.dblClick(save);
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Saving…");

    reply.resolve(actionSaved(201, action(actionId(1), { description: "Replaced the battery." }), 5));
    await waitFor(() => expect(screen.queryByTestId("action-dialog")).not.toBeInTheDocument());

    const posts = api.callsTo("POST", CREATE_ACTION);
    expect(posts).toHaveLength(1);
    const body = posts[0].body as Record<string, unknown>;
    expect(body.clientRequestId).toMatch(UUID);
    expect(body).toMatchObject({ description: "Replaced the battery.", status: "PLANNED", performedById: IT_STAFF.id, followUpRequired: false });
    expect(typeof body.actionAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.actionAt as string))).toBe(false);
  });

  it("reuses the same clientRequestId when Save is retried after a failure, keeping the input", async () => {
    const api = await openStaffDetail(staffRoutes4());
    api.routes[`POST ${CREATE_ACTION}`] = failure(500, "INTERNAL_ERROR", "Database exploded at db.ts:12");
    await openCreateDialog();
    await userEvent.type(screen.getByTestId("field-action-description"), "Replaced the battery.");
    await userEvent.click(screen.getByTestId("btn-save-action"));

    const error = await within(dialog()).findByTestId("callout-action-error");
    expect(error).toHaveTextContent("We couldn't save the action. Your input is kept; please try again.");
    expect(document.body.textContent).not.toMatch(/\b500\b|db\.ts|INTERNAL_ERROR/);
    expect(screen.getByTestId("field-action-description")).toHaveValue("Replaced the battery.");

    api.routes[`POST ${CREATE_ACTION}`] = actionSaved(201, action(actionId(1)), 5);
    await userEvent.click(screen.getByTestId("btn-save-action"));
    await waitFor(() => expect(screen.queryByTestId("action-dialog")).not.toBeInTheDocument());

    const [firstTry, retry] = api.callsTo("POST", CREATE_ACTION).map((c) => (c.body as { clientRequestId: string }).clientRequestId);
    expect(retry).toBe(firstTry);
  });

  it("uses a new clientRequestId for a new dialog", async () => {
    const api = await openStaffDetail(staffRoutes4());
    api.routes[`POST ${CREATE_ACTION}`] = actionSaved(201, action(actionId(1)), 5);
    for (const text of ["First piece of work.", "Second piece of work."]) {
      await openCreateDialog();
      await userEvent.type(screen.getByTestId("field-action-description"), text);
      await userEvent.click(screen.getByTestId("btn-save-action"));
      await waitFor(() => expect(screen.queryByTestId("action-dialog")).not.toBeInTheDocument());
    }
    const ids = api.callsTo("POST", CREATE_ACTION).map((c) => (c.body as { clientRequestId: string }).clientRequestId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("on success closes the dialog, says Action saved., and re-fetches the detail and the actions", async () => {
    const api = await openStaffDetail(staffRoutes4());
    api.routes[`POST ${CREATE_ACTION}`] = actionSaved(201, action(actionId(1)), 5);
    const detailGets = api.callsTo("GET", STAFF_DETAIL).length;
    const actionGets = api.callsTo("GET", ACTIONS).length;
    const opener = within(card()).getByTestId("btn-record-action");

    await openCreateDialog();
    await userEvent.type(screen.getByTestId("field-action-description"), "Replaced the battery.");
    await userEvent.click(screen.getByTestId("btn-save-action"));

    const saved = await within(card()).findByTestId("callout-success");
    expect(saved).toHaveTextContent("Action saved.");
    expect(saved).toHaveAttribute("role", "status");
    await waitFor(() => expect(api.callsTo("GET", STAFF_DETAIL).length).toBeGreaterThan(detailGets));
    await waitFor(() => expect(api.callsTo("GET", ACTIONS).length).toBeGreaterThan(actionGets));
    // Focus returns to the opener, or the card heading if the opener is gone.
    const heading = within(card()).getByRole("heading", { name: "Actions Taken" });
    expect([opener, heading, within(card()).queryByTestId("btn-record-action")]).toContain(document.activeElement);
  });
});

describe("UI-10 (AC-05) - follow-up note and validation", () => {
  it("shows the follow-up note only while the box is ticked, as required, without moving focus", async () => {
    await openStaffDetail(staffRoutes4());
    await openCreateDialog();
    expect(screen.queryByTestId("field-follow-up-note")).not.toBeInTheDocument();

    const box = screen.getByTestId("field-follow-up-required");
    await userEvent.click(box);
    const note = screen.getByTestId("field-follow-up-note");
    expect(note).toHaveAttribute("aria-required", "true");
    expect(box).toHaveFocus();

    await userEvent.click(box);
    expect(screen.queryByTestId("field-follow-up-note")).not.toBeInTheDocument();
  });

  it("puts 422 messages under their fields, focuses the first, and keeps the input", async () => {
    const api = await openStaffDetail(staffRoutes4());
    api.routes[`POST ${CREATE_ACTION}`] = invalid({
      followUpNote: "Describe the follow-up that is needed (5–1000 characters).",
      description: "Describe the work in 5–2000 characters.",
    });
    await openCreateDialog();
    await userEvent.type(screen.getByTestId("field-action-description"), "Fix");
    await userEvent.click(screen.getByTestId("field-follow-up-required"));
    await userEvent.type(screen.getByTestId("field-follow-up-note"), "Soon");
    await userEvent.click(screen.getByTestId("btn-save-action"));

    const description = screen.getByTestId("field-action-description");
    await waitFor(() => expect(description).toHaveFocus());
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(description.getAttribute("aria-describedby")!.split(" ").find((id) => id.endsWith("-error"))!)).toHaveTextContent(
      "Describe the work in 5–2000 characters.",
    );
    const note = screen.getByTestId("field-follow-up-note");
    expect(note).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog()).getByText("Describe the follow-up that is needed (5–1000 characters).")).toBeInTheDocument();

    expect(description).toHaveValue("Fix");
    expect(note).toHaveValue("Soon");
    expect(screen.getByTestId("field-follow-up-required")).toBeChecked();
  });

  it("shows character counters for the text fields", async () => {
    await openStaffDetail(staffRoutes4());
    await openCreateDialog();
    await userEvent.type(screen.getByTestId("field-action-description"), "Fixed");
    expect(within(dialog()).getByText("5/2000")).toBeInTheDocument();
    expect(within(dialog()).getByText("0/500")).toBeInTheDocument();
  });
});

describe("UI-11 (AC-07, AC-08) - the Edit dialog follows BR-15 and BR-16", () => {
  const planned = action(actionId(1), { status: "PLANNED", version: 3 });
  const inProgress = action(actionId(2), { status: "IN_PROGRESS" });
  const completed = action(actionId(3), { status: "COMPLETED", result: "Done.", performedBy: ARISA });
  const cancelled = action(actionId(4), { status: "CANCELLED", result: "No longer needed." });
  const all = [planned, inProgress, completed, cancelled];

  it("offers PLANNED the current status and its three targets", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), all));
    await openEditDialog(planned.id);
    expect(optionValues(screen.getByTestId("field-action-status"))).toEqual(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
    expect(screen.getByTestId("field-action-status")).toHaveValue("PLANNED");
    expect(screen.getByTestId("field-action-performer").tagName).toBe("SELECT");
  });

  it("offers IN_PROGRESS the current status, Completed, and Cancelled", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), all));
    await openEditDialog(inProgress.id);
    expect(optionValues(screen.getByTestId("field-action-status"))).toEqual(["IN_PROGRESS", "COMPLETED", "CANCELLED"]);
  });

  it("shows status and performer read-only on a COMPLETED action", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), all));
    await openEditDialog(completed.id);
    const status = screen.getByTestId("field-action-status");
    expect(status.tagName).not.toBe("SELECT");
    expect(status).toHaveTextContent("Completed");
    const performer = screen.getByTestId("field-action-performer");
    expect(performer.tagName).not.toBe("SELECT");
    expect(performer).toHaveTextContent(ARISA.fullName);
    expect(screen.getByTestId("field-action-description")).toBeEnabled();
  });

  it("gives a CANCELLED action no Edit button", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), all));
    for (const editable of [planned, inProgress, completed]) {
      expect(screen.getByTestId(`btn-edit-action-${editable.id}`)).toHaveClass("zg-btn--secondary");
    }
    expect(screen.queryByTestId(`btn-edit-action-${cancelled.id}`)).not.toBeInTheDocument();
  });

  it("choosing Cancelled asks for a reason, warns, and makes Save destructive", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), all));
    await openEditDialog(planned.id);
    expect(within(dialog()).queryByText("Cancelled actions cannot be edited again.")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId("field-action-status"), "CANCELLED");

    expect(within(dialog()).getByText("Cancelled actions cannot be edited again.")).toBeInTheDocument();
    expect(screen.getByTestId("btn-save-action")).toHaveClass("zg-btn--destructive");
    expect(screen.getByLabelText(/Reason for cancelling/)).toBe(screen.getByTestId("field-action-result"));
  });

  it("labels Result as required when completing", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4(), all));
    await openEditDialog(inProgress.id);
    await userEvent.selectOptions(screen.getByTestId("field-action-status"), "COMPLETED");
    expect(screen.getByLabelText(/Result \(required\)/)).toBe(screen.getByTestId("field-action-result"));
  });

  it("sends only the changed fields with the action's version", async () => {
    const api = await openStaffDetail(staffRoutes4(staffTicket4(), all));
    api.routes[`PATCH ${patchAction(planned.id)}`] = actionSaved(200, { ...planned, status: "IN_PROGRESS", version: 4 }, 6);
    await openEditDialog(planned.id);
    expect(screen.getByTestId("btn-save-action")).toHaveTextContent("Save changes");
    await userEvent.selectOptions(screen.getByTestId("field-action-status"), "IN_PROGRESS");
    await userEvent.click(screen.getByTestId("btn-save-action"));

    await waitFor(() => expect(api.callsTo("PATCH", patchAction(planned.id))).toHaveLength(1));
    expect(api.callsTo("PATCH", patchAction(planned.id))[0].body).toEqual({ version: 3, status: "IN_PROGRESS" });
  });
});

describe("UI-12 (AC-21) - a conflict keeps the input and offers Reload ticket", () => {
  const planned = action(actionId(1), { description: "Original description.", version: 2 });
  const STALE = "This action was changed by someone else. Reload to see the latest version.";

  it("shows STALE_UPDATE in the dialog, keeps the input, and reloads the latest version after confirmation", async () => {
    const api = await openStaffDetail(staffRoutes4(staffTicket4(), [planned]));
    api.routes[`PATCH ${patchAction(planned.id)}`] = failure(409, "STALE_UPDATE", STALE);
    await openEditDialog(planned.id);
    const description = screen.getByTestId("field-action-description");
    await userEvent.clear(description);
    await userEvent.type(description, "My edited description.");
    await userEvent.click(screen.getByTestId("btn-save-action"));

    const conflict = await within(dialog()).findByTestId("callout-conflict");
    expect(conflict).toHaveTextContent(STALE);
    expect(conflict).toHaveAttribute("role", "alert");
    expect(description).toHaveValue("My edited description.");

    const latest = { ...planned, description: "Someone else's description.", version: 3 };
    api.routes[`GET ${ACTIONS}`] = { status: 200, body: { data: [latest] } };
    const detailGets = api.callsTo("GET", STAFF_DETAIL).length;
    await userEvent.click(within(dialog()).getByTestId("btn-reload-ticket"));

    // Edit mode asks before the user's changes are discarded (ui-spec 4.4).
    expect(within(dialog()).getByText("Discard your changes and load the latest version?")).toBeInTheDocument();
    expect(description).toHaveValue("My edited description.");
    await userEvent.click(within(dialog()).getByTestId("btn-confirm-reload"));

    await waitFor(() => expect(screen.getByTestId("field-action-description")).toHaveValue("Someone else's description."));
    expect(api.callsTo("GET", STAFF_DETAIL).length).toBeGreaterThan(detailGets);
    expect(screen.getByTestId("action-dialog")).toBeInTheDocument();
  });

  it("sends the reloaded action's version on the next save", async () => {
    const api = await openStaffDetail(staffRoutes4(staffTicket4(), [planned]));
    api.routes[`PATCH ${patchAction(planned.id)}`] = failure(409, "STALE_UPDATE", STALE);
    await openEditDialog(planned.id);
    await userEvent.type(screen.getByTestId("field-action-description"), " More.");
    await userEvent.click(screen.getByTestId("btn-save-action"));
    await within(dialog()).findByTestId("callout-conflict");

    api.routes[`GET ${ACTIONS}`] = { status: 200, body: { data: [{ ...planned, version: 3 }] } };
    await userEvent.click(within(dialog()).getByTestId("btn-reload-ticket"));
    await userEvent.click(within(dialog()).getByTestId("btn-confirm-reload"));
    await waitFor(() => expect(within(dialog()).queryByTestId("callout-conflict")).not.toBeInTheDocument());

    api.routes[`PATCH ${patchAction(planned.id)}`] = actionSaved(200, { ...planned, version: 4 }, 7);
    await userEvent.type(screen.getByTestId("field-action-description"), " Again.");
    await userEvent.click(screen.getByTestId("btn-save-action"));
    await waitFor(() => expect(api.callsTo("PATCH", patchAction(planned.id))).toHaveLength(2));
    expect((api.callsTo("PATCH", patchAction(planned.id))[1].body as { version: number }).version).toBe(3);
  });

  it("shows a create-mode conflict with the server message; Reload re-fetches without asking", async () => {
    const api = await openStaffDetail(staffRoutes4());
    const message = "Actions can only be recorded on an open ticket. Claim or reopen it first.";
    api.routes[`POST ${CREATE_ACTION}`] = failure(409, "TICKET_STATE_CONFLICT", message);
    await openCreateDialog();
    await userEvent.type(screen.getByTestId("field-action-description"), "Replaced the battery.");
    await userEvent.click(screen.getByTestId("btn-save-action"));

    expect(await within(dialog()).findByTestId("callout-conflict")).toHaveTextContent(message);
    const detailGets = api.callsTo("GET", STAFF_DETAIL).length;
    const actionGets = api.callsTo("GET", ACTIONS).length;
    await userEvent.click(within(dialog()).getByTestId("btn-reload-ticket"));

    await waitFor(() => expect(api.callsTo("GET", STAFF_DETAIL).length).toBeGreaterThan(detailGets));
    await waitFor(() => expect(api.callsTo("GET", ACTIONS).length).toBeGreaterThan(actionGets));
    expect(screen.getByTestId("field-action-description")).toHaveValue("Replaced the battery.");
  });
});

describe("UI-13 (AC-11) - the Requester sees the actions read-only", () => {
  it("titles the card Work done on your ticket and offers no Record or Edit button", async () => {
    const actions = [action(actionId(1), { status: "COMPLETED", result: "Battery replaced." }), action(actionId(2), { performedBy: ARISA })];
    await openRequesterDetail(requesterRoutes4(actions));

    expect(within(card()).getByRole("heading", { name: "Work done on your ticket" })).toBeInTheDocument();
    expect(within(card()).queryByRole("heading", { name: "Actions Taken" })).not.toBeInTheDocument();
    expect(within(card()).getAllByTestId(/^action-row-/)).toHaveLength(2);
    expect(screen.getByTestId("actions-summary")).toHaveTextContent("2 actions · 1 open · 0 follow-ups outstanding");
    expect(screen.queryByTestId("btn-record-action")).not.toBeInTheDocument();
    expect(document.querySelector("[data-testid^='btn-edit-action-']")).toBeNull();
  });

  it("places the card after the ticket information and before the comments", async () => {
    await openRequesterDetail(requesterRoutes4([action(actionId(1))]));
    const info = screen.getByTestId("ticket-information");
    const comments = await screen.findByTestId("comments-card");
    expect(info.compareDocumentPosition(card()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card().compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("UI-14 (AC-12) - action text is literal", () => {
  const MARKUP = "<script>alert('x')</script>\nSecond line";

  it("renders markup in the description and result as text, keeping line breaks", async () => {
    const risky = action(actionId(1), { description: MARKUP, result: MARKUP, status: "COMPLETED", attachmentNotes: "<b>bold</b>" });
    await openStaffDetail(staffRoutes4(staffTicket4(), [risky]));
    const row = screen.getByTestId(`action-row-${risky.id}`);

    const details = within(row).getByTestId(`btn-action-details-${risky.id}`);
    expect(details).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(details.getAttribute("aria-controls")!);
    expect(panel).not.toBeNull();

    expect(card().querySelector("script, b")).toBeNull();
    const texts = within(card()).getAllByText((_, el) => el?.textContent === MARKUP && el.classList.contains("zg-preserve-lines"));
    expect(texts).toHaveLength(2);
    expect(panel).toHaveTextContent("<b>bold</b>");
  });
});

describe("UI-15 (AC-09) - the ticket state locks recording", () => {
  it("replaces Record action on a NEW ticket", async () => {
    await openStaffDetail(staffRoutes4(staffTicket4({ currentStatus: "NEW", owner: null, availableTransitions: ["CANCELLED"] })));
    expect(screen.getByTestId("actions-locked-message")).toHaveTextContent("Actions can be recorded once the ticket is claimed.");
    expect(screen.queryByTestId("btn-record-action")).not.toBeInTheDocument();
  });

  it.each([
    ["RESOLVED", "Resolved"],
    ["CLOSED", "Closed"],
    ["CANCELLED", "Cancelled"],
  ])("replaces Record action and every Edit on a %s ticket", async (status, text) => {
    const actions = [action(actionId(1)), action(actionId(2), { status: "COMPLETED", result: "Done." })];
    await openStaffDetail(staffRoutes4(staffTicket4({ currentStatus: status, availableTransitions: [] }), actions));
    expect(screen.getByTestId("actions-locked-message")).toHaveTextContent(`This ticket is ${text}. Reopen it to record more work.`);
    expect(screen.queryByTestId("btn-record-action")).not.toBeInTheDocument();
    expect(document.querySelector("[data-testid^='btn-edit-action-']")).toBeNull();
  });

  it.each(["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"])("offers Record action on a %s ticket", async (status) => {
    await openStaffDetail(staffRoutes4(staffTicket4({ currentStatus: status })));
    expect(screen.getByTestId("btn-record-action")).toBeInTheDocument();
    expect(screen.queryByTestId("actions-locked-message")).not.toBeInTheDocument();
  });
});
