import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  BASE,
  apiSession,
  deactivate,
  freshPassword,
  pageCsrf,
  signIn,
  submitLogin,
  uniqueEmail,
} from "./helpers.js";

// E2E-06, E2E-07, and E2E-08 from docs/lab-03/tests.md section 2.13.
//
// Every user this file creates has an email unique to the run and is
// deactivated in `finally`; no seeded or earlier account is ever edited
// (tests.md section 1, "Users created by E2E tests").

const SEEDED_ADMIN = ACCOUNTS.admin.email;

/** Opens User Management and returns the desktop row for `email`. */
async function userRow(page: Page, email: string) {
  await page.goto(`${BASE}/admin/users`);
  await page.getByTestId("user-management-screen").waitFor();
  await page.getByTestId("field-search").fill(email);
  const row = page.getByTestId(`user-row-${email}`);
  await expect(row).toBeVisible({ timeout: 15000 });
  return row;
}

async function createThroughUi(page: Page, user: { fullName: string; email: string; role: string; password: string }) {
  await page.goto(`${BASE}/admin/users`);
  await page.getByTestId("btn-create-user").click();
  const dialog = page.getByTestId("user-dialog");
  await dialog.getByTestId("field-full-name").fill(user.fullName);
  await dialog.getByTestId("field-user-email").fill(user.email);
  await dialog.getByTestId("field-role").selectOption(user.role);
  await dialog.getByTestId("field-initial-password").fill(user.password);
  await dialog.getByTestId("btn-save-user").click();
  await expect(page.getByTestId("callout-success")).toContainText("User saved.");
  await expect(dialog).toHaveCount(0);
}

test("E2E-06: the Administrator creates an IT Staff user who must change the password, then sees the queue", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("staff");
  const initialPassword = freshPassword();
  const newcomer = await browser.newContext();
  try {
    await signIn(page, SEEDED_ADMIN);
    await createThroughUi(page, { fullName: "E2E Staff Member", email, role: "IT_STAFF", password: initialPassword });
    const row = await userRow(page, email);
    await expect(row.getByTestId("badge-role")).toHaveText("IT Staff");

    // First sign-in is held on Change Password (AC-52, BR-12).
    const staff = await newcomer.newPage();
    await signIn(staff, email, initialPassword);
    await expect(staff.getByTestId("change-password-screen")).toBeVisible();

    const chosen = freshPassword();
    await staff.getByTestId("field-current-password").fill(initialPassword);
    await staff.getByTestId("field-new-password").fill(chosen);
    await staff.getByTestId("field-confirm-password").fill(chosen);
    await staff.getByTestId("btn-save-password").click();
    await expect(staff.getByTestId("staff-queue-screen")).toBeVisible({ timeout: 15000 });
  } finally {
    await newcomer.close();
    const admin = await apiSession(SEEDED_ADMIN);
    try {
      await deactivate(admin, email);
    } finally {
      await admin.dispose();
    }
  }
});

test("E2E-07: edit, deactivate, reactivate, and a new initial password", async ({ page, browser }) => {
  const email = uniqueEmail("target");
  const admin = await apiSession(SEEDED_ADMIN);
  const target = await browser.newContext();
  try {
    // Setup through the API: the target exists and has already changed the
    // initial password, so mustChangePassword is false before the flow.
    const initial = freshPassword();
    const created = await admin.send("POST", "/admin/users", {
      fullName: "E2E Target User",
      email,
      role: "REQUESTER",
      isActive: true,
      initialPassword: initial,
    });
    expect(created.status, "creating the target").toBe(201);
    const own = await apiSession(email, initial);
    const chosen = freshPassword();
    const changed = await own.send("POST", "/auth/password", {
      currentPassword: initial,
      newPassword: chosen,
      confirmPassword: chosen,
    });
    await own.dispose();
    expect(changed.status, "the target's own password change").toBe(200);

    await signIn(page, SEEDED_ADMIN);

    // Edit the name (AC-54).
    await (await userRow(page, email)).getByRole("button", { name: "Edit E2E Target User" }).click();
    let dialog = page.getByTestId("user-dialog");
    await dialog.getByTestId("field-full-name").fill("E2E Target Renamed");
    await dialog.getByTestId("btn-save-user").click();
    await expect(page.getByTestId("callout-success")).toContainText("User saved.");
    await expect(await userRow(page, email)).toContainText("E2E Target Renamed");

    // Deactivate: the target cannot sign in (AC-55).
    await (await userRow(page, email)).getByRole("button", { name: "Edit E2E Target Renamed" }).click();
    dialog = page.getByTestId("user-dialog");
    await dialog.getByTestId("field-active").uncheck();
    await dialog.getByTestId("btn-save-user").click();
    await expect(page.getByTestId("callout-success")).toContainText("User saved.");
    await expect((await userRow(page, email)).getByTestId("badge-account-status")).toHaveText("Inactive");

    const targetPage = await target.newPage();
    await targetPage.goto(`${BASE}/login`);
    await submitLogin(targetPage, email, chosen);
    await expect(targetPage.getByTestId("callout-error")).toContainText(
      "This account is inactive. Contact your administrator.",
    );

    // Reactivate, then set a new initial password (AC-59).
    await (await userRow(page, email)).getByRole("button", { name: "Edit E2E Target Renamed" }).click();
    dialog = page.getByTestId("user-dialog");
    await dialog.getByTestId("field-active").check();
    await dialog.getByTestId("btn-save-user").click();
    await expect(page.getByTestId("callout-success")).toContainText("User saved.");
    await expect((await userRow(page, email)).getByTestId("badge-account-status")).toHaveText("Active");

    const reissued = freshPassword();
    await (await userRow(page, email)).getByRole("button", { name: "Edit E2E Target Renamed" }).click();
    await page.getByTestId("user-dialog").getByTestId("btn-set-initial-password").click();
    const confirm = page.getByTestId("confirm-dialog");
    await confirm.getByTestId("field-initial-password").fill(reissued);
    await confirm.getByTestId("btn-confirm").click();
    await expect(page.getByTestId("callout-success")).toContainText("Initial password set.");

    // The next sign-in requires a change.
    await submitLogin(targetPage, email, reissued);
    await expect(targetPage.getByTestId("change-password-screen")).toBeVisible({ timeout: 15000 });
  } finally {
    await target.close();
    try {
      await deactivate(admin, email);
    } finally {
      await admin.dispose();
    }
  }
});

test("E2E-08: last Administrator, self-deactivation, and IT Staff refused User Management", async ({ page, browser }) => {
  const secondAdmin = uniqueEmail("admin");
  const admin = await apiSession(SEEDED_ADMIN);
  const staffContext = await browser.newContext();
  let created = false;
  try {
    // (a) The seeded Administrator becomes the only active one. Leftovers from
    // an interrupted run are removed here, so the test is repeatable.
    const admins = (await admin.get("/admin/users?role=ADMINISTRATOR")) as {
      id: string;
      email: string;
      isActive: boolean;
    }[];
    for (const other of admins.filter((a) => a.isActive && a.email !== SEEDED_ADMIN)) {
      const result = await admin.send("PATCH", `/admin/users/${other.id}`, { isActive: false });
      expect(result.status, `deactivating leftover Administrator ${other.email}`).toBe(200);
    }

    await signIn(page, SEEDED_ADMIN);
    const me = ((await (await page.request.get(`${BASE}/api/v1/auth/me`)).json()) as { data: { user: { id: string } } })
      .data.user.id;

    // The UI does not offer self-deactivation: on the own row Role and Active
    // are disabled with the explanation (ui-spec 6.6, UI-41).
    await (await userRow(page, SEEDED_ADMIN)).getByRole("button", { name: /^Edit / }).click();
    const dialog = page.getByTestId("user-dialog");
    await expect(dialog.getByTestId("field-active")).toBeDisabled();
    await expect(dialog.getByTestId("field-role")).toBeDisabled();
    await expect(dialog).toContainText("You cannot change your own role or deactivate your own account.");
    await dialog.getByTestId("btn-dialog-cancel").click();

    // So the attempt goes through the Administrator's own browser session and
    // CSRF token, which is what a crafted request would use (tests.md #46 block).
    const attemptSelfDeactivation = async () => {
      const response = await page.request.patch(`${BASE}/api/v1/admin/users/${me}`, {
        headers: { "X-CSRF-Token": await pageCsrf(page) },
        data: { isActive: false },
      });
      return { status: response.status(), error: ((await response.json()) as { error: { code: string; message: string } }).error };
    };

    // Sole active Administrator: the last-Administrator rule is checked first (AC-57, BR-63).
    const sole = await attemptSelfDeactivation();
    expect(sole.status).toBe(409);
    expect(sole.error).toMatchObject({
      code: "LAST_ADMINISTRATOR",
      message: "At least one active Administrator must remain.",
    });

    // (b) A second Administrator, created through the UI.
    await createThroughUi(page, {
      fullName: "E2E Second Administrator",
      email: secondAdmin,
      role: "ADMINISTRATOR",
      password: freshPassword(),
    });
    created = true;
    await expect((await userRow(page, secondAdmin)).getByTestId("badge-role")).toHaveText("Administrator");

    // With two, the same attempt is refused as self-deactivation (AC-56).
    const withTwo = await attemptSelfDeactivation();
    expect(withTwo.status).toBe(409);
    expect(withTwo.error).toMatchObject({
      code: "CANNOT_DEACTIVATE_SELF",
      message: "You cannot deactivate your own account.",
    });
    await expect((await userRow(page, SEEDED_ADMIN)).getByTestId("badge-account-status")).toHaveText("Active");

    // IT Staff opening /admin/users see the forbidden state (AC-60).
    const staff = await staffContext.newPage();
    await signIn(staff, ACCOUNTS.staff.email);
    await staff.goto(`${BASE}/admin/users`);
    await expect(staff.getByTestId("state-forbidden")).toBeVisible();
    await expect(staff.getByTestId("users-table")).toHaveCount(0);
  } finally {
    await staffContext.close();
    try {
      // (c) No extra active Administrator is left behind.
      if (created) await deactivate(admin, secondAdmin);
    } finally {
      await admin.dispose();
    }
  }
});
