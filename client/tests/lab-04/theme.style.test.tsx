import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// STY-04 from docs/lab-04/tests.md section 2.8 (AC-40, ui-spec 10): a static
// scan of client/src for leftover development code and inline colours.
// STY-03 (every computed colour is a token) needs real layout and runs in the
// browser: e2e/lab-04/theme.spec.ts.

const SOURCE = "src";
const TOKEN_FILE = join("src", "lab-02", "styles", "zen-green.css");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

/** Every line matching `pattern`, as "file:line: text". */
function matches(pattern: RegExp, source: (path: string) => string = (p) => readFileSync(p, "utf8")): string[] {
  return files(SOURCE).flatMap((path) =>
    source(path)
      .split(/\r?\n/)
      .flatMap((line, i) => (pattern.test(line) ? [`${path}:${i + 1}: ${line.trim()}`] : [])),
  );
}

/** The token file with its :root block blanked out, keeping line numbers. */
function outsideRoot(path: string): string {
  const text = readFileSync(path, "utf8");
  if (path !== TOKEN_FILE) return text;
  return text.replace(/^:root\s*\{[\s\S]*?^\}/m, (block) => block.replace(/[^\n]/g, ""));
}

describe("STY-04 (AC-40) - static scan of client/src", () => {
  it("scans a real source tree", () => {
    expect(files(SOURCE).length).toBeGreaterThan(40);
    expect(files(SOURCE)).toContain(TOKEN_FILE);
  });

  it("has no console.log", () => {
    expect(matches(/console\.log\s*\(/)).toEqual([]);
  });

  it('has no "TODO", "lorem", or "coming soon"', () => {
    expect(matches(/\bTODO\b|\blorem\b|coming soon/i)).toEqual([]);
  });

  it("has no hex colour outside the token block of the token file", () => {
    expect(matches(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/, outsideRoot)).toEqual([]);
  });

  it("defines the tokens inside :root, so the hex check above has something to exempt", () => {
    const root = /^:root\s*\{([\s\S]*?)^\}/m.exec(readFileSync(TOKEN_FILE, "utf8"));
    expect(root).not.toBeNull();
    expect(root![1]).toMatch(/--zg-primary:\s*#006B3C/i);
  });
});
