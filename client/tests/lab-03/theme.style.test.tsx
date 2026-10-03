import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { CurrentUser } from "../../src/lab-03/auth-api.js";
import { ADMINISTRATOR, IT_STAFF, REQUESTER, mockRequesterScreens, mockStartupSession, renderApp } from "./helpers.js";

// Lab 3 UI style assertions -- docs/lab-03/tests.md section 2.11.
//
// #38 owns STY-03. The later Issues add STY-01, STY-02, and STY-04 to STY-09
// to this file.
//
// As in the Lab 2 style suite, jsdom loads no stylesheet, so assertions target
// the class contract the stylesheet keys off and read the stylesheet source.

const STYLESHEET = "src/lab-02/styles/zen-green.css";

/** The body of the first CSS rule whose selector matches `selector`. */
function ruleBody(css: string, selector: RegExp): string {
  const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `no rule for ${selector.source}`).not.toBeNull();
  return match![1];
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("STY-03 (AC-65) - role badge", () => {
  it.each([
    [REQUESTER, "Requester", "/tickets"],
    [IT_STAFF, "IT Staff", "/staff/queue"],
    [ADMINISTRATOR, "Administrator", "/staff/queue"],
  ] as [CurrentUser, string, string][])("renders the %s role as text", async (user, text, path) => {
    cleanup();
    if (user.role === "REQUESTER") mockRequesterScreens();
    mockStartupSession(user);

    renderApp(path);

    const badge = await screen.findByTestId("badge-role");
    expect(badge).toHaveTextContent(new RegExp(`^${text}$`));
    expect(badge).toHaveAttribute("data-role", user.role);
  });

  it("colours each role with the ui-spec 7.3 tokens", () => {
    const css = readFileSync(STYLESHEET, "utf8");

    const expected: [string, string, string][] = [
      ["requester", "--zg-readonly-bg", "--zg-text-muted"],
      ["it-staff", "--zg-pale", "--zg-primary"],
      ["administrator", "--zg-primary", "--zg-surface"],
    ];
    for (const [role, background, text] of expected) {
      const body = ruleBody(css, new RegExp(`\\.zg-badge--role-${role}`));
      expect(body, role).toMatch(new RegExp(`background:\\s*var\\(${background}\\)`));
      expect(body, role).toMatch(new RegExp(`color:\\s*var\\(${text}\\)`));
    }
  });

  it("gives the Administrator badge in the header a 1px surface border", async () => {
    mockStartupSession(ADMINISTRATOR);
    renderApp("/staff/queue");

    const badge = await screen.findByTestId("badge-role");
    expect(badge).toHaveClass("zg-badge--role-administrator");
    expect(badge.closest(".zg-header"), "the badge sits in the header").not.toBeNull();

    const css = readFileSync(STYLESHEET, "utf8");
    const body = ruleBody(css, /\.zg-header \.zg-badge--role-administrator/);
    expect(body).toMatch(/border:\s*1px solid var\(--zg-surface\)/);
  });
});
