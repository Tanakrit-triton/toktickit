import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequesterProvider } from "../../src/lab-02/RequesterContext.js";
import { AppShell } from "../../src/lab-02/AppShell.js";
import * as api from "../../src/lab-02/api.js";

// UI-06 .. UI-09 from docs/lab-02/tests.md section 2.3.

const ALICE = { id: "aaaaaaaa-0000-0000-0000-000000000001", fullName: "Napat Chaiwong", email: "napat.cha@kmutt.ac.th" };
const BOB = { id: "bbbbbbbb-0000-0000-0000-000000000002", fullName: "Siriporn Meesuk", email: "siriporn.mee@kmutt.ac.th" };

const SELECTED_KEY = "toktickit.selectedRequester";

function renderShell(children = <p>My Tickets</p>) {
  return render(
    <RequesterProvider>
      <AppShell>{children}</AppShell>
    </RequesterProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  vi.spyOn(api, "fetchDevRequesters").mockResolvedValue([ALICE, BOB]);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("AppShell (UI-06 - AC-03)", () => {
  it("shows the selected Requester's name and a Change Requester action", async () => {
    window.sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ALICE));

    renderShell();

    expect(await screen.findByTestId("shell-requester-name")).toHaveTextContent("Napat Chaiwong");
    expect(screen.getByTestId("btn-change-requester")).toBeInTheDocument();
  });
});

describe("AppShell (UI-07 - AC-02)", () => {
  it("renders the Selection screen instead of the guarded content when nothing is selected", async () => {
    renderShell(<p data-testid="my-tickets-screen">My Tickets</p>);

    expect(await screen.findByTestId("requester-selection-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("my-tickets-screen")).not.toBeInTheDocument();
  });

  it("renders the guarded content once a Requester is selected", async () => {
    window.sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ALICE));

    renderShell(<p data-testid="my-tickets-screen">My Tickets</p>);

    expect(await screen.findByTestId("my-tickets-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("requester-selection-screen")).not.toBeInTheDocument();
  });
});

describe("AppShell (UI-08 - BR-03)", () => {
  it("shows the development notice stating this is not a login, when selected", async () => {
    window.sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ALICE));

    renderShell();

    const notice = await screen.findByTestId("dev-mode-notice");
    expect(notice).toHaveTextContent(/not a login/i);
    expect(notice).toHaveTextContent(/simulated/i);
  });

  it("shows the development notice on the selection screen too", async () => {
    renderShell();

    expect(await screen.findByTestId("dev-mode-notice")).toHaveTextContent(/not a login/i);
  });
});

describe("AppShell (UI-09 - AC-04)", () => {
  it("clears the selection and returns to the selector on Change Requester", async () => {
    window.sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ALICE));

    renderShell(<p data-testid="my-tickets-screen">My Tickets</p>);
    await screen.findByTestId("my-tickets-screen");

    await userEvent.click(screen.getByTestId("btn-change-requester"));

    await waitFor(() => expect(screen.getByTestId("requester-selection-screen")).toBeInTheDocument());
    expect(screen.queryByTestId("my-tickets-screen")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(SELECTED_KEY)).toBeNull();
  });

  it("unmounts the previous Requester's content so cached data cannot survive the switch", async () => {
    window.sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ALICE));

    // Content that records how many times it mounted. Switching Requester must
    // remount it, which is what guarantees Requester A's fetched data is
    // discarded rather than reused for Requester B (BR-12).
    const mounts = vi.fn();
    function Guarded() {
      mounts();
      return <p data-testid="my-tickets-screen">My Tickets</p>;
    }

    renderShell(<Guarded />);
    await screen.findByTestId("my-tickets-screen");
    const mountsBefore = mounts.mock.calls.length;

    await userEvent.click(screen.getByTestId("btn-change-requester"));
    await screen.findByTestId("field-dev-requester");
    await userEvent.selectOptions(screen.getByTestId("field-dev-requester"), BOB.id);
    await userEvent.click(screen.getByTestId("btn-continue"));

    await screen.findByTestId("my-tickets-screen");
    expect(screen.getByTestId("shell-requester-name")).toHaveTextContent("Siriporn Meesuk");
    expect(mounts.mock.calls.length).toBeGreaterThan(mountsBefore);
  });
});
