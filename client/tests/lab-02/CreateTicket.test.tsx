import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RequesterProvider } from "../../src/lab-02/RequesterContext.js";
import { CreateTicket } from "../../src/lab-02/screens/CreateTicket.js";
import { AttachmentSelection, type SelectedFile } from "../../src/lab-02/components/AttachmentSelection.js";
import * as api from "../../src/lab-02/api.js";

// UI-10 .. UI-15 from docs/lab-02/tests.md section 2.3.
//
// Every expected value is a constant declared here. Nothing reads its
// expectation back out of the component or the mocked API.

const ALICE = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  fullName: "Napat Chaiwong",
  email: "napat.cha@kmutt.ac.th",
};

const CATEGORIES = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];

const SYSTEMS = [
  { id: 5, name: "Corporate Laptop" },
  { id: 6, name: "Email" },
];

const VALID_SUMMARY = "Laptop battery drains within one hour";
const VALID_DESCRIPTION =
  "Since the last Windows update the battery drops from full to nearly empty in about an hour.";

const SELECTED_KEY = "toktickit.selectedRequester";

function renderScreen() {
  return render(
    <RequesterProvider>
      <MemoryRouter initialEntries={["/tickets/new"]}>
        <CreateTicket />
      </MemoryRouter>
    </RequesterProvider>,
  );
}

// userEvent is set up with delay: null throughout. Its default inter-keystroke
// delay makes typing a 90-character Description take seconds in jsdom, which
// put these tests close enough to the 5s timeout to pass or fail by timing.
// A test that depends on machine speed is a flaky test.
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByTestId("field-category"), String(CATEGORIES[1].id));
  await user.selectOptions(screen.getByTestId("field-related-system"), String(SYSTEMS[0].id));
  await user.selectOptions(screen.getByTestId("field-priority"), "HIGH");
  await user.type(screen.getByTestId("field-summary"), VALID_SUMMARY);
  await user.type(screen.getByTestId("field-description"), VALID_DESCRIPTION);
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ALICE));
  vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("CreateTicket (UI-10 - AC-11)", () => {
  it("populates Category and Related System from the API, with nothing extra", async () => {
    renderScreen();

    const category = await screen.findByTestId("field-category");
    await waitFor(() =>
      expect(category.querySelectorAll("option").length).toBe(CATEGORIES.length + 1),
    );

    // Exact match including count: a component carrying a hard-coded fallback
    // list alongside the API call would show more options than the API
    // returned, so this fails rather than passing on a superset.
    const categoryNames = Array.from(category.querySelectorAll("option"))
      .map((o) => o.textContent ?? "")
      .filter((t) => !t.startsWith("Select"));
    expect(categoryNames).toEqual(["Account and Access", "Hardware"]);

    const systemNames = Array.from(
      screen.getByTestId("field-related-system").querySelectorAll("option"),
    )
      .map((o) => o.textContent ?? "")
      .filter((t) => !t.startsWith("Select"));
    expect(systemNames).toEqual(["Corporate Laptop", "Email"]);
  });

  it("shows the read-only system fields populated from context", async () => {
    renderScreen();

    await screen.findByTestId("field-category");
    expect(screen.getByTestId("field-ticket-number")).toHaveValue(
      "Will be generated on submission",
    );
    expect(screen.getByTestId("field-requester")).toHaveValue("Napat Chaiwong");
    for (const id of ["field-ticket-number", "field-ticket-date", "field-requester"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("readonly");
    }
  });
});

describe("CreateTicket (UI-11 - AC-12)", () => {
  it("blocks submission with an empty Summary and sends no create request", async () => {
    const create = vi.spyOn(api, "createTicket");
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await user.click(screen.getByTestId("btn-submit-ticket"));

    expect(await screen.findByTestId("error-summary")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("renders the Summary message adjacent to the Summary field", async () => {
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await user.click(screen.getByTestId("btn-submit-ticket"));

    const field = await screen.findByTestId("field-summary");
    const message = screen.getByTestId("error-summary");
    expect(field.getAttribute("aria-describedby")).toBe(message.id);
    expect(field).toHaveAttribute("aria-invalid", "true");
  });
});

describe("CreateTicket (UI-12 - AC-14)", () => {
  it("renders a message beside every failing field, not one summary at the top", async () => {
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await user.click(screen.getByTestId("btn-submit-ticket"));

    for (const field of ["category", "related-system", "priority", "summary", "description"]) {
      const message = await screen.findByTestId(`error-${field}`);
      expect(message, `${field} must report its own message`).toBeInTheDocument();
      expect(screen.getByTestId(`field-${field}`)).toHaveAttribute("aria-invalid", "true");
    }
  });

  it("moves focus to the first failing field", async () => {
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await user.click(screen.getByTestId("btn-submit-ticket"));

    await waitFor(() => expect(screen.getByTestId("field-category")).toHaveFocus());
  });
});

describe("CreateTicket (UI-13 - AC-15)", () => {
  it("disables Submit while a creation is in flight and issues no second request", async () => {
    let release: (v: api.Ticket) => void = () => {};
    const create = vi
      .spyOn(api, "createTicket")
      .mockReturnValue(new Promise((resolve) => {
        release = resolve;
      }));
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await fillValidForm(user);

    await user.click(screen.getByTestId("btn-submit-ticket"));

    const submit = screen.getByTestId("btn-submit-ticket");
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(submit).toHaveTextContent(/submitting/i);

    await user.click(submit);
    expect(create).toHaveBeenCalledTimes(1);

    release({
      id: "t1",
      ticketNumber: "TKT-2026-00042",
      ticketDate: "2026-09-04T00:00:00.000Z",
      requester: { id: ALICE.id, fullName: ALICE.fullName },
      category: CATEGORIES[1],
      relatedSystem: SYSTEMS[0],
      summary: VALID_SUMMARY,
      requestedPriority: "HIGH",
      description: VALID_DESCRIPTION,
      currentStatus: "NEW",
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    await screen.findByTestId("state-created");
  });
});

describe("CreateTicket (UI-14 - AC-16)", () => {
  it("keeps every entered value and re-enables Submit after a failed creation", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(new Error("Network request failed"));
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await fillValidForm(user);
    await user.click(screen.getByTestId("btn-submit-ticket"));

    expect(await screen.findByTestId("state-create-failed")).toBeInTheDocument();

    expect(screen.getByTestId("field-summary")).toHaveValue(VALID_SUMMARY);
    expect(screen.getByTestId("field-description")).toHaveValue(VALID_DESCRIPTION);
    expect(screen.getByTestId("field-category")).toHaveValue(String(CATEGORIES[1].id));
    expect(screen.getByTestId("field-related-system")).toHaveValue(String(SYSTEMS[0].id));
    expect(screen.getByTestId("field-priority")).toHaveValue("HIGH");
    expect(screen.getByTestId("btn-submit-ticket")).toBeEnabled();

    // BR-28: the thrown error must not reach the page.
    expect(document.body.textContent ?? "").not.toMatch(/Network request failed/);
  });
});

describe("CreateTicket (UI-15 - AC-07)", () => {
  it("replaces the form with a success panel showing the Ticket Number and next actions", async () => {
    vi.spyOn(api, "createTicket").mockResolvedValue({
      id: "t1",
      ticketNumber: "TKT-2026-00042",
      ticketDate: "2026-09-04T00:00:00.000Z",
      requester: { id: ALICE.id, fullName: ALICE.fullName },
      category: CATEGORIES[1],
      relatedSystem: SYSTEMS[0],
      summary: VALID_SUMMARY,
      requestedPriority: "HIGH",
      description: VALID_DESCRIPTION,
      currentStatus: "NEW",
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await fillValidForm(user);
    await user.click(screen.getByTestId("btn-submit-ticket"));

    const panel = await screen.findByTestId("state-created");
    expect(panel).toHaveTextContent("Ticket created");
    expect(panel).toHaveTextContent("TKT-2026-00042");

    expect(screen.getByTestId("btn-view-ticket")).toBeInTheDocument();
    expect(screen.getByTestId("btn-create-another")).toBeInTheDocument();

    // The card is replaced, not merely annotated (ui-spec 5.2).
    expect(screen.queryByTestId("field-summary")).not.toBeInTheDocument();
  });

  it("returns to an empty form on Create Another", async () => {
    vi.spyOn(api, "createTicket").mockResolvedValue({
      id: "t1",
      ticketNumber: "TKT-2026-00042",
      ticketDate: "2026-09-04T00:00:00.000Z",
      requester: { id: ALICE.id, fullName: ALICE.fullName },
      category: CATEGORIES[1],
      relatedSystem: SYSTEMS[0],
      summary: VALID_SUMMARY,
      requestedPriority: "HIGH",
      description: VALID_DESCRIPTION,
      currentStatus: "NEW",
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await fillValidForm(user);
    await user.click(screen.getByTestId("btn-submit-ticket"));
    await screen.findByTestId("state-created");

    await user.click(screen.getByTestId("btn-create-another"));

    expect(await screen.findByTestId("field-summary")).toHaveValue("");
    expect(screen.getByTestId("field-description")).toHaveValue("");
  });
});

describe("CreateTicket (UI-30 - AC-17)", () => {
  // AC-17 is selection-time validation on the Create Ticket screen. Selection
  // is available again now that #18 serves the upload endpoint, so the rule is
  // exercised through the component that owns it.
  it("accepts a permitted file and rejects an impermissible one with a reason", async () => {
    const user = userEvent.setup({ delay: null });
    let current: SelectedFile[] = [];

    render(<AttachmentSelection files={[]} onChange={(next) => { current = next; }} uploadAvailable />);

    const good = new File(["png bytes"], "screenshot.png", { type: "image/png" });
    const bad = new File(["exe bytes"], "payload.exe", { type: "application/x-msdownload" });
    await user.upload(screen.getByTestId("field-attachments"), [good, bad]);

    expect(current).toHaveLength(2);
    expect(current[0].file.name).toBe("screenshot.png");
    expect(current[0].error).toBeNull();
    expect(current[1].file.name).toBe("payload.exe");
    expect(current[1].error).toMatch(/type not permitted/i);
  });

  it("rejects a file over 5 MB with a reason naming the size", async () => {
    const user = userEvent.setup({ delay: null });
    let current: SelectedFile[] = [];

    render(<AttachmentSelection files={[]} onChange={(next) => { current = next; }} uploadAvailable />);

    const oversized = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], "scan.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByTestId("field-attachments"), oversized);

    expect(current[0].error).toMatch(/exceeds 5 MB/i);
  });

  it("keeps a rejected file visible rather than discarding it", async () => {
    const rejected: SelectedFile[] = [
      {
        file: new File(["x"], "payload.exe", { type: "application/x-msdownload" }),
        error: "File type not permitted",
      },
    ];

    render(<AttachmentSelection files={rejected} onChange={vi.fn()} uploadAvailable />);

    expect(screen.getByTestId("attachment-row-invalid")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-error")).toHaveTextContent("File type not permitted");
  });
});

describe("CreateTicket (UI-16 - AC-38)", () => {
  const TICKET = {
    id: "t1",
    ticketNumber: "TKT-2026-00042",
    ticketDate: "2026-09-04T00:00:00.000Z",
    requester: { id: ALICE.id, fullName: ALICE.fullName },
    category: CATEGORIES[1],
    relatedSystem: SYSTEMS[0],
    summary: VALID_SUMMARY,
    requestedPriority: "HIGH",
    description: VALID_DESCRIPTION,
    currentStatus: "NEW",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };

  it("keeps the Ticket, names each failed attachment, and directs the retry", async () => {
    vi.spyOn(api, "createTicket").mockResolvedValue(TICKET);
    vi.spyOn(api, "uploadAttachment")
      .mockResolvedValueOnce({
        id: "ok-1",
        ticketId: TICKET.id,
        originalFilename: "good.png",
        mimeType: "image/png",
        sizeBytes: 10,
        uploadedAt: "2026-09-04T00:00:00.000Z",
        status: "ACTIVE",
        removedAt: null,
        removedReason: null,
      })
      .mockRejectedValueOnce(new api.AttachmentUploadError("FAILED"));
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await fillValidForm(user);

    await user.upload(screen.getByTestId("field-attachments"), [
      new File(["a"], "good.png", { type: "image/png" }),
      new File(["b"], "doomed.png", { type: "image/png" }),
    ]);
    await user.click(screen.getByTestId("btn-submit-ticket"));

    // The Ticket is never rolled back because an attachment failed: the
    // problem report has value on its own (BR-42, AC-38).
    const panel = await screen.findByTestId("state-created");
    expect(panel).toHaveTextContent("TKT-2026-00042");

    const partial = await screen.findByTestId("state-partial-success");
    expect(partial).toHaveTextContent("doomed.png");
    expect(partial).not.toHaveTextContent("good.png");
    expect(partial).toHaveTextContent(/retry these attachments from ticket detail/i);
  });

  it("shows no partial-success warning when every attachment succeeds", async () => {
    vi.spyOn(api, "createTicket").mockResolvedValue(TICKET);
    vi.spyOn(api, "uploadAttachment").mockResolvedValue({
      id: "ok-1",
      ticketId: TICKET.id,
      originalFilename: "good.png",
      mimeType: "image/png",
      sizeBytes: 10,
      uploadedAt: "2026-09-04T00:00:00.000Z",
      status: "ACTIVE",
      removedAt: null,
      removedReason: null,
    });
    const user = userEvent.setup({ delay: null });

    renderScreen();
    await screen.findByTestId("field-category");
    await fillValidForm(user);
    await user.upload(
      screen.getByTestId("field-attachments"),
      new File(["a"], "good.png", { type: "image/png" }),
    );
    await user.click(screen.getByTestId("btn-submit-ticket"));

    await screen.findByTestId("state-created");
    expect(screen.queryByTestId("state-partial-success")).not.toBeInTheDocument();
  });
});
