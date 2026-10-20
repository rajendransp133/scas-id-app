import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { AnyCanvas } from "@/lib/card/canvasBackend";
import { CARD_H, CARD_W } from "@/lib/card/geometry";
import type { Encode } from "@/lib/card/svgBackend";
import { importSheet, openBook } from "@/lib/import";
import { getPngDpi } from "@/lib/png/phys";
import {
  DEFAULT_EDIT,
  DEFAULT_OPTIONS,
  type GenerateOptions,
} from "@/lib/types";
import {
  hasArial,
  loadAssets,
  loadImg,
  makeCanvas,
  nodeMeasure,
  ROOT,
} from "@/test/nodeCanvas";
import {
  A4,
  a4Slot,
  PER_PAGE,
  runJob,
  type GenEnv,
  type GenStudent,
} from "./job";

const encode: Encode = async (c: AnyCanvas, type, q) =>
  new Uint8Array(
    (c as unknown as { toBuffer(t: string, q?: number): Buffer }).toBuffer(
      type,
      q ? Math.round(q * 100) : undefined,
    ),
  );

describe("A4 sheet", () => {
  it("fits 4 × 2 actual-size cards on A4 landscape with printable margins", () => {
    const mm = 25.4 / 300;
    expect(PER_PAGE).toBe(8);
    const first = a4Slot(0);
    const last = a4Slot(PER_PAGE - 1);
    expect(first.x * mm).toBeGreaterThan(8);
    expect(first.y * mm).toBeGreaterThan(8);
    expect((A4.w - last.x - CARD_W) * mm).toBeCloseTo(first.x * mm, 6); // centred
    expect((A4.h - last.y - CARD_H) * mm).toBeCloseTo(first.y * mm, 6);
    expect(a4Slot(1).x - first.x).toBe(CARD_W); // no gaps: cut on shared edges
    expect(a4Slot(4).y - first.y).toBe(CARD_H);
  });
});

const BOOK = join(ROOT, "fixtures", "2nd_year_msc_cs.xlsx");

describe.skipIf(!hasArial || !existsSync(BOOK))("export job", () => {
  async function setup(n: number) {
    const book = openBook(readFileSync(BOOK), "x.xlsx");
    const imp = await importSheet(book, book.sheets[0].name, {
      embedded: true,
    });
    const students: GenStudent[] = imp.parsed.slice(0, n).map((p, i) => {
      const ph = imp.photos[i];
      return {
        student: p.student,
        photo:
          ph?.source === "embedded"
            ? new Blob([ph.photo.bytes as BlobPart])
            : null,
        edit: DEFAULT_EDIT,
      };
    });
    const env: GenEnv = {
      make: makeCanvas,
      encode,
      assets: await loadAssets(),
      measure: nodeMeasure,
      decode: async (b) => loadImg(new Uint8Array(await b.arrayBuffer())),
    };
    return { students, env };
  }

  it("writes PNG cards with DPI, sheet pages, PDF and SVG, per theme", async () => {
    const { students, env } = await setup(3);
    // duplicate a name to check slug suffixing
    students.push({ ...students[0] });
    const options: GenerateOptions = {
      ...DEFAULT_OPTIONS,
      themes: ["violet", "classic"],
      format: "both",
      dpi: 150,
      supersample: 1,
      sheet: true,
    };
    const progress: number[] = [];
    const { zip, files } = await runJob(
      { students, options, zipName: "t" },
      env,
      (p) => progress.push(p.done),
    );

    for (const t of ["violet", "classic"]) {
      expect(files).toContain(`${t}/cards/BALAGURU_S.png`);
      expect(files).toContain(`${t}/cards/BALAGURU_S_2.png`);
      expect(files).toContain(`${t}/cards/BALAGURU_S.svg`);
      expect(files).toContain(`${t}/sheet.png`);
      expect(files).toContain(`${t}/sheet.pdf`);
    }
    expect(files.some((f) => /sheet.*\.svg$/.test(f))).toBe(false); // CorelDRAW output has no sheet
    const z = await JSZip.loadAsync(await zip.arrayBuffer());
    const png = await z
      .file("violet/cards/BALAGURU_S.png")!
      .async("uint8array");
    expect(getPngDpi(png)).toBe(150);
    expect(progress.at(-1)).toBe(progress.length ? Math.max(...progress) : 0);
  }, 120_000);

  it("can be cancelled", async () => {
    const { students, env } = await setup(3);
    const ac = new AbortController();
    const p = runJob(
      {
        students,
        options: { ...DEFAULT_OPTIONS, dpi: 100, supersample: 1 },
        zipName: "t",
      },
      env,
      (pr) => {
        if (pr.done >= 1) ac.abort();
      },
      ac.signal,
    );
    await expect(p).rejects.toThrow("cancelled");
  }, 60_000);
});
