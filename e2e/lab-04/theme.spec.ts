import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, BASE, LAB4, openAs, openStaffTicket, runId, ticketWithFourActions } from "./lab4.js";

// STY-03 from docs/lab-04/tests.md section 2.8 (AC-38): every colour painted on
// the Lab 4 screens is a design token. jsdom computes no custom property, so
// this runs in the browser, where the cascade has been resolved.

test.describe.configure({ mode: "serial" });

let ticketId = "";

test.beforeAll(async () => {
  test.setTimeout(60000);
  ticketId = (await ticketWithFourActions(`Seminar room speakers buzz ${runId()}`)).id;
});

/**
 * The colours the page paints that are not tokens. Tokens are every
 * `--zg-*` custom property on :root whose value is a colour, resolved by the
 * browser to rgb(a). Fully transparent is allowed (no paint). Borders count
 * only when they are drawn, and outlines only when they are shown.
 */
async function nonTokenColours(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const resolve = (value: string) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    };
    const rootStyle = getComputedStyle(document.documentElement);
    const tokens = new Set<string>();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule) || rule.selectorText !== ":root") continue;
        for (const name of Array.from(rule.style)) {
          if (!name.startsWith("--zg-")) continue;
          const value = rootStyle.getPropertyValue(name).trim();
          if (CSS.supports("color", value)) tokens.add(resolve(value));
        }
      }
    }
    const transparent = (c: string) => c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);

    const found = new Map<string, string>();
    const root = document.querySelector(selector) ?? document.body;
    const elements = [root, ...Array.from(root.querySelectorAll("*"))];
    for (const el of elements) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      const painted: [string, string][] = [
        ["color", s.color],
        ["background-color", s.backgroundColor],
      ];
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none") {
          painted.push([`border-${side.toLowerCase()}-color`, s[`border${side}Color`]]);
        }
      }
      if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) painted.push(["outline-color", s.outlineColor]);
      // A checkbox or radio is painted in its accent colour; "auto" is the
      // operating system's colour, not a token.
      if (el.matches('input[type="checkbox"], input[type="radio"]')) painted.push(["accent-color", s.accentColor]);
      for (const [property, colour] of painted) {
        if (transparent(colour) || tokens.has(colour)) continue;
        const id = el.getAttribute("data-testid") ?? el.className.toString().split(" ")[0] ?? el.tagName;
        found.set(`${property} ${colour}`, `${el.tagName.toLowerCase()}.${id}`);
      }
    }
    if (tokens.size < 10) return [`only ${tokens.size} colour tokens found on :root`];
    return [...found.entries()].map(([what, where]) => `${what} on ${where}`);
  }, scope);
}

test("STY-03 (AC-38): every colour on the Lab 4 screens is a token", async ({ browser }) => {
  test.setTimeout(120000);
  const screens: [string, string, string, string, (page: Page) => Promise<void>][] = [
    ["IT Staff Dashboard", LAB4.arisa.email, "/staff/dashboard", '[data-testid="staff-dashboard-screen"]', async () => {}],
    ["Administrator Dashboard", ACCOUNTS.admin.email, "/staff/dashboard", '[data-testid="staff-dashboard-screen"]', async () => {}],
    ["Requester Dashboard", LAB4.napat.email, "/dashboard", '[data-testid="requester-dashboard-screen"]', async () => {}],
    ["Requester Dashboard, empty", LAB4.pimchanok.email, "/dashboard", '[data-testid="requester-dashboard-screen"]', async () => {}],
    ["Staff Ticket Detail", ACCOUNTS.staff.email, "/", "main", async (page) => openStaffTicket(page, ticketId)],
    ["Staff Ticket Detail, History", ACCOUNTS.staff.email, "/", "main", async (page) => {
      await openStaffTicket(page, ticketId);
      await page.getByTestId("tab-history").click();
      await expect(page.locator('[data-testid^="history-item-"]').first()).toBeVisible();
    }],
    ["Action dialog", ACCOUNTS.staff.email, "/", '[data-testid="action-dialog"]', async (page) => {
      await openStaffTicket(page, ticketId);
      await page.getByTestId("btn-record-action").click();
      await page.getByTestId("field-follow-up-required").check();
      await page.getByTestId("btn-save-action").click();
      await expect(page.getByTestId("field-action-description")).toHaveAttribute("aria-invalid", "true");
    }],
    ["Requester Ticket Detail", ACCOUNTS.requester.email, `/tickets/__ID__`, "main", async () => {}],
  ];
  for (const [name, email, path, scope, prepare] of screens) {
    const { context, page } = await openAs(browser, "desktop", email, path.replace("__ID__", ticketId));
    try {
      await prepare(page);
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15000 });
      expect(await nonTokenColours(page, scope), `${name} (${BASE})`).toEqual([]);
    } finally {
      await context.close();
    }
  }
});
