import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as authApi from "../../src/lab-03/auth-api.js";
import { PasswordChangeError } from "../../src/lab-03/auth-api.js";
import { getCsrfToken } from "../../src/lab-03/api-client.js";
import { MUST_CHANGE, REQUESTER, mockRequesterScreens, mockStartupSession, renderApp, session } from "./helpers.js";

// UI-08 to UI-11 from docs/lab-03/tests.md section 2.10 (AC-02, AC-10).
// Screen: ui-spec.md section 6.2; forced mode: section 3.

const CURRENT = "the current password";
const NEW = "a brand new password";

async function openChangePassword(user = REQUESTER, path = "/change-password") {
  mockStartupSession(user);
  renderApp(path);
  return screen.findByTestId("change-password-screen");
}

async function fill(
  u: ReturnType<typeof userEvent.setup>,
  { current = CURRENT, next = NEW, confirm = NEW }: { current?: string; next?: string; confirm?: string } = {},
) {
  // Pasted rather than typed, so surrogate pairs arrive whole.
  for (const [field, value] of [
    ["current-password", current],
    ["new-password", next],
    ["confirm-password", confirm],
  ]) {
    await u.click(screen.getByTestId(`field-${field}`));
    await u.paste(value);
  }
  await u.click(screen.getByTestId("btn-save-password"));
}

function expectMessageBelow(field: string, text: string) {
  const control = screen.getByTestId(`field-${field}`);
  const message = screen.getByTestId(`error-${field}`);
  expect(message).toHaveTextContent(text);
  expect(control).toHaveAttribute("aria-describedby", expect.stringContaining(message.id));
  expect(control.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client password rules (UI-08 - AC-10)", () => {
  it("blocks 11 code points with a message below New password, and sends nothing", async () => {
    const change = vi.spyOn(authApi, "changePassword");
    const u = userEvent.setup({ delay: null });
    await openChangePassword();

    // Eleven code points written as surrogate pairs: 22 UTF-16 units, so a
    // .length count would wrongly accept it (ui-spec 6.2).
    const elevenEmoji = "🔑".repeat(11);
    await fill(u, { next: elevenEmoji, confirm: elevenEmoji });

    expectMessageBelow("new-password", "Password must be 12–128 characters.");
    expect(change).not.toHaveBeenCalled();
  });

  it("blocks a mismatched confirmation with a message below Confirm new password", async () => {
    const change = vi.spyOn(authApi, "changePassword");
    const u = userEvent.setup({ delay: null });
    await openChangePassword();

    await fill(u, { confirm: `${NEW}x` });

    expectMessageBelow("confirm-password", "Passwords do not match.");
    expect(change).not.toHaveBeenCalled();
  });

  it("blocks a new password equal to the current one", async () => {
    const change = vi.spyOn(authApi, "changePassword");
    const u = userEvent.setup({ delay: null });
    await openChangePassword();

    await fill(u, { next: CURRENT, confirm: CURRENT });

    expectMessageBelow("new-password", "New password must be different from the current password.");
    expect(change).not.toHaveBeenCalled();
  });
});

describe("server field errors (UI-09 - AC-10)", () => {
  it("renders a 422 details.currentPassword below Current password", async () => {
    vi.spyOn(authApi, "changePassword").mockRejectedValue(
      new PasswordChangeError({ currentPassword: "Current password is incorrect." }),
    );
    const u = userEvent.setup({ delay: null });
    await openChangePassword();

    await fill(u);

    await screen.findByTestId("error-current-password");
    expectMessageBelow("current-password", "Current password is incorrect.");
  });
});

describe("change success (UI-10 - AC-02)", () => {
  it("stores the new CSRF token, ends forced mode, and lands with the Password changed callout", async () => {
    mockRequesterScreens();
    vi.spyOn(authApi, "changePassword").mockResolvedValue(
      session({ ...MUST_CHANGE, mustChangePassword: false }, "csrf-token-after-change"),
    );
    const u = userEvent.setup({ delay: null });
    await openChangePassword(MUST_CHANGE);

    await fill(u);

    expect(await screen.findByTestId("my-tickets-screen")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/tickets$/);
    expect(screen.getByText("Password changed.")).toBeInTheDocument();
    expect(screen.getByTestId("nav-my-tickets")).toBeInTheDocument();
    expect(getCsrfToken()).toBe("csrf-token-after-change");
    expect(authApi.changePassword).toHaveBeenCalledWith({
      currentPassword: CURRENT,
      newPassword: NEW,
      confirmPassword: NEW,
    });
  });
});

describe("forced mode (UI-11 - AC-02)", () => {
  it("shows no navigation and no Change password link", async () => {
    await openChangePassword(MUST_CHANGE);

    expect(screen.getByTestId("change-password-screen")).toHaveTextContent("Choose a new password");
    expect(screen.getByTestId("change-password-screen")).toHaveTextContent(
      "Your password was set by an administrator. Choose a new one to continue.",
    );
    for (const id of ["nav-my-tickets", "nav-create-ticket", "nav-ticket-queue", "nav-user-management", "link-change-password"]) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
    expect(screen.getByTestId("shell-user-name")).toHaveTextContent(MUST_CHANGE.fullName);
    expect(screen.getByTestId("btn-logout")).toBeInTheDocument();
    // The brand is not a link in forced mode (ui-spec 3).
    expect(screen.getByText("TokTickIT").closest("a")).toBeNull();
  });

  it("renders Change Password when /tickets is visited", async () => {
    const fetchTickets = mockRequesterScreens();

    await openChangePassword(MUST_CHANGE, "/tickets");

    expect(screen.queryByTestId("my-tickets-screen")).not.toBeInTheDocument();
    expect(fetchTickets).not.toHaveBeenCalled();
  });
});
