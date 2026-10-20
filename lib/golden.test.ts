// Sanity check that the golden references dumped from the Python POC are in
// place.  Sprint 1+ tests compare the TypeScript port against these files.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const GOLD = join(__dirname, "..", "fixtures", "golden");

describe.skipIf(!existsSync(GOLD))("golden fixtures", () => {
  it("has a golden file per .xlsx fixture", () => {
    const books = readdirSync(join(GOLD, "..")).filter((f) => f.endsWith(".xlsx"));
    expect(books.length).toBeGreaterThan(0);
    for (const b of books) {
      expect(existsSync(join(GOLD, b.replace(/\.xlsx$/, ".json")))).toBe(true);
    }
  });

  it("has the theme table with all 14 themes", () => {
    const themes = JSON.parse(readFileSync(join(GOLD, "themes.json"), "utf8"));
    expect(Object.keys(themes)).toHaveLength(14);
    expect(themes.classic.blue).toBe("#0000fe");
  });
});
