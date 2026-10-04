import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  BASE,
  apiSession,
  freshPassword,
  seedPassword,
  signIn,
  signOut,
  submitLogin,
  userIdByEmail,
} from "./helpers.js";

// E2E-01 and E2E-02 from docs/lab-03/tests.md section 2.13.
//
// Journeys run at desktop only: playwright.config.ts keeps the Lab 3 journey
// specs out of the tablet and mobile projects, so nothing here is skipped.
// Layout at every width is #47's responsive suite.

test("E2E-01: invalid, inactive, and valid sign-in, then logout guards /tickets", async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByTestId("login-screen").waitFor();

  // A wrong password names neither field (AC-05, BR-07).
  await submitLogin(page, ACCOUNTS.requester.email, "not-the-right-password");
  await expect(page.getByTestId("callout-error")).toContainText("The email or password is incorrect.");
  await expect(page.getByTestId("field-password")).toHaveValue("");

  // The inactive message only after the password verified (AC-06, BR-08).
  await submitLogin(page, ACCOUNTS.inactiveRequester.email);
  await expect(page.getByTestId("callout-error")).toContainText("This account is inactive. Contact your administrator.");
  await expect(page.getByTestId("app-shell")).toHaveCount(0);

  // A valid login shows the shell with name and role (AC-01).
  await submitLogin(page, ACCOUNTS.requester.email);
  await page.getByTestId("my-tickets-screen").waitFor();
  await expect(page.getByTestId("shell-user-name")).toHaveText(ACCOUNTS.requester.fullName);
  await expect(page.getByTestId("app-shell").getByTestId("badge-role")).toHaveText("Requester");

  // After logout a typed URL shows Login, not the list (AC-08).
  await signOut(page);
  await page.goto(`${BASE}/tickets`);
  await expect(page.getByTestId("login-screen")).toBeVisible();
  await expect(page.getByTestId("my-tickets-screen")).toHaveCount(0);
  expect((await page.request.get(`${BASE}/api/v1/tickets`)).status()).toBe(401);
});

test("E2E-02: the must-change account is held on Change Password, then lands on My Tickets", async ({ page }) => {
  const newPassword = freshPassword();
  try {
    await signIn(page, ACCOUNTS.mustChange.email);
    await expect(page.getByTestId("change-password-screen")).toBeVisible();

    // Held: any other route still shows Change Password (AC-02).
    await page.goto(`${BASE}/tickets`);
    await expect(page.getByTestId("change-password-screen")).toBeVisible();
    await expect(page.getByTestId("my-tickets-screen")).toHaveCount(0);

    await page.getByTestId("field-current-password").fill(seedPassword());
    await page.getByTestId("field-new-password").fill(newPassword);
    await page.getByTestId("field-confirm-password").fill(newPassword);
    await page.getByTestId("btn-save-password").click();

    await expect(page.getByTestId("my-tickets-screen")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("shell-user-name")).toHaveText(ACCOUNTS.mustChange.fullName);
  } finally {
    // Puts the fixture back as the seed leaves it: the seed password with
    // mustChangePassword true (POST /admin/users/{id}/initial-password,
    // api-spec 7.4), so the next run starts from the same state.
    const admin = await apiSession(ACCOUNTS.admin.email);
    try {
      const id = await userIdByEmail(admin, ACCOUNTS.mustChange.email);
      const reset = await admin.send("POST", `/admin/users/${id}/initial-password`, {
        initialPassword: seedPassword(),
      });
      expect(reset.status, "restoring the must-change fixture").toBe(200);
    } finally {
      await admin.dispose();
    }
  }
});
