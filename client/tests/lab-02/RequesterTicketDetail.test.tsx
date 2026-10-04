import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../src/lab-03/AuthContext.js";
import { signInAs } from "./session-fixture.js";
import { RequesterTicketDetail } from "../../src/lab-02/screens/RequesterTicketDetail.js";
import * as api from "../../src/lab-02/api.js";
import type { TicketDetail } from "../../src/lab-02/api.js";

// UI-27 from docs/lab-02/tests.md section 2.3. L2 UI-28 is superseded by
// UI-35 and UI-37 in client/tests/lab-03/RequesterTicketDetail.test.tsx
// (docs/lab-03/tests.md section 4.1).

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
  signInAs(ALICE);
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[`/tickets/${TICKET.id}`]}>
        <Routes>
          <Route path="/tickets/:ticketId" element={<RequesterTicketDetail />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
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
