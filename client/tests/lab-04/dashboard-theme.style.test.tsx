import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IT_STAFF, mockStartupSession, renderApp } from "../lab-03/helpers.js";
import { fakeApi, ok } from "../lab-03/ticket-fixtures.js";
import { STAFF_DASHBOARD_PATH, staffDashboard } from "./dashboard-fixtures.js";

// STY-02 from docs/lab-04/tests.md section 2.8 (AC-38, AC-39): the metric
// card, idle and focused, uses the ui-spec.md section 1 token roles.
//
// The file is dashboard-theme.style.test.tsx rather than theme.style.test.tsx,
// so this Issue does not share a file with #72's STY-01 (recorded under
// "Doc changes for #74" in the PR).
//
// As in the Lab 2 and Lab 3 style suites, jsdom applies no stylesheet and
// resolves no custom property, so getComputedStyle cannot report a token
// colour. The test therefore checks the two halves of the contract that jsdom
// can see: the rendered card carries the class the stylesheet keys off, and
// that class's rules in the stylesheet source use exactly the token roles.
// The painted result is checked in the browser by RSP-01 and RSP-05 (#74).

const STYLESHEET = "src/lab-04/styles/dashboard.css";
const TOKENS = "src/lab-02/styles/zen-green.css";

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every declaration of the rule blocks whose selector list contains `selector`, as one string. */
function declarations(css: string, selector: RegExp): string {
  const blocks = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return blocks
    .filter(([, selectors]) => selectors.split(",").some((s) => selector.test(s.trim())))
    .map(([, , body]) => body.replace(/\s+/g, " ").trim())
    .join(" ");
}

describe("STY-02 (AC-38, AC-39) - metric card idle and focused", () => {
  it("renders every metric card with the metric-card class, and linked cards take keyboard focus", async () => {
    fakeApi({ [STAFF_DASHBOARD_PATH]: ok(staffDashboard()) });
    mockStartupSession(IT_STAFF);
    renderApp("/staff/dashboard");
    await screen.findByTestId("metric-unassigned");

    for (const key of ["unassigned", "ownedByMe", "myOpenActions"]) {
      expect(screen.getByTestId(`metric-${key}`), key).toHaveClass("zg-metric-card");
      expect(screen.getByTestId(`metric-value-${key}`), key).toHaveClass("zg-metric-value");
    }

    // Tab reaches the first card, which is a real link (ui-spec 8).
    const first = screen.getByTestId("metric-unassigned");
    while (document.activeElement !== first) {
      await userEvent.tab();
      if (document.activeElement === document.body) break;
    }
    expect(first).toHaveFocus();
  });

  it("styles the idle card with the surface, border, radius, and shadow tokens", () => {
    const card = declarations(readFileSync(STYLESHEET, "utf8"), /^\.zg-metric-card$/);
    expect(card).toMatch(/background(-color)?: var\(--zg-surface\)/);
    expect(card).toMatch(/border: 1px solid var\(--zg-border\)/);
    expect(card).toMatch(/border-radius: var\(--zg-radius-md\)/);
    expect(card).toMatch(/box-shadow: var\(--zg-shadow-card\)/);
  });

  it("sets the value in h1 primary and the label in label muted", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    const value = declarations(css, /^\.zg-metric-value$/);
    expect(value).toMatch(/font: var\(--zg-font-h1\)/);
    expect(value).toMatch(/color: var\(--zg-primary\)/);

    const label = declarations(css, /^\.zg-metric-label$/);
    expect(label).toMatch(/font: var\(--zg-font-label\)/);
    expect(label).toMatch(/color: var\(--zg-text-muted\)/);
  });

  it("gives the hovered and focused card a 2px primary border, without removing the focus indication", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    for (const state of [/^a\.zg-metric-card:hover$/, /^a\.zg-metric-card:focus-visible$/]) {
      const rule = declarations(css, state);
      expect(rule, String(state)).toMatch(/border: 2px solid var\(--zg-primary\)/);
      expect(rule, String(state)).not.toMatch(/outline: (none|0)\b/);
    }
  });

  it("uses only tokens for colour: no literal colour value in the dashboard stylesheet", () => {
    const css = readFileSync(STYLESHEET, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/g) ?? []).toEqual([]);

    // Every token used is defined in the Zen Green token file.
    const defined = new Set(readFileSync(TOKENS, "utf8").match(/--zg-[a-z0-9-]+(?=:)/g) ?? []);
    const used = [...new Set(css.match(/--zg-[a-z0-9-]+/g) ?? [])];
    expect(used.filter((t) => !defined.has(t))).toEqual([]);
  });
});
