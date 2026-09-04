import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RequesterProvider } from "../../src/lab-02/RequesterContext.js";
import { CreateTicket } from "../../src/lab-02/screens/CreateTicket.js";
import * as api from "../../src/lab-02/api.js";

// UI style assertions -- docs/lab-02/tests.md section 2.4.
//
// ui-spec.md is binding; without assertions it is only a suggestion. This file
// currently holds the three ids #16's covering list claims. Ownership of the
// remaining STY ids is recorded in tests.md section 2.4.
//
// These three pass on arrival: the behaviour they describe was delivered with
// the screen in 83fc742, and no test covered it. They are added to close that
// gap, so the usual red-then-green order does not apply to them.

const ALICE = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  fullName: "Napat Chaiwong",
  email: "napat.cha@kmutt.ac.th",
};

const CATEGORIES = [{ id: 2, name: "Hardware" }];
const SYSTEMS = [{ id: 5, name: "Corporate Laptop" }];

const REQUIRED_FIELDS = ["category", "related-system", "priority", "summary", "description"];

function renderCreateTicket() {
  return render(
    <RequesterProvider>
      <MemoryRouter initialEntries={["/tickets/new"]}>
        <CreateTicket />
      </MemoryRouter>
    </RequesterProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.sessionStorage.setItem("toktickit.selectedRequester", JSON.stringify(ALICE));
  vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("STY-01 (AC-41) - required marker", () => {
  it("gives every required field a red asterisk hidden from assistive technology", async () => {
    renderCreateTicket();
    await screen.findByTestId("field-category");

    for (const field of REQUIRED_FIELDS) {
      const control = screen.getByTestId(`field-${field}`);
      const label = control.closest("label");
      expect(label, `${field} must sit inside its label`).not.toBeNull();

      const marker = label!.querySelector(".zg-required-marker");
      expect(marker, `${field} must show a required marker`).not.toBeNull();
      expect(marker!.textContent).toBe("*");

      // The asterisk is decorative: the required state reaches assistive
      // technology through the required attribute, not the glyph.
      expect(marker).toHaveAttribute("aria-hidden", "true");
      expect(control).toBeRequired();
    }
  });
});

describe("STY-02 (AC-41) - message position", () => {
  it("renders each message as the next sibling of its own field, not a summary block", async () => {
    const user = userEvent.setup({ delay: null });
    renderCreateTicket();
    await screen.findByTestId("field-category");

    await user.click(screen.getByTestId("btn-submit-ticket"));

    for (const field of REQUIRED_FIELDS) {
      const control = await screen.findByTestId(`field-${field}`);
      const message = screen.getByTestId(`error-${field}`);

      // Immediately after its control in the DOM, so the message cannot have
      // been hoisted into a summary at the top of the form (ui-spec 2.1).
      expect(control.nextElementSibling, `${field} message must follow its field`).toBe(message);
      expect(control).toHaveAttribute("aria-describedby", message.id);
      expect(control).toHaveAttribute("aria-invalid", "true");
    }
  });

  it("clears the message when the field is corrected", async () => {
    const user = userEvent.setup({ delay: null });
    renderCreateTicket();
    await screen.findByTestId("field-category");
    await user.click(screen.getByTestId("btn-submit-ticket"));
    await screen.findByTestId("error-summary");

    await user.type(screen.getByTestId("field-summary"), "Laptop battery drains fast");

    expect(screen.queryByTestId("error-summary")).not.toBeInTheDocument();
    expect(screen.getByTestId("field-summary")).not.toHaveAttribute("aria-invalid");
  });
});

describe("STY-05 (AC-15) - busy state", () => {
  it("marks Submit disabled and aria-busy for the whole in-flight window", async () => {
    let release: (v: api.Ticket) => void = () => {};
    vi.spyOn(api, "createTicket").mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const user = userEvent.setup({ delay: null });

    renderCreateTicket();
    await screen.findByTestId("field-category");
    await user.selectOptions(screen.getByTestId("field-category"), "2");
    await user.selectOptions(screen.getByTestId("field-related-system"), "5");
    await user.selectOptions(screen.getByTestId("field-priority"), "HIGH");
    await user.type(screen.getByTestId("field-summary"), "Laptop battery drains within one hour");
    await user.type(
      screen.getByTestId("field-description"),
      "Since the last Windows update the battery drops from full to nearly empty in about an hour.",
    );

    const submit = screen.getByTestId("btn-submit-ticket");
    expect(submit).toBeEnabled();
    expect(submit).not.toHaveAttribute("aria-busy");

    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveAttribute("aria-busy", "true");
    // Busy text names the operation (ui-spec 3).
    expect(submit).toHaveTextContent(/submitting/i);

    release({
      id: "t1",
      ticketNumber: "TKT-2026-00042",
      ticketDate: "2026-09-04T00:00:00.000Z",
      requester: { id: ALICE.id, fullName: ALICE.fullName },
      category: CATEGORIES[0],
      relatedSystem: SYSTEMS[0],
      summary: "Laptop battery drains within one hour",
      requestedPriority: "HIGH",
      description: "x".repeat(30),
      currentStatus: "NEW",
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    await screen.findByTestId("state-created");
  });
});
