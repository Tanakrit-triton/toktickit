import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequesterSelection } from "../../src/lab-02/screens/RequesterSelection.js";
import * as api from "../../src/lab-02/api.js";

// UI-01 .. UI-05 from docs/lab-02/tests.md section 2.3.
//
// The API module is mocked so these prove state handling -- loading, loaded,
// empty, failure, and Continue gating -- without a running backend. Assertions
// target data-testid per ui-spec section 9, never CSS class names.

const ACTIVE = [
  { id: "11111111-1111-1111-1111-111111111111", fullName: "Napat Chaiwong", email: "napat.cha@kmutt.ac.th" },
  { id: "22222222-2222-2222-2222-222222222222", fullName: "Siriporn Meesuk", email: "siriporn.mee@kmutt.ac.th" },
];

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RequesterSelection (UI-01 - AC-01)", () => {
  it("lists active Requesters and never the inactive one", async () => {
    // The API returns active Requesters only (BR-10); the inactive Requester
    // is filtered server-side and must not reach the client at all.
    vi.spyOn(api, "fetchDevRequesters").mockResolvedValue(ACTIVE);

    render(<RequesterSelection onSelected={vi.fn()} />);

    const select = await screen.findByTestId("field-dev-requester");
    const optionText = Array.from(select.querySelectorAll("option")).map((o) => o.textContent ?? "");

    expect(optionText.join(" ")).toContain("Napat Chaiwong");
    expect(optionText.join(" ")).toContain("Siriporn Meesuk");
    expect(optionText.join(" ")).not.toContain("inactive");
  });
});

describe("RequesterSelection (UI-02 - FR-33)", () => {
  it("shows a loading state with Continue disabled while the request is in flight", async () => {
    let release: (v: typeof ACTIVE) => void = () => {};
    vi.spyOn(api, "fetchDevRequesters").mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    render(<RequesterSelection onSelected={vi.fn()} />);

    expect(screen.getByTestId("state-loading")).toBeInTheDocument();
    expect(screen.getByTestId("btn-continue")).toBeDisabled();

    release(ACTIVE);
    await waitFor(() => expect(screen.queryByTestId("state-loading")).not.toBeInTheDocument());
  });
});

describe("RequesterSelection (UI-03 - AC-06)", () => {
  it("shows the empty state and offers no Continue when no active Requester exists", async () => {
    vi.spyOn(api, "fetchDevRequesters").mockResolvedValue([]);

    render(<RequesterSelection onSelected={vi.fn()} />);

    expect(await screen.findByTestId("state-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-continue")).not.toBeInTheDocument();
    expect(screen.queryByTestId("field-dev-requester")).not.toBeInTheDocument();
  });
});

describe("RequesterSelection (UI-04 - AC-05)", () => {
  it("shows a safe failure state with Retry, leaking no status code or stack trace", async () => {
    vi.spyOn(api, "fetchDevRequesters").mockRejectedValue(
      new Error("500 Internal Server Error at Object.<anonymous> (/srv/app/routes.ts:42:11)"),
    );

    render(<RequesterSelection onSelected={vi.fn()} />);

    const failure = await screen.findByTestId("state-failure");
    expect(failure).toBeInTheDocument();
    expect(screen.getByTestId("btn-retry")).toBeInTheDocument();

    const rendered = document.body.textContent ?? "";
    expect(rendered).not.toMatch(/\b500\b/);
    expect(rendered).not.toMatch(/routes\.ts/);
    expect(rendered).not.toMatch(/\bat\s+Object/);
  });

  it("retries the fetch when Retry is activated", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchDevRequesters")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(ACTIVE);

    render(<RequesterSelection onSelected={vi.fn()} />);
    await screen.findByTestId("btn-retry");

    await userEvent.click(screen.getByTestId("btn-retry"));

    await waitFor(() => expect(screen.getByTestId("field-dev-requester")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("RequesterSelection (UI-05 - FR-02)", () => {
  it("keeps Continue disabled until a Requester is chosen, then enables it", async () => {
    vi.spyOn(api, "fetchDevRequesters").mockResolvedValue(ACTIVE);

    render(<RequesterSelection onSelected={vi.fn()} />);
    const select = await screen.findByTestId("field-dev-requester");

    expect(screen.getByTestId("btn-continue")).toBeDisabled();

    await userEvent.selectOptions(select, ACTIVE[0].id);

    expect(screen.getByTestId("btn-continue")).toBeEnabled();
  });

  it("reports the chosen Requester on Continue", async () => {
    vi.spyOn(api, "fetchDevRequesters").mockResolvedValue(ACTIVE);
    const onSelected = vi.fn();

    render(<RequesterSelection onSelected={onSelected} />);
    const select = await screen.findByTestId("field-dev-requester");
    await userEvent.selectOptions(select, ACTIVE[1].id);
    await userEvent.click(screen.getByTestId("btn-continue"));

    expect(onSelected).toHaveBeenCalledWith(ACTIVE[1]);
  });
});
