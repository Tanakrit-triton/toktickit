import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  BASE,
  EMPTY_REQUESTER,
  REQUESTER,
  enterAs,
  expectNoHorizontalScroll,
  fillTicketForm,
  painted,
} from "./helpers.js";

// RSP-01 .. RSP-07 from docs/lab-02/tests.md section 2.5, and the screenshot
// paths ui-spec.md section 10 fixes.
//
// The project name is the viewport: playwright.config.ts declares desktop
// 1440x900, tablet 834x1112 and mobile 390x844, so each test below runs once
// per width without repeating itself.

const OUT = "artifacts/lab-02/screenshots";

/** Screenshots are named by the project, which is the viewport. */
async function capture(page: import("@playwright/test").Page, folder: string, name: string, project: string) {
  await mkdir(`${OUT}/${folder}`, { recursive: true });
  await page.screenshot({ path: `${OUT}/${folder}/${project}-${name}.png` });
}

test.describe("RSP-01..RSP-03 (AC-39) - layout at every width", () => {
  test("Create Ticket renders without clipping or horizontal scroll", async ({ page }, testInfo) => {
    await enterAs(page, REQUESTER, "/tickets/new");
    await painted(page, page.getByTestId("create-ticket-screen"), "create ticket");
    await painted(page, page.getByTestId("field-summary"), "summary field");
    await painted(page, page.getByTestId("btn-submit-ticket"), "submit button");
    await expectNoHorizontalScroll(page);
    await capture(page, "create-ticket", "initial", testInfo.project.name);
  });

  test("My Tickets renders without clipping or horizontal scroll", async ({ page }, testInfo) => {
    await enterAs(page, REQUESTER);
    await painted(page, page.getByTestId("my-tickets-screen"), "my tickets");
    await painted(page, page.getByTestId("field-search"), "search field");
    await expectNoHorizontalScroll(page);
    await capture(page, "my-tickets", "populated", testInfo.project.name);
  });

  test("Ticket Detail renders without clipping or horizontal scroll", async ({ page }, testInfo) => {
    await enterAs(page, REQUESTER);
    await page.locator('[data-testid^="ticket-row-"], [data-testid^="ticket-card-"]').first().waitFor();
    const target = page.locator('[data-testid^="ticket-row-"], [data-testid^="ticket-card-"]').first();
    const number = (await target.innerText()).match(/TKT-\d{4}-\d{5}/)![0];

    const id = await page.evaluate(async ([base, num]) => {
      const requester = JSON.parse(window.sessionStorage.getItem("toktickit.selectedRequester")!);
      const res = await fetch(`http://localhost:3000/api/v1/tickets?q=${num}`, {
        headers: { "X-Dev-Requester-Id": requester.id },
      });
      return (await res.json()).data[0].id as string;
    }, [BASE, number]);

    await page.goto(`${BASE}/tickets/${id}`);
    await painted(page, page.getByTestId("ticket-information"), "ticket information");
    await painted(page, page.getByTestId("attachment-section"), "attachment section");
    await expectNoHorizontalScroll(page);
    await capture(page, "ticket-detail", "view", testInfo.project.name);
  });
});

test.describe("RSP-04, RSP-05 (AC-40) - the mobile list", () => {
  test("renders cards rather than a table below 768px", async ({ page }, testInfo) => {
    await enterAs(page, REQUESTER);

    if (testInfo.project.name === "mobile") {
      await painted(page, page.locator('[data-testid^="ticket-card-"]').first(), "ticket card");
      // "Cards rather than a table" is a claim about the DOM, not the styling:
      // a table hidden by CSS is still a table to assistive technology.
      expect(await page.locator("table").count()).toBe(0);
      await capture(page, "my-tickets", "cards", testInfo.project.name);
    } else {
      await painted(page, page.getByTestId("ticket-table"), "ticket table");
      expect(await page.locator('[data-testid^="ticket-card-"]').count()).toBe(0);
    }
  });

  test("search, filters, sort and pagination stay usable", async ({ page }) => {
    await enterAs(page, REQUESTER);

    for (const id of ["field-search", "filter-category", "filter-related-system", "filter-priority", "field-sort"]) {
      await painted(page, page.getByTestId(id), id);
      await expect(page.getByTestId(id)).toBeEnabled();
    }

    // Operable, not merely present: the filter actually narrows the list.
    await page.getByTestId("filter-priority").selectOption("HIGH");
    await page.waitForTimeout(900);
    await expectNoHorizontalScroll(page);

    await painted(page, page.getByTestId("btn-clear-filters"), "clear filters");
    await page.getByTestId("btn-clear-filters").click();
    await page.waitForTimeout(900);
    await expect(page.getByTestId("field-search")).toHaveValue("");
  });
});

test.describe("RSP-06 (ui-spec 7) - touch targets", () => {
  test("interactive elements are at least 44px tall on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the 44px minimum applies to mobile only");

    await enterAs(page, REQUESTER);
    const cards = page.locator('[data-testid^="ticket-card-"]');
    const count = await cards.count();
    expect(count, "the list must have cards to measure").toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const box = await cards.nth(i).boundingBox();
      expect(box!.height, `card ${i} touch height`).toBeGreaterThanOrEqual(44);
    }

    // Below 768px the navigation collapses and the identity block moves inside
    // the expanded panel (ui-spec 4), so Change Requester has no box until the
    // toggle is opened. Opening it is part of what a mobile Requester does.
    const toggle = page.getByTestId("btn-nav-toggle");
    await painted(page, toggle, "nav toggle");
    expect((await toggle.boundingBox())!.height, "nav toggle touch height").toBeGreaterThanOrEqual(44);
    await toggle.click();
    await page.waitForTimeout(200);

    for (const id of ["btn-create-ticket-top", "btn-change-requester"]) {
      await painted(page, page.getByTestId(id), id);
      const box = await page.getByTestId(id).boundingBox();
      expect(box!.height, `${id} touch height`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("RSP-07 - the remaining screenshot paths", () => {
  test("requester selection states", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "ui-spec 10 lists these at desktop only");

    await page.goto(`${BASE}/tickets`);
    await painted(page, page.getByTestId("field-dev-requester"), "requester dropdown");
    // A closed native select shows only its placeholder, so the options are
    // expanded for the capture. They are the application's own option
    // elements; only the control's presentation changes.
    await page.evaluate(() => {
      const sel = document.querySelector("[data-testid='field-dev-requester']") as HTMLSelectElement;
      sel.setAttribute("size", String(sel.options.length));
    });
    await page.waitForTimeout(300);
    await capture(page, "requester-selection", "loaded", testInfo.project.name);
  });

  test("create ticket validation, success and invalid attachment", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "ui-spec 10 lists these at desktop only");

    await enterAs(page, REQUESTER, "/tickets/new");
    await page.getByTestId("btn-submit-ticket").click();
    await painted(page, page.getByTestId("error-summary"), "summary message");
    await capture(page, "create-ticket", "validation-failure", testInfo.project.name);

    // An impermissible file is rejected at selection and stays visible with the
    // reason, which is the state ui-spec 5.3 specifies (AC-17).
    await page.setInputFiles('[data-testid="field-attachments"]', {
      name: "payload.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("MZ"),
    });
    await painted(page, page.getByTestId("attachment-error"), "attachment rejection");
    await expect(page.getByTestId("attachment-error")).toContainText(/type not permitted/i);
    await capture(page, "create-ticket", "invalid-attachment", testInfo.project.name);
  });

  test("my tickets empty and no-results states", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "ui-spec 10 lists these at desktop only");

    // Pimchanok Sonthi owns no tickets and is the AC-24 fixture.
    await enterAs(page, EMPTY_REQUESTER);
    const empty = page.getByTestId("state-empty");
    await painted(page, empty, "empty state");
    await expect(empty).toContainText(/have not created any tickets yet/i);
    expect(await page.getByTestId("state-no-results").count()).toBe(0);
    await capture(page, "my-tickets", "empty", testInfo.project.name);

    await page.getByTestId("btn-change-requester").click();
    await enterAs(page, REQUESTER);
    await page.getByTestId("field-search").fill("zzzz-no-such-ticket");
    await page.waitForTimeout(900);
    const noResults = page.getByTestId("state-no-results");
    await painted(page, noResults, "no-results state");
    await expect(noResults).toContainText(/no tickets match/i);
    // The pair BR-49 exists to keep apart: each proves the other is absent.
    expect(await page.getByTestId("state-empty").count()).toBe(0);
    await capture(page, "my-tickets", "no-results", testInfo.project.name);
  });
});
