import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { action, actionId, openStaffDetail, staffRoutes4, staffTicket4 } from "./action-fixtures.js";

// STY-01 from docs/lab-04/tests.md section 2.8 (AC-38): action status badges
// and the follow-up indicator (ui-spec.md sections 1 and 4.3).
//
// Kept apart from client/tests/lab-04/theme.style.test.tsx, which #73 owns for
// STY-02. As in the Lab 2 and Lab 3 style suites, jsdom loads no stylesheet and
// resolves no var(), so the badge is asserted by its text and class, and the
// class's colours are read from the stylesheet source.

const STYLESHEET = "src/lab-04/styles/actions.css";
const TOKEN_FILE = "src/lab-02/styles/zen-green.css";

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

const kebab = (value: string) => value.toLowerCase().replace(/_/g, "-");

// ui-spec 4.3: display text, background, text, and border per action status.
const BADGES: Record<string, [string, string, string, string | null]> = {
  PLANNED: ["◌ Planned", "--zg-surface", "--zg-secondary", "--zg-secondary"],
  IN_PROGRESS: ["◐ In Progress", "--zg-secondary", "--zg-surface", null],
  COMPLETED: ["✓ Completed", "--zg-pale", "--zg-success", null],
  CANCELLED: ["✕ Cancelled", "--zg-disabled-bg", "--zg-text-muted", "--zg-border"],
};

describe("STY-01 (AC-38) - action status badges and the follow-up indicator", () => {
  it("renders each action status as glyph plus text, with its status class", async () => {
    const statuses = Object.keys(BADGES);
    const actions = statuses.map((status, i) => action(actionId(i + 1), { status, result: status === "PLANNED" || status === "IN_PROGRESS" ? null : "Done." }));
    await openStaffDetail(staffRoutes4(staffTicket4(), actions));

    statuses.forEach((status, i) => {
      const badge = within(document.querySelector<HTMLElement>(`[data-testid='action-row-${actions[i].id}']`)!).getByTestId("badge-action-status");
      expect(badge, status).toHaveTextContent(new RegExp(`^${BADGES[status][0]}$`));
      expect(badge, status).toHaveAttribute("data-status", status);
      expect(badge, status).toHaveClass("zg-badge", `zg-badge--action-${kebab(status)}`);
    });
  });

  it("colours each action status with the ui-spec 4.3 tokens", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    for (const [status, [, background, text, border]] of Object.entries(BADGES)) {
      const body = ruleBody(css, new RegExp(`\\.zg-badge--action-${kebab(status)}(?![\\w-])`));
      expect(body, status).toMatch(new RegExp(`background:\\s*var\\(${background}\\)`));
      expect(body, status).toMatch(new RegExp(`color:\\s*var\\(${text}\\)`));
      if (border === null) expect(body, status).not.toMatch(/border:/);
      else expect(body, status).toMatch(new RegExp(`border:\\s*1px solid var\\(${border}\\)`));
    }
  });

  it("shows the follow-up indicator as glyph plus text, in the warning tokens", async () => {
    const flagged = action(actionId(1), { followUpRequired: true, followUpNote: "Check again next week." });
    await openStaffDetail(staffRoutes4(staffTicket4(), [flagged]));
    const indicator = document.querySelector<HTMLElement>("[data-testid='indicator-follow-up']")!;
    expect(indicator).toHaveTextContent(/^⚑ Follow-up required$/);
    expect(indicator).toHaveClass("zg-indicator-follow-up");

    const body = ruleBody(readFileSync(STYLESHEET, "utf8"), /\.zg-indicator-follow-up(?![\w-])/);
    expect(body).toMatch(/background:\s*var\(--zg-warning-bg\)/);
    expect(body).toMatch(/color:\s*var\(--zg-warning\)/);
  });

  it("uses only tokens the token file defines, and no literal colour", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    const defined = new Set([...readFileSync(TOKEN_FILE, "utf8").matchAll(/(--zg-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = [...css.matchAll(/var\((--zg-[a-z0-9-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((token) => !defined.has(token))).toEqual([]);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
