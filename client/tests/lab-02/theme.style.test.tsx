import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

// ---------------------------------------------------------------------------
// STY-03, STY-04, STY-06, STY-07, STY-08, STY-09, STY-10, STY-11, STY-12
//
// jsdom loads no stylesheet, so getComputedStyle returns nothing a CSS file
// set. Assertions about appearance therefore target the attribute and class
// contract the stylesheet keys off, and STY-11 reads the stylesheet source
// directly. What jsdom cannot see -- that the rules actually paint -- is
// covered by the responsive suite and the screenshots.

import { readFileSync } from "node:fs";
import { MyTickets } from "../../src/lab-02/screens/MyTickets.js";

const STYLESHEET = "src/lab-02/styles/zen-green.css";
const UI_SPEC = "../docs/lab-02/ui-spec.md";

describe("STY-03 (ui-spec 2) - editable versus read-only", () => {
  it("marks read-only controls differently from editable ones", async () => {
    renderCreateTicket();
    await screen.findByTestId("field-category");

    for (const id of ["field-ticket-number", "field-ticket-date", "field-requester"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("readonly");
    }
    // Editable controls carry no readonly attribute, so the two are
    // distinguishable by contract and not only by colour.
    for (const id of ["field-summary", "field-description"]) {
      expect(screen.getByTestId(id)).not.toHaveAttribute("readonly");
    }

    const css = readFileSync(STYLESHEET, "utf8");
    expect(css).toMatch(/\.zg-field\[readonly\]/);
    expect(css).toMatch(/--zg-readonly-bg/);
  });
});

describe("STY-04 (ui-spec 2) - disabled versus read-only", () => {
  it("keeps disabled distinct from read-only, and unfocusable", async () => {
    let release: (v: api.Ticket) => void = () => {};
    vi.spyOn(api, "createTicket").mockReturnValue(new Promise((r) => { release = r; }));
    const user = userEvent.setup({ delay: null });

    renderCreateTicket();
    await screen.findByTestId("field-category");
    await user.selectOptions(screen.getByTestId("field-category"), "2");
    await user.selectOptions(screen.getByTestId("field-related-system"), "5");
    await user.selectOptions(screen.getByTestId("field-priority"), "HIGH");
    await user.type(screen.getByTestId("field-summary"), "Laptop battery drains within one hour");
    await user.type(screen.getByTestId("field-description"), "x".repeat(40));
    await user.click(screen.getByTestId("btn-submit-ticket"));

    const summary = screen.getByTestId("field-summary");
    await waitFor(() => expect(summary).toBeDisabled());
    // Disabled means unavailable: it cannot take focus. Read-only means
    // readable: it can. Two different states, not one greyed appearance.
    summary.focus();
    expect(summary).not.toHaveFocus();

    const readOnly = screen.getByTestId("field-requester");
    expect(readOnly).not.toBeDisabled();

    const css = readFileSync(STYLESHEET, "utf8");
    expect(css).toMatch(/\.zg-field:disabled/);
    expect(css).toMatch(/--zg-disabled-bg/);

    release({} as api.Ticket);
  });
});

describe("STY-06 (ui-spec 3) - one primary button per screen", () => {
  it("Create Ticket offers exactly one primary action", async () => {
    renderCreateTicket();
    await screen.findByTestId("field-category");

    const primaries = document.querySelectorAll(".zg-btn--primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveAttribute("data-testid", "btn-submit-ticket");
  });
});

describe("STY-07 (ui-spec 3) - every control carries visible text", () => {
  it("has no icon-only button anywhere on Create Ticket", async () => {
    renderCreateTicket();
    await screen.findByTestId("field-category");

    for (const button of Array.from(document.querySelectorAll("button, a.zg-btn"))) {
      const text = (button.textContent ?? "").trim();
      const label = button.getAttribute("aria-label");
      // Icons may accompany text; they never replace it. A control with
      // neither is unusable to anyone who cannot see the glyph.
      expect(
        text.length > 0 || (label !== null && label.length > 0),
        `${button.outerHTML.slice(0, 80)} has no visible text or label`,
      ).toBe(true);
    }
  });
});

describe("STY-08, STY-09 (AC-43) - badges convey value by text", () => {
  const ROW = {
    id: "t1",
    ticketNumber: "TKT-2026-00042",
    summary: "Laptop battery drains within one hour",
    category: CATEGORIES[0],
    relatedSystem: SYSTEMS[0],
    currentStatus: "NEW",
    attachmentCount: 0,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  };

  function renderList(priority: string) {
    vi.spyOn(api, "fetchTickets").mockResolvedValue({
      data: [{ ...ROW, requestedPriority: priority }],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    return render(
      <RequesterProvider>
        <MemoryRouter initialEntries={["/tickets"]}>
          <MyTickets />
        </MemoryRouter>
      </RequesterProvider>,
    );
  }

  it("renders each priority as text plus a glyph, never colour alone", async () => {
    const expected: Record<string, RegExp> = {
      LOW: /Low/,
      MEDIUM: /Medium/,
      HIGH: /High/,
      URGENT: /Urgent/,
    };
    const glyphs = new Set<string>();

    for (const [priority, label] of Object.entries(expected)) {
      cleanup();
      vi.restoreAllMocks();
      vi.spyOn(api, "fetchCategories").mockResolvedValue(CATEGORIES);
      vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
      renderList(priority);

      const badge = await screen.findByTestId("badge-priority");
      expect(badge, `${priority} badge`).toHaveTextContent(label);
      // The glyph is what carries severity into greyscale and into
      // colour-vision deficiency (ui-spec 6).
      const glyph = (badge.textContent ?? "").trim().charAt(0);
      expect(glyph, `${priority} needs a leading glyph`).not.toMatch(/[A-Za-z]/);
      glyphs.add(glyph);
    }

    // Four distinct glyphs: one repeated everywhere would carry no severity.
    expect(glyphs.size).toBe(4);
  });

  it("renders the status as the word New", async () => {
    renderList("HIGH");
    const badge = await screen.findByTestId("badge-status");
    expect(badge).toHaveTextContent(/^New$/);
  });
});

describe("STY-10 (AC-42) - focus is visible", () => {
  it("never removes the outline without replacing it, and rings focused controls", async () => {
    const css = readFileSync(STYLESHEET, "utf8");

    // outline: none without a replacement is the defect ui-spec 8 names.
    const suppressions = css.match(/outline:\s*none/g) ?? [];
    expect(suppressions, "outline must not be removed").toHaveLength(0);

    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/--zg-focus-ring/);
  });

  it("gives every interactive control a focusable element", async () => {
    renderCreateTicket();
    await screen.findByTestId("field-category");

    for (const id of ["field-category", "field-summary", "field-description", "btn-submit-ticket"]) {
      const control = screen.getByTestId(id);
      control.focus();
      expect(control, `${id} should take focus`).toHaveFocus();
    }
  });
});

describe("STY-11 (AC-44) - token conformance", () => {
  it("uses no colour that is absent from the ui-spec token table", () => {
    // Read from the specification itself rather than from a copy, so the test
    // fails if a colour is added to the stylesheet without being added to the
    // document that governs it.
    const spec = readFileSync(UI_SPEC, "utf8").split("### 1.2 Typography")[0];
    const allowed = new Set(
      (spec.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((hex: string) => hex.toUpperCase()),
    );
    expect(allowed.size, "the ui-spec token table must be readable").toBeGreaterThan(10);

    const css = readFileSync(STYLESHEET, "utf8");
    const used = [...new Set((css.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((h) => h.toUpperCase()))];
    expect(used.length, "the stylesheet must define colours").toBeGreaterThan(10);

    const strays = used.filter((hex) => !allowed.has(hex));
    expect(strays, `colours absent from ui-spec 1.1: ${strays.join(", ")}`).toEqual([]);
  });

  it("uses no KMUTT palette value, so DEV-01 holds in fact", () => {
    const css = readFileSync(STYLESHEET, "utf8").toUpperCase();
    for (const kmutt of ["#FA4616", "#FFC72C", "#7B8189"]) {
      expect(css, `${kmutt} is the D-09 palette DEV-01 replaced`).not.toContain(kmutt);
    }
  });
});

describe("STY-12 (AC-42) - keyboard reach", () => {
  it("reaches every Create Ticket control by tabbing, in visual order", async () => {
    const user = userEvent.setup({ delay: null });
    renderCreateTicket();
    await screen.findByTestId("field-category");

    const expectedOrder = [
      "field-category",
      "field-related-system",
      "field-priority",
      "field-summary",
      "field-description",
    ];

    const reached: string[] = [];
    for (let i = 0; i < 25 && reached.length < expectedOrder.length; i += 1) {
      await user.tab();
      const id = document.activeElement?.getAttribute("data-testid");
      if (id !== null && id !== undefined && expectedOrder.includes(id) && !reached.includes(id)) {
        reached.push(id);
      }
    }

    // Order matters: tab order following visual order is the requirement, not
    // merely that everything is reachable somehow.
    expect(reached).toEqual(expectedOrder);
  });
});
