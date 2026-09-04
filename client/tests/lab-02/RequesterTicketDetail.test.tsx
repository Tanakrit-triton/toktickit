import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequesterProvider } from "../../src/lab-02/RequesterContext.js";
import { RequesterTicketDetail } from "../../src/lab-02/screens/RequesterTicketDetail.js";
import * as api from "../../src/lab-02/api.js";
import type { TicketDetail } from "../../src/lab-02/api.js";

// UI-27 and UI-28 from docs/lab-02/tests.md section 2.3.

const ALICE = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  fullName: "Napat Chaiwong",
  email: "napat.cha@kmutt.ac.th",
};

const TICKET: TicketDetail = {
  id: "tttttttt-0000-0000-0000-000000000001",
  ticketNumber: "TKT-2026-00042",
  ticketDate: "2026-09-01T13:24:07.512Z",
  requester: { id: ALICE.id, fullName: ALICE.fullName },
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 7, name: "Corporate Laptop" },
  summary: "Laptop battery drains within one hour",
  requestedPriority: "HIGH",
  description: "First line of the description.\nSecond line after a break.",
  currentStatus: "NEW",
  createdAt: "2026-09-01T13:24:07.512Z",
  updatedAt: "2026-09-01T13:24:07.512Z",
  attachments: [],
};

function renderDetail() {
  return render(
    <RequesterProvider>
      <MemoryRouter initialEntries={[`/tickets/${TICKET.id}`]}>
        <Routes>
          <Route path="/tickets/:ticketId" element={<RequesterTicketDetail />} />
        </Routes>
      </MemoryRouter>
    </RequesterProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.sessionStorage.setItem("toktickit.selectedRequester", JSON.stringify(ALICE));
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("RequesterTicketDetail (UI-27 - AC-26)", () => {
  it("renders every ticket value read-only, with no editable control", async () => {
    vi.spyOn(api, "fetchTicket").mockResolvedValue(TICKET);

    renderDetail();

    const region = await screen.findByTestId("ticket-information");

    for (const value of [
      "TKT-2026-00042",
      "Napat Chaiwong",
      "Hardware",
      "Corporate Laptop",
      "Laptop battery drains within one hour",
    ]) {
      expect(region, `${value} should be shown`).toHaveTextContent(value);
    }

    // The ticket region carries no way to change anything: no input, no
    // textarea, no select, no button. The attachment region is where every
    // interactive control lives (ui-spec 5.5).
    expect(region.querySelectorAll("input")).toHaveLength(0);
    expect(region.querySelectorAll("textarea")).toHaveLength(0);
    expect(region.querySelectorAll("select")).toHaveLength(0);
    expect(region.querySelectorAll("button")).toHaveLength(0);
  });

  it("preserves line breaks in the description and never truncates it", async () => {
    vi.spyOn(api, "fetchTicket").mockResolvedValue(TICKET);

    renderDetail();

    const description = await screen.findByTestId("ticket-description");
    expect(description).toHaveTextContent("First line of the description.");
    expect(description).toHaveTextContent("Second line after a break.");
    expect(description.className).toMatch(/zg-preserve-lines/);
  });

  it("shows a safe refusal when the ticket is not the Requester's", async () => {
    vi.spyOn(api, "fetchTicket").mockRejectedValue(new Error("404 Not Found at /srv/app.ts:12:3"));

    renderDetail();

    expect(await screen.findByTestId("state-detail-failed")).toBeInTheDocument();
    const rendered = document.body.textContent ?? "";
    expect(rendered).not.toMatch(/\b404\b/);
    expect(rendered).not.toMatch(/app\.ts/);
  });
});

describe("RequesterTicketDetail (UI-28 - scope section 3)", () => {
  it("renders nothing from the Lab 3 exclusion list", async () => {
    vi.spyOn(api, "fetchTicket").mockResolvedValue(TICKET);

    renderDetail();
    await screen.findByTestId("ticket-information");

    // Comments, internal notes, actions taken, and any status control are all
    // explicitly out of Lab 2 scope. Their presence would be a defect, not a
    // feature, so this guards the exclusion rather than a behaviour.
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of ["public comment", "internal note", "actions taken", "add comment"]) {
      expect(text, `${forbidden} must not appear`).not.toContain(forbidden);
    }

    for (const testId of [
      "field-status",
      "btn-change-status",
      "btn-resolve",
      "btn-close-ticket",
      "field-comment",
      "field-internal-note",
      "field-it-priority",
    ]) {
      expect(screen.queryByTestId(testId), `${testId} must not exist`).not.toBeInTheDocument();
    }

    // The status is shown, but as a badge -- a value, not a control.
    expect(screen.getByTestId("badge-status")).toHaveTextContent(/new/i);
  });
});
