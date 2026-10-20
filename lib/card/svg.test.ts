import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importSheet, openBook } from "@/lib/import";
import { slugOf } from "@/lib/student";
import { hasArial, loadAssets, loadImg, loadImage, makeCanvas, nodeMeasure, pixels, ROOT } from "@/test/nodeCanvas";
import type { AnyCanvas } from "./canvasBackend";
import { cardPrims } from "./render";
import { num, pathData, renderCardSvg, type Encode } from "./svgBackend";
import { THEMES } from "./themes";

const encode: Encode = async (c: AnyCanvas, type, q) =>
  new Uint8Array((c as unknown as { toBuffer(t: string, q?: number): Buffer }).toBuffer(type, q ? Math.round(q * 100) : undefined));

const tags = (svg: string) => {
  const out: Record<string, number> = {};
  for (const m of svg.matchAll(/<([a-zA-Z]+)/g)) out[m[1]] = (out[m[1]] ?? 0) + 1;
  return out;
};

describe("svg helpers", () => {
  it("formats numbers and arcs", () => {
    expect([num(1), num(1.23456), num(-0.0001), num(2.5)]).toEqual(["1", "1.235", "0", "2.5"]);
    expect(pathData([{ op: "M", x: 0, y: 1 }, { op: "A", cx: 0, cy: 0, rx: 2, ry: 3, a0: 0, a1: 1, x: 4, y: 5 }, { op: "Z" }]))
      .toBe("M0,1 A2,3 0 0 1 4,5 Z");
  });
});

const BOOK = join(ROOT, "fixtures", "2nd_year_msc_cs.xlsx");
const GOLD = join(ROOT, "fixtures", "golden", "2nd_year_msc_cs", "BALAGURU_S.svg");

describe.skipIf(!hasArial || !existsSync(BOOK) || !existsSync(GOLD))("card svg vs POC", () => {
  it("has the same structure and page size, and renders like the POC svg", async () => {
    const assets = await loadAssets();
    const book = openBook(readFileSync(BOOK), "2nd_year_msc_cs.xlsx");
    const imp = await importSheet(book, book.sheets[0].name, { embedded: true });
    const i = imp.parsed.findIndex((p) => slugOf(p.student.name) === "BALAGURU_S");
    const ph = imp.photos[i];
    const img = ph?.source === "embedded" ? await loadImg(ph.photo.bytes) : null;
    const job = { student: imp.parsed[i].student, palette: THEMES.classic, photo: img };

    const svg = await renderCardSvg(cardPrims(job, nodeMeasure, assets),
      { measure: nodeMeasure, assets, photo: img ? { key: "0", img } : null }, makeCanvas, encode, 2);
    const gold = readFileSync(GOLD, "utf8");

    // <svg ... mm ... viewBox>; the golden file has Windows line endings
    expect(svg.split(/\r?\n/)[1]).toBe(gold.split(/\r?\n/)[1]);
    const mine = tags(svg);
    const theirs = tags(gold);
    for (const t of ["text", "image", "use", "clipPath", "polygon", "rect", "path"]) {
      expect([t, mine[t]]).toEqual([t, theirs[t]]);
    }
    expect(svg).toContain('font-family="Arial Black"');
    expect(svg.replace(/base64,[^"]+/g, "")).not.toMatch(/NaN|undefined/);

    // rasterise the SVG and compare with the canvas backend's PNG of the same card
    const out = process.env.CARD_DIFF_DIR;
    if (out) writeFileSync(join(out, "BALAGURU_S.svg"), svg);
    // Rasterise both SVGs the same way and compare: the vector parts must land
    // where the POC put them.  (This rasteriser skips <use> of <image>, so the
    // bitmaps are absent from both; the e2e run checks them in a browser.)
    const rasterise = async (s: string) => {
      const im = await loadImage(Buffer.from(s.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="719" height="1144"')));
      const c = makeCanvas(719, 1144);
      (c.getContext("2d") as CanvasRenderingContext2D).drawImage(im as never, 0, 0);
      return c;
    };
    const big = await rasterise(svg);
    const a = pixels(big);
    const b = pixels(await rasterise(gold));
    let sum = 0;
    for (let p = 0; p < a.length; p += 4) {
      sum += Math.max(Math.abs(a[p] - b[p]), Math.abs(a[p + 1] - b[p + 1]), Math.abs(a[p + 2] - b[p + 2]));
    }
    const mean = sum / (a.length / 4);
    if (out) {
      writeFileSync(join(out, "BALAGURU_S_svg_raster.png"), (big as unknown as { toBuffer(t: string): Buffer }).toBuffer("image/png"));
      console.log(`svg vs POC svg: mean ${mean.toFixed(2)}`);
    }
    // same placement; the SVG rasteriser antialiases text and images its own way
    expect(mean).toBeLessThan(8);
  }, 60_000);
});
