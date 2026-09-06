import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RequesterProvider } from "../../src/lab-02/RequesterContext.js";
import { AppRoutes } from "../../src/lab-02/AppRoutes.js";
import * as api from "../../src/lab-02/api.js";

// UI-29 from docs/lab-02/tests.md section 2.3 (AC-02).
//
// UI-07 proves the guard mechanism works: AppShell replaces its children with
// the Selection screen when nothing is selected. It cannot prove the guard is
// INSTALLED, because it renders AppShell directly. This suite renders the real
// route tree instead, so it fails if the shell is ever unmounted from the
// application -- which is exactly the defect it was written to catch.

const ALICE = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  fullName: "Napat Chaiwong",
  email: "napat.cha@kmutt.ac.th",
};

const SELECTED_KEY = "toktickit.selectedRequester";

function renderAt(path: string) {
  return render(
    <RequesterProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </RequesterProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  vi.spyOn(api, "fetchDevRequesters").mockResolvedValue([ALICE]);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("AppRoutes (UI-29 - AC-02)", () => {
  it("shows the Selection screen when /tickets is opened with no Requester selected", async () => {
    renderAt("/tickets");

    expect(await screen.findByTestId("requester-selection-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("my-tickets-screen")).not.toBeInTheDocument();
  });

  it("shows the Selection screen when /tickets/new is opened with no Requester selected", async () => {
    renderAt("/tickets/new");

    expect(await screen.findByTestId("requester-selection-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("create-ticket-screen")).not.toBeInTheDocument();
  });

  it("renders the guarded screen once a Requester is selected", async () => {
    window.sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ALICE));

    renderAt("/tickets");

    expect(await screen.findByTestId("my-tickets-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("requester-selection-screen")).not.toBeInTheDocument();
  });

  it("redirects / to /tickets", async () => {
    window.sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ALICE));

    renderAt("/");

    expect(await screen.findByTestId("my-tickets-screen")).toBeInTheDocument();
  });

  it("renders the Lab 1 page at /lab-01 outside the shell, with no development notice", async () => {
    window.sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ALICE));

    renderAt("/lab-01");

    // A-04 keeps the Lab 1 slice as it was. Wrapping it in the Zen Green shell
    // would change it, so /lab-01 sits outside AppShell and carries neither the
    // header nor the BR-03 development notice.
    expect(await screen.findByRole("button", { name: /check system/i })).toBeInTheDocument();
    expect(screen.queryByTestId("dev-mode-notice")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shell-requester-name")).not.toBeInTheDocument();
  });
});
