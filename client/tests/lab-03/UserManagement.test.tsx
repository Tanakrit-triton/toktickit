import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUser } from "../../src/lab-03/auth-api.js";
import { ADMINISTRATOR, IT_STAFF, REQUESTER, mockStartupSession, renderApp } from "./helpers.js";
import { created, failure, fakeApi, ok } from "./ticket-fixtures.js";

// UI-39 to UI-44 from docs/lab-03/tests.md section 2.10: User Management,
// ui-spec.md section 6.6, against api-spec.md section 7.

const USERS_PATH = "/admin/users";
const T0 = "2026-09-01T13:24:07.512Z";

/** AdminUser, api-spec.md 7. */
function adminUser(user: Pick<CurrentUser, "id" | "fullName" | "email" | "role">, overrides: Record<string, unknown> = {}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: true,
    mustChangePassword: false,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

const INACTIVE = adminUser(
  { id: "ffffffff-0000-0000-0000-000000000006", fullName: "Kittipong Saelim", email: "kittipong.sae@kmutt.ac.th", role: "IT_STAFF" },
  { isActive: false },
);
const SELF = adminUser(ADMINISTRATOR);
const STAFF = adminUser(IT_STAFF);
const REQ = adminUser(REQUESTER);

/** Sorted by fullName, as the server returns them (BR-66). */
const ALL_USERS = [INACTIVE, REQ, SELF, STAFF];

async function openUsers(api: ReturnType<typeof fakeApi>) {
  mockStartupSession(ADMINISTRATOR);
  renderApp(USERS_PATH);
  await screen.findByTestId("user-management-screen");
  return api;
}

async function openPopulated(users: unknown[] = ALL_USERS, extra: Parameters<typeof fakeApi>[0] = {}) {
  const api = await openUsers(fakeApi({ "GET /admin/users": ok(users), ...extra }));
  await screen.findByTestId(`user-row-${STAFF.email}`);
  return api;
}

/** The parameters of every GET /admin/users so far, oldest first. */
function listRequests(api: ReturnType<typeof fakeApi>): Record<string, string>[] {
  return api.calls
    .filter((c) => c.method === "GET" && c.path.split("?")[0] === "/admin/users")
    .map((c) => Object.fromEntries(new URLSearchParams(c.path.split("?")[1] ?? "")));
}

async function expectLastRequest(api: ReturnType<typeof fakeApi>, expected: Record<string, string>) {
  await waitFor(
    () => {
      const requests = listRequests(api);
      expect(requests[requests.length - 1]).toEqual(expected);
    },
    { timeout: 2000 },
  );
}

async function openEdit(user: { fullName: string }) {
  await userEvent.click(screen.getByRole("button", { name: `Edit ${user.fullName}` }));
  return screen.findByTestId("user-dialog");
}

async function fillCreate(values: { fullName?: string; email?: string; role?: string; initialPassword?: string }) {
  const dialog = await screen.findByTestId("user-dialog");
  const d = within(dialog);
  if (values.fullName !== undefined) await userEvent.type(d.getByTestId("field-full-name"), values.fullName);
  if (values.email !== undefined) await userEvent.type(d.getByTestId("field-user-email"), values.email);
  if (values.role !== undefined) await userEvent.selectOptions(d.getByTestId("field-role"), values.role);
  if (values.initialPassword !== undefined)
    await userEvent.type(d.getByTestId("field-initial-password"), values.initialPassword);
  return dialog;
}

const NO_CODES = /\b(403|404|409|422|500)\b|EMAIL_ALREADY_EXISTS|LAST_ADMINISTRATOR|USER_HAS_OPEN_TICKETS|CANNOT_|INTERNAL_ERROR|FORBIDDEN/;

function setViewport(isMobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isMobile && query.includes("max-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.matchMedia = originalMatchMedia;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = originalMatchMedia;
});

describe("UI-39 (AC-51) - user list", () => {
  it("lists every user with Name, Email, Role badge, Status badge, and Edit", async () => {
    await openPopulated();

    expect(screen.getByRole("heading", { level: 1, name: "User Management" })).toBeInTheDocument();
    const table = screen.getByTestId("users-table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent?.trim());
    expect(headers).toEqual(["Name", "Email", "Role", "Status", "Actions"]);

    for (const u of ALL_USERS) {
      const row = screen.getByTestId(`user-row-${u.email}`);
      expect(row).toHaveTextContent(u.fullName);
      expect(row).toHaveTextContent(u.email);
      expect(within(row).getByTestId("badge-role")).toHaveAttribute("data-role", u.role);
      expect(within(row).getByTestId("badge-account-status")).toHaveTextContent(u.isActive ? "Active" : "Inactive");
      const edit = within(row).getByRole("button", { name: `Edit ${u.fullName}` });
      expect(edit).toHaveTextContent("Edit");
      expect(edit).toHaveClass("zg-btn--tertiary");
    }

    // The server's order is kept.
    const names = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.getAttribute("data-testid"));
    expect(names).toEqual(ALL_USERS.map((u) => `user-row-${u.email}`));
  });

  it("marks only the signed-in Administrator's own row with (you)", async () => {
    await openPopulated();

    expect(screen.getByTestId(`user-row-${SELF.email}`)).toHaveTextContent(`${SELF.fullName} (you)`);
    for (const u of [INACTIVE, REQ, STAFF]) {
      expect(screen.getByTestId(`user-row-${u.email}`)).not.toHaveTextContent("(you)");
    }
  });

  it("requests the list with no parameters by default", async () => {
    const api = await openPopulated();
    await expectLastRequest(api, {});
  });

  it("sends the trimmed search as q after the debounce", async () => {
    const api = await openPopulated();

    const search = screen.getByTestId("field-search");
    expect(search).toHaveAttribute("placeholder", "Search name or email");
    await userEvent.type(search, "  wichai ");
    await expectLastRequest(api, { q: "wichai" });
  });

  it("offers All roles and the three roles, sends role, and combines it with q", async () => {
    const api = await openPopulated();

    const filter = screen.getByTestId("filter-role");
    expect(within(filter).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All roles",
      "Requester",
      "IT Staff",
      "Administrator",
    ]);

    await userEvent.selectOptions(filter, "IT_STAFF");
    await expectLastRequest(api, { role: "IT_STAFF" });

    await userEvent.type(screen.getByTestId("field-search"), "kmutt");
    await expectLastRequest(api, { q: "kmutt", role: "IT_STAFF" });

    await userEvent.selectOptions(filter, "");
    await expectLastRequest(api, { q: "kmutt" });
  });

  it("offers Create user as the screen's primary button", async () => {
    await openPopulated();
    const create = screen.getByTestId("btn-create-user");
    expect(create).toHaveTextContent("Create user");
    expect(create).toHaveClass("zg-btn--primary");
  });
});

describe("UI-40 (AC-52, AC-53) - create dialog", () => {
  it("opens an empty dialog with Active checked and the initial-password helper", async () => {
    await openPopulated();
    await userEvent.click(screen.getByTestId("btn-create-user"));

    const dialog = await screen.findByTestId("user-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const d = within(dialog);
    expect(d.getByTestId("field-full-name")).toHaveValue("");
    expect(d.getByTestId("field-user-email")).toHaveValue("");
    expect(d.getByTestId("field-active")).toBeChecked();
    expect(d.getByTestId("field-initial-password")).toHaveValue("");
    expect(dialog).toHaveTextContent("12–128 characters. The user must change it at first sign-in.");
    expect(d.queryByTestId("btn-set-initial-password")).not.toBeInTheDocument();
    expect(within(d.getByTestId("field-role")).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(
      expect.arrayContaining(["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]),
    );
  });

  it("blocks an empty submit with a message below each required field and sends nothing", async () => {
    const api = await openPopulated();
    await userEvent.click(screen.getByTestId("btn-create-user"));
    const dialog = await screen.findByTestId("user-dialog");

    await userEvent.click(within(dialog).getByTestId("btn-save-user"));

    for (const id of ["full-name", "user-email", "role", "initial-password"]) {
      const field = within(dialog).getByTestId(`field-${id}`);
      const error = within(dialog).getByTestId(`error-${id}`);
      expect(error.textContent).not.toBe("");
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field.getAttribute("aria-describedby")).toContain(error.id);
    }
    expect(within(dialog).getByTestId("field-full-name")).toHaveFocus();
    expect(api.writes()).toEqual([]);
  });

  it("blocks a 1-character name, an invalid email, and an 11-code-point password", async () => {
    const api = await openPopulated();
    await userEvent.click(screen.getByTestId("btn-create-user"));
    // Ten letters plus an emoji: 12 UTF-16 units but 11 code points (BR-11).
    const dialog = await fillCreate({ fullName: "M", email: "not-an-email", role: "IT_STAFF", initialPassword: "abcdefghij😀" });

    await userEvent.click(within(dialog).getByTestId("btn-save-user"));

    expect(within(dialog).getByTestId("error-full-name")).toHaveTextContent("Full name must be at least 2 characters.");
    expect(within(dialog).getByTestId("error-user-email")).toHaveTextContent("Enter an email address in the form name@example.com.");
    expect(within(dialog).getByTestId("error-initial-password")).toHaveTextContent("Password must be 12–128 characters.");
    expect(within(dialog).queryByTestId("error-role")).not.toBeInTheDocument();
    expect(api.writes()).toEqual([]);
  });

  it("shows a server EMAIL_ALREADY_EXISTS below Email and keeps the dialog and input", async () => {
    const api = await openPopulated(ALL_USERS, {
      "POST /admin/users": failure(409, "EMAIL_ALREADY_EXISTS", "This email is already used by another user."),
    });
    await userEvent.click(screen.getByTestId("btn-create-user"));
    const dialog = await fillCreate({
      fullName: "Malee Srisuk",
      email: "WICHAI.PRA@kmutt.ac.th",
      role: "IT_STAFF",
      initialPassword: "correct horse battery",
    });

    await userEvent.click(within(dialog).getByTestId("btn-save-user"));

    const error = await within(dialog).findByTestId("error-user-email");
    expect(error).toHaveTextContent("This email is already used by another user.");
    expect(within(dialog).getByTestId("field-user-email")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByTestId("field-user-email")).toHaveValue("WICHAI.PRA@kmutt.ac.th");
    expect(within(dialog).getByTestId("field-full-name")).toHaveValue("Malee Srisuk");
    expect(within(dialog).queryByTestId("callout-conflict")).not.toBeInTheDocument();
    expect(screen.queryByTestId("callout-success")).not.toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(NO_CODES);
    expect(api.callsTo("POST", "/admin/users")).toHaveLength(1);
  });

  it("shows 422 details below their fields", async () => {
    await openPopulated(ALL_USERS, {
      "POST /admin/users": {
        status: 422,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "One or more fields are invalid.",
            details: { fullName: "Full name must be 100 characters or fewer.", initialPassword: "Password must be 12–128 characters." },
          },
        },
      },
    });
    await userEvent.click(screen.getByTestId("btn-create-user"));
    const dialog = await fillCreate({
      fullName: "Malee Srisuk",
      email: "malee.sri@kmutt.ac.th",
      role: "IT_STAFF",
      initialPassword: "correct horse battery",
    });

    await userEvent.click(within(dialog).getByTestId("btn-save-user"));

    expect(await within(dialog).findByTestId("error-full-name")).toHaveTextContent("Full name must be 100 characters or fewer.");
    expect(within(dialog).getByTestId("error-initial-password")).toHaveTextContent("Password must be 12–128 characters.");
    expect(dialog.textContent).not.toMatch(NO_CODES);
  });

  it("on success sends the documented body, closes, refreshes the list, and shows User saved.", async () => {
    const malee = adminUser(
      { id: "99999999-0000-4000-8000-000000000009", fullName: "Malee Srisuk", email: "malee.sri@kmutt.ac.th", role: "IT_STAFF" },
      { mustChangePassword: true },
    );
    const api = await openPopulated(ALL_USERS, {
      "POST /admin/users": () => {
        api.routes["GET /admin/users"] = ok([INACTIVE, malee, REQ, SELF, STAFF]);
        return created(malee);
      },
    });
    await userEvent.click(screen.getByTestId("btn-create-user"));
    // The password is sent exactly as typed: never trimmed (BR-11).
    const dialog = await fillCreate({
      fullName: "  Malee Srisuk ",
      email: "malee.sri@kmutt.ac.th",
      role: "IT_STAFF",
      initialPassword: " correct horse battery ",
    });

    await userEvent.click(within(dialog).getByTestId("btn-save-user"));

    await waitFor(() => expect(screen.queryByTestId("user-dialog")).not.toBeInTheDocument());
    expect(api.callsTo("POST", "/admin/users")[0].body).toEqual({
      fullName: "Malee Srisuk",
      email: "malee.sri@kmutt.ac.th",
      role: "IT_STAFF",
      isActive: true,
      initialPassword: " correct horse battery ",
    });
    expect(await screen.findByTestId("callout-success")).toHaveTextContent("User saved.");
    expect(await screen.findByTestId(`user-row-${malee.email}`)).toBeInTheDocument();
    expect(listRequests(api).length).toBeGreaterThanOrEqual(2);
  });

  it("shows Saving… on Save while the request is in flight", async () => {
    let release: () => void = () => {};
    await openPopulated(ALL_USERS, {
      "POST /admin/users": () =>
        new Promise((resolve) => {
          release = () => resolve(created(STAFF));
        }),
    });
    await userEvent.click(screen.getByTestId("btn-create-user"));
    const dialog = await fillCreate({
      fullName: "Malee Srisuk",
      email: "malee.sri@kmutt.ac.th",
      role: "IT_STAFF",
      initialPassword: "correct horse battery",
    });

    const save = within(dialog).getByTestId("btn-save-user");
    expect(save).toHaveClass("zg-btn--primary");
    await userEvent.click(save);
    await waitFor(() => expect(save).toHaveTextContent("Saving…"));
    expect(save).toBeDisabled();
    release();
    await waitFor(() => expect(screen.queryByTestId("user-dialog")).not.toBeInTheDocument());
  });
});

describe("UI-41 (AC-54, AC-56) - edit dialog", () => {
  it("prefills the fields and shows no initial-password field", async () => {
    await openPopulated();
    const dialog = await openEdit(STAFF);
    const d = within(dialog);

    expect(d.getByTestId("field-full-name")).toHaveValue(STAFF.fullName);
    expect(d.getByTestId("field-user-email")).toHaveValue(STAFF.email);
    expect(d.getByTestId("field-role")).toHaveValue("IT_STAFF");
    expect(d.getByTestId("field-active")).toBeChecked();
    expect(d.queryByTestId("field-initial-password")).not.toBeInTheDocument();
    expect(d.getByTestId("btn-set-initial-password")).toHaveClass("zg-btn--secondary");
  });

  it("prefills an inactive user's Active as unchecked", async () => {
    await openPopulated();
    const dialog = await openEdit(INACTIVE);
    expect(within(dialog).getByTestId("field-active")).not.toBeChecked();
  });

  it("sends only the changed name, then closes, refreshes, and shows User saved.", async () => {
    const api = await openPopulated(ALL_USERS, {
      [`PATCH /admin/users/${STAFF.id}`]: ok({ ...STAFF, fullName: "Wichai Prasertsuk" }),
    });
    const dialog = await openEdit(STAFF);
    const name = within(dialog).getByTestId("field-full-name");
    await userEvent.clear(name);
    await userEvent.type(name, "Wichai Prasertsuk");

    await userEvent.click(within(dialog).getByTestId("btn-save-user"));

    await waitFor(() => expect(screen.queryByTestId("user-dialog")).not.toBeInTheDocument());
    expect(api.callsTo("PATCH", `/admin/users/${STAFF.id}`).map((c) => c.body)).toEqual([{ fullName: "Wichai Prasertsuk" }]);
    expect(await screen.findByTestId("callout-success")).toHaveTextContent("User saved.");
    expect(listRequests(api).length).toBeGreaterThanOrEqual(2);
  });

  it("sends only role and isActive when only they change", async () => {
    const api = await openPopulated(ALL_USERS, {
      [`PATCH /admin/users/${STAFF.id}`]: ok({ ...STAFF, role: "REQUESTER", isActive: false }),
    });
    const dialog = await openEdit(STAFF);
    await userEvent.selectOptions(within(dialog).getByTestId("field-role"), "REQUESTER");
    await userEvent.click(within(dialog).getByTestId("field-active"));

    await userEvent.click(within(dialog).getByTestId("btn-save-user"));

    await waitFor(() => expect(api.callsTo("PATCH", `/admin/users/${STAFF.id}`)).toHaveLength(1));
    expect(api.callsTo("PATCH", `/admin/users/${STAFF.id}`)[0].body).toEqual({ role: "REQUESTER", isActive: false });
  });

  it("on the own row disables Role and Active with the explanation, and keeps Name editable", async () => {
    await openPopulated();
    const dialog = await openEdit(SELF);
    const d = within(dialog);

    const explanation = d.getByText("You cannot change your own role or deactivate your own account.");
    for (const id of ["field-role", "field-active"]) {
      const field = d.getByTestId(id);
      expect(field).toBeDisabled();
      expect(field.getAttribute("aria-describedby")).toContain(explanation.id);
    }
    expect(explanation.id).not.toBe("");
    expect(d.getByTestId("field-full-name")).toBeEnabled();
    expect(d.getByTestId("field-user-email")).toBeEnabled();
  });

  it("leaves Role and Active enabled on another user's row, with no explanation", async () => {
    await openPopulated();
    const dialog = await openEdit(STAFF);
    expect(within(dialog).getByTestId("field-role")).toBeEnabled();
    expect(within(dialog).getByTestId("field-active")).toBeEnabled();
    expect(dialog).not.toHaveTextContent("You cannot change your own role");
  });

  it("closes on Cancel and on Escape without a request", async () => {
    const api = await openPopulated();
    let dialog = await openEdit(STAFF);
    await userEvent.click(within(dialog).getByTestId("btn-dialog-cancel"));
    expect(screen.queryByTestId("user-dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Edit ${STAFF.fullName}` })).toHaveFocus();

    dialog = await openEdit(STAFF);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("user-dialog")).not.toBeInTheDocument();
    expect(api.writes()).toEqual([]);
  });
});

describe("UI-42 (AC-55) - set new initial password", () => {
  async function openConfirm() {
    const dialog = await openEdit(STAFF);
    await userEvent.click(within(dialog).getByTestId("btn-set-initial-password"));
    return screen.findByTestId("confirm-dialog");
  }

  it("opens a confirmation dialog with a password field and sends nothing before confirm", async () => {
    const api = await openPopulated();
    const confirm = await openConfirm();

    expect(confirm).toHaveAttribute("role", "dialog");
    expect(confirm).toHaveTextContent(`Set a new initial password for ${STAFF.fullName}?`);
    expect(confirm).toHaveTextContent("They will be signed out and must change it at next login.");
    expect(within(confirm).getByTestId("field-initial-password")).toHaveAttribute("type", "password");
    expect(within(confirm).getByTestId("btn-confirm")).toHaveTextContent("Set password");
    expect(within(confirm).getByTestId("btn-confirm")).toHaveClass("zg-btn--primary");
    expect(api.writes()).toEqual([]);
  });

  it.each([
    ["empty", "", "Enter an initial password."],
    ["11 code points", "abcdefghij😀", "Password must be 12–128 characters."],
  ])("blocks an %s password below the field with no request", async (_label, typed, message) => {
    const api = await openPopulated();
    const confirm = await openConfirm();

    if (typed !== "") await userEvent.type(within(confirm).getByTestId("field-initial-password"), typed);
    await userEvent.click(within(confirm).getByTestId("btn-confirm"));

    expect(within(confirm).getByTestId("error-initial-password")).toHaveTextContent(message);
    expect(within(confirm).getByTestId("field-initial-password")).toHaveAttribute("aria-invalid", "true");
    expect(api.writes()).toEqual([]);
  });

  it("on success sends the password untrimmed, closes both dialogs, and shows Initial password set.", async () => {
    const api = await openPopulated(ALL_USERS, {
      [`POST /admin/users/${STAFF.id}/initial-password`]: ok({ ...STAFF, mustChangePassword: true }),
    });
    const confirm = await openConfirm();

    await userEvent.type(within(confirm).getByTestId("field-initial-password"), " new initial pass ");
    await userEvent.click(within(confirm).getByTestId("btn-confirm"));

    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
    expect(screen.queryByTestId("user-dialog")).not.toBeInTheDocument();
    expect(api.callsTo("POST", `/admin/users/${STAFF.id}/initial-password`).map((c) => c.body)).toEqual([
      { initialPassword: " new initial pass " },
    ]);
    expect(await screen.findByTestId("callout-success")).toHaveTextContent("Initial password set.");
  });

  it("shows a 422 details.initialPassword below the field", async () => {
    await openPopulated(ALL_USERS, {
      [`POST /admin/users/${STAFF.id}/initial-password`]: {
        status: 422,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "One or more fields are invalid.",
            details: { initialPassword: "Password must be 12–128 characters." },
          },
        },
      },
    });
    const confirm = await openConfirm();

    await userEvent.type(within(confirm).getByTestId("field-initial-password"), "long enough password");
    await userEvent.click(within(confirm).getByTestId("btn-confirm"));

    expect(await within(confirm).findByTestId("error-initial-password")).toHaveTextContent("Password must be 12–128 characters.");
    expect(screen.queryByTestId("callout-success")).not.toBeInTheDocument();
  });

  it("Cancel sends nothing and returns focus to Set new initial password", async () => {
    const api = await openPopulated();
    const confirm = await openConfirm();

    await userEvent.click(within(confirm).getByTestId("btn-dialog-cancel"));

    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("user-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("btn-set-initial-password")).toHaveFocus();
    expect(api.writes()).toEqual([]);
  });
});

describe("UI-43 (AC-57, AC-58, AC-68) - safety conflicts", () => {
  it.each([
    ["LAST_ADMINISTRATOR", "At least one active Administrator must remain."],
    ["USER_HAS_OPEN_TICKETS", "This user owns 2 open tickets. Reassign them first."],
  ])("renders %s as a conflict callout inside the dialog with input kept", async (code, message) => {
    await openPopulated(ALL_USERS, { [`PATCH /admin/users/${STAFF.id}`]: failure(409, code, message) });
    const dialog = await openEdit(STAFF);
    await userEvent.selectOptions(within(dialog).getByTestId("field-role"), "REQUESTER");
    await userEvent.click(within(dialog).getByTestId("field-active"));

    await userEvent.click(within(dialog).getByTestId("btn-save-user"));

    const callout = await within(dialog).findByTestId("callout-conflict");
    expect(callout).toHaveTextContent(message);
    expect(callout.textContent).not.toMatch(NO_CODES);
    expect(screen.getByTestId("user-dialog")).toBeInTheDocument();
    expect(within(dialog).getByTestId("field-role")).toHaveValue("REQUESTER");
    expect(within(dialog).getByTestId("field-active")).not.toBeChecked();
    expect(screen.queryByTestId("callout-success")).not.toBeInTheDocument();
  });

  it("shows a safe error inside the dialog for an unexpected failure, with input kept", async () => {
    await openPopulated(ALL_USERS, {
      [`PATCH /admin/users/${STAFF.id}`]: failure(500, "INTERNAL_ERROR", "db exploded at /srv/app"),
    });
    const dialog = await openEdit(STAFF);
    const name = within(dialog).getByTestId("field-full-name");
    await userEvent.clear(name);
    await userEvent.type(name, "Wichai P.");

    await userEvent.click(within(dialog).getByTestId("btn-save-user"));

    const callout = await within(dialog).findByTestId("callout-error");
    expect(callout).toHaveTextContent("Something went wrong. Try again.");
    expect(dialog.textContent).not.toMatch(NO_CODES);
    expect(dialog).not.toHaveTextContent("/srv/app");
    expect(name).toHaveValue("Wichai P.");
  });
});

describe("UI-44 (AC-51, AC-60, AC-68) - user list states", () => {
  it("shows the loading state until the list arrives", async () => {
    let release: () => void = () => {};
    await openUsers(
      fakeApi({
        "GET /admin/users": () =>
          new Promise((resolve) => {
            release = () => resolve(ok(ALL_USERS));
          }),
      }),
    );

    expect(await screen.findByTestId("state-loading")).toBeInTheDocument();
    release();
    await screen.findByTestId(`user-row-${STAFF.email}`);
    expect(screen.queryByTestId("state-loading")).not.toBeInTheDocument();
  });

  it("shows no-results with a Clear that resets search and role", async () => {
    const api = await openPopulated(ALL_USERS);
    api.routes["GET /admin/users"] = ok([]);

    await userEvent.selectOptions(screen.getByTestId("filter-role"), "ADMINISTRATOR");
    await userEvent.type(screen.getByTestId("field-search"), "nobody");
    const state = await screen.findByTestId("state-no-results", {}, { timeout: 2000 });
    expect(state).toHaveTextContent("No users match your search.");
    expect(screen.queryByTestId("users-table")).not.toBeInTheDocument();

    const clear = within(state).getByRole("button", { name: "Clear" });
    expect(clear).toHaveClass("zg-btn--secondary");
    api.routes["GET /admin/users"] = ok(ALL_USERS);
    await userEvent.click(clear);

    await expectLastRequest(api, {});
    expect(screen.getByTestId("field-search")).toHaveValue("");
    expect(screen.getByTestId("filter-role")).toHaveValue("");
    await screen.findByTestId(`user-row-${STAFF.email}`);
  });

  it("shows a safe failure with Retry, which reloads the list", async () => {
    const api = await openUsers(
      fakeApi({ "GET /admin/users": failure(500, "INTERNAL_ERROR", "db exploded at /srv/app") }),
    );

    const failed = await screen.findByTestId("state-list-failed");
    expect(failed).toHaveTextContent("Something went wrong. Try again.");
    expect(failed.textContent).not.toMatch(NO_CODES);
    expect(failed).not.toHaveTextContent("/srv/app");
    expect(screen.queryByTestId("state-no-results")).not.toBeInTheDocument();

    api.routes["GET /admin/users"] = ok(ALL_USERS);
    await userEvent.click(within(failed).getByTestId("btn-retry"));
    await screen.findByTestId(`user-row-${STAFF.email}`);
    expect(screen.queryByTestId("state-list-failed")).not.toBeInTheDocument();
  });

  it("shows the forbidden state when the API refuses, with no Retry and no Create user", async () => {
    await openUsers(fakeApi({ "GET /admin/users": failure(403, "FORBIDDEN", "You do not have permission to do this.") }));

    const forbidden = await screen.findByTestId("state-forbidden");
    expect(forbidden).toHaveTextContent("You do not have access to this page.");
    expect(forbidden.textContent).not.toMatch(NO_CODES);
    expect(screen.queryByTestId("btn-retry")).not.toBeInTheDocument();
    expect(screen.queryByTestId("btn-create-user")).not.toBeInTheDocument();
  });

  it("renders cards and no table below 768px", async () => {
    setViewport(true);
    await openUsers(fakeApi({ "GET /admin/users": ok(ALL_USERS) }));

    const card = await screen.findByTestId(`user-card-${STAFF.email}`);
    expect(card).toHaveTextContent(STAFF.fullName);
    expect(card).toHaveTextContent(STAFF.email);
    expect(within(card).getByTestId("badge-role")).toHaveAttribute("data-role", "IT_STAFF");
    expect(within(card).getByTestId("badge-account-status")).toHaveTextContent("Active");
    expect(within(card).getByRole("button", { name: `Edit ${STAFF.fullName}` })).toBeInTheDocument();
    expect(screen.getByTestId(`user-card-${SELF.email}`)).toHaveTextContent("(you)");
    expect(screen.queryByTestId("users-table")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a table and no cards at desktop", async () => {
    setViewport(false);
    await openPopulated();
    expect(screen.getByTestId("users-table")).toBeInTheDocument();
    expect(screen.queryByTestId(`user-card-${STAFF.email}`)).not.toBeInTheDocument();
  });
});
