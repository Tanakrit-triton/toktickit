import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as authApi from "../../src/lab-03/auth-api.js";
import { LoginError } from "../../src/lab-03/auth-api.js";
import {
  IT_STAFF,
  MUST_CHANGE,
  REQUESTER,
  mockRequesterScreens,
  mockStartupSession,
  renderApp,
  session,
} from "./helpers.js";

// UI-01 to UI-07 from docs/lab-03/tests.md section 2.10 (AC-01, AC-02, AC-05,
// AC-06, AC-07, AC-14). Screen: ui-spec.md section 6.1.

const EMAIL = "napat.cha@kmutt.ac.th";
const PASSWORD = "a password long enough";

async function openLogin() {
  mockStartupSession(null);
  renderApp("/login");
  return screen.findByTestId("login-screen");
}

async function submit(user: ReturnType<typeof userEvent.setup>, email = EMAIL, password = PASSWORD) {
  if (email !== "") await user.type(screen.getByTestId("field-email"), email);
  if (password !== "") await user.type(screen.getByTestId("field-password"), password);
  await user.click(screen.getByTestId("btn-sign-in"));
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Login validation (UI-01 - AC-14)", () => {
  it("labels both fields and starts with focus on Email", async () => {
    await openLogin();

    expect(screen.getByLabelText("Email")).toBe(screen.getByTestId("field-email"));
    expect(screen.getByLabelText("Password")).toBe(screen.getByTestId("field-password"));
    expect(screen.getByTestId("field-email")).toHaveAttribute("type", "email");
    expect(screen.getByTestId("field-email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByTestId("field-password")).toHaveAttribute("type", "password");
    expect(screen.getByTestId("field-password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByTestId("field-email")).toHaveFocus();
  });

  it("shows a message below each empty field and sends no request", async () => {
    const login = vi.spyOn(authApi, "login");
    const user = userEvent.setup({ delay: null });
    await openLogin();

    await user.click(screen.getByTestId("btn-sign-in"));

    for (const [field, text] of [
      ["email", "Enter your email."],
      ["password", "Enter your password."],
    ]) {
      const message = screen.getByTestId(`error-${field}`);
      expect(message).toHaveTextContent(text);
      const control = screen.getByTestId(`field-${field}`);
      expect(control).toHaveAttribute("aria-describedby", message.id);
      // Below the field: the message follows its control in document order.
      expect(control.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(login).not.toHaveBeenCalled();
  });
});

describe("Login busy (UI-02 - AC-14)", () => {
  it("makes Sign in busy and disabled, and disables the fields, while in flight", async () => {
    vi.spyOn(authApi, "login").mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup({ delay: null });
    await openLogin();

    await submit(user);

    const button = screen.getByTestId("btn-sign-in");
    expect(button).toHaveTextContent("Signing in…");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(screen.getByTestId("field-email")).toBeDisabled();
    expect(screen.getByTestId("field-password")).toBeDisabled();
  });
});

describe("Invalid credentials (UI-03 - AC-05)", () => {
  it("shows the generic callout, clears the password, keeps the email, and focuses Password", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new LoginError("INVALID_CREDENTIALS"));
    const user = userEvent.setup({ delay: null });
    await openLogin();

    await submit(user);

    const callout = await screen.findByTestId("callout-error");
    expect(callout).toHaveTextContent("The email or password is incorrect.");
    expect(callout).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("field-password")).toHaveValue("");
    expect(screen.getByTestId("field-email")).toHaveValue(EMAIL);
    expect(screen.getByTestId("field-password")).toHaveFocus();
    // Neither field is blamed: that would reveal which one was wrong (BR-07).
    expect(screen.getByTestId("field-email")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("field-password")).not.toHaveAttribute("aria-invalid", "true");
  });
});

describe("Inactive account (UI-04 - AC-06)", () => {
  it("shows the inactive callout text", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new LoginError("ACCOUNT_INACTIVE"));
    const user = userEvent.setup({ delay: null });
    await openLogin();

    await submit(user);

    expect(await screen.findByTestId("callout-error")).toHaveTextContent(
      "This account is inactive. Contact your administrator.",
    );
  });
});

describe("Throttled (UI-05 - AC-07)", () => {
  it("shows the try-later callout", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new LoginError("TOO_MANY_ATTEMPTS"));
    const user = userEvent.setup({ delay: null });
    await openLogin();

    await submit(user);

    expect(await screen.findByTestId("callout-error")).toHaveTextContent(
      "Too many sign-in attempts. Try again in a few minutes.",
    );
  });
});

describe("Login failure (UI-06 - AC-14)", () => {
  it("shows a safe callout with no status code on a network failure, and keeps both fields", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new TypeError("Failed to fetch: 503 at http://localhost:3000"));
    const user = userEvent.setup({ delay: null });
    await openLogin();

    await submit(user);

    const callout = await screen.findByTestId("callout-error");
    expect(callout).toHaveTextContent("Could not sign in. Try again.");
    expect(callout.textContent).not.toMatch(/\d{3}|localhost|fetch/i);
    expect(screen.getByTestId("field-email")).toHaveValue(EMAIL);
    expect(screen.getByTestId("field-password")).toHaveValue(PASSWORD);
  });
});

describe("Login outcome (UI-07 - AC-01, AC-02)", () => {
  it("sends a Requester to My Tickets", async () => {
    mockRequesterScreens();
    vi.spyOn(authApi, "login").mockResolvedValue(session(REQUESTER));
    const user = userEvent.setup({ delay: null });
    await openLogin();

    await submit(user);

    expect(await screen.findByTestId("my-tickets-screen")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/tickets$/);
    expect(authApi.login).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });

  it("sends IT Staff to the Ticket Queue route", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(session(IT_STAFF));
    const user = userEvent.setup({ delay: null });
    await openLogin();

    await submit(user);

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/staff\/queue$/));
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
  });

  it("sends a must-change user to Change Password in forced mode", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(session(MUST_CHANGE));
    const user = userEvent.setup({ delay: null });
    await openLogin();

    await submit(user);

    expect(await screen.findByTestId("change-password-screen")).toHaveTextContent("Choose a new password");
    expect(screen.queryByTestId("nav-my-tickets")).not.toBeInTheDocument();
  });
});
