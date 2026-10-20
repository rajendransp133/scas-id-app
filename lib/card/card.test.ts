import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importSheet, openBook } from "@/lib/import";
import { getPngDpi, setPngDpi } from "@/lib/png/phys";
import { slugOf } from "@/lib/student";
import {
  createCanvas, hasArial, loadAssets, loadImg, loadImage, makeCanvas, nodeMeasure, pixels, ROOT, toPng,
} from "@/test/nodeCanvas";
import { waveLeftAt } from "./geometry";
import { layoutDetails } from "./layout";
import { renderCardCanvas } from "./render";
import { makeTheme, rgbToHex, THEMES } from "./themes";

const FIX = join(ROOT, "fixtures");
const GOLD = join(FIX, "golden");
const haveGold = existsSync(GOLD);
const OUT = process.env.CARD_DIFF_DIR;          // set to dump renders for eyeballing

describe("themes", () => {
  it.skipIf(!haveGold)("reproduce the POC theme table exactly", () => {
    const want: Record<string, Record<string, string>> = JSON.parse(readFileSync(join(GOLD, "themes.json"), "utf8"));
    expect(Object.keys(THEMES).sort()).toEqual(Object.keys(want).sort());
    for (const [name, pal] of Object.entries(THEMES)) {
      for (const [k, c] of Object.entries(pal)) expect([name, k, rgbToHex(c)]).toEqual([name, k, want[name][k]]);
    }
  });

  it("derives a custom theme and switches the name colour near magenta", () => {
    expect(rgbToHex(makeTheme("#ff0080").magenta)).toBe("#0047ff");
    expect(rgbToHex(makeTheme("#0066ff").magenta)).toBe("#f63ad7");
  });
});

describe("geometry", () => {
  it.skipIf(!haveGold)("waveLeftAt matches the POC", () => {
    const want: Record<string, number> = JSON.parse(readFileSync(join(GOLD, "wave_left.json"), "utf8"));
    for (const [y, x] of Object.entries(want)) expect(waveLeftAt(Number(y))).toBeCloseTo(x, 6);
  });
});

describe("png dpi", () => {
  it("writes and reads pHYs", () => {
    const png = new Uint8Array(toPng(makeCanvas(4, 4)));
    const tagged = setPngDpi(png, 600);
    expect(getPngDpi(tagged)).toBe(600);
    expect(getPngDpi(setPngDpi(tagged, 300))).toBe(300);
  });
});

const books = haveGold
  ? readdirSync(GOLD).filter((f) => f.endsWith(".json") && existsSync(join(FIX, f.replace(/\.json$/, ".xlsx"))))
  : [];

describe.skipIf(!hasArial || !books.length)("address layout vs POC", () => {
  it("wraps every golden address the same way", () => {
    let total = 0;
    const diffs: string[] = [];
    for (const g of books) {
      const gold = JSON.parse(readFileSync(join(GOLD, g), "utf8"));
      for (const s of gold.sheets) {
        for (const st of s.students) {
          total++;
          const got = layoutDetails(st.address, nodeMeasure);
          if (JSON.stringify(got.lines) !== JSON.stringify(st.detail.lines) || got.cap !== st.detail.cap) {
            diffs.push(`${st.name}: ${JSON.stringify(got.lines)} vs ${JSON.stringify(st.detail.lines)}`);
          }
        }
      }
    }
    // font rasterisers differ by fractions of a unit; allow a borderline break or two
    expect(diffs.length, diffs.join("\n")).toBeLessThanOrEqual(Math.ceil(total * 0.02));
  });
});

describe.skipIf(!hasArial || !books.length)("rendered cards vs POC", () => {
  for (const g of books) {
    const base = g.replace(/\.json$/, "");
    const dir = join(GOLD, base);
    if (!existsSync(dir)) continue;
    it(`${base}: first students match the golden PNGs`, async () => {
      const assets = await loadAssets();
      const book = openBook(readFileSync(join(FIX, base + ".xlsx")), base + ".xlsx");
      const imp = await importSheet(book, book.sheets[0].name, { embedded: true });
      const goldPngs = readdirSync(dir).filter((f) => f.endsWith(".png"));
      expect(goldPngs.length).toBeGreaterThan(0);

      for (const f of goldPngs) {
        const i = imp.parsed.findIndex((p) => slugOf(p.student.name) + ".png" === f);
        expect(i).toBeGreaterThanOrEqual(0);
        const ph = imp.photos[i];
        const photo = ph?.source === "embedded" ? await loadImg(ph.photo.bytes) : null;
        const canvas = renderCardCanvas(makeCanvas, { student: imp.parsed[i].student, palette: THEMES.classic, photo },
                                        nodeMeasure, assets, 300, 4);
        const want = await loadImage(readFileSync(join(dir, f)));
        expect([canvas.width, canvas.height]).toEqual([want.width, want.height]);

        const a = pixels(canvas);
        const b = pixels(want);
        let sum = 0;
        let bad = 0;
        const diff = createCanvas(want.width, want.height);
        const dctx = diff.getContext("2d");
        const img = dctx.createImageData(want.width, want.height);
        for (let p = 0; p < a.length; p += 4) {
          const d = Math.max(Math.abs(a[p] - b[p]), Math.abs(a[p + 1] - b[p + 1]), Math.abs(a[p + 2] - b[p + 2]));
          sum += d;
          if (d > 64) bad++;
          img.data[p] = 255; img.data[p + 1] = 255 - d; img.data[p + 2] = 255 - d; img.data[p + 3] = 255;
        }
        const n = a.length / 4;
        const mean = sum / n;
        const badFrac = bad / n;
        if (OUT) {
          mkdirSync(OUT, { recursive: true });
          dctx.putImageData(img, 0, 0);
          writeFileSync(join(OUT, `${base}_${f}`), toPng(canvas));
          writeFileSync(join(OUT, `${base}_${f.replace(".png", "")}_diff.png`), diff.toBuffer("image/png"));
          console.log(`${base}/${f}: mean ${mean.toFixed(2)}  >64: ${(badFrac * 100).toFixed(2)}%`);
        }
        // same layout; only antialiasing, hinting and resampling differ
        expect(mean).toBeLessThan(6);
        expect(badFrac).toBeLessThan(0.02);
      }
    }, 60_000);
  }
});
