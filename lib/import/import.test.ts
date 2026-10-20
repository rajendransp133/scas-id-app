// The TypeScript import against the golden files dumped from the Python POC.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { batchLine, formatBloodGroup, slugOf } from "@/lib/student";
import { importSheet, openBook, rowPhotosFor, summarizeSheets } from "./index";

const FIX = join(__dirname, "..", "..", "fixtures");
const GOLD = join(FIX, "golden");
const sha1 = (b: Uint8Array) => createHash("sha1").update(b).digest("hex");

interface GoldStudent {
  name: string; course: string; year: string; batch: string; dob: string;
  contact: string; address: string; blood_group: string; slug: string;
  batchLine: string; bloodLabel: string; photoSha1: string | null;
}
interface GoldBook { file: string; sheets: { name: string; photoRows: Record<string, string>; students: GoldStudent[] }[] }

const books = existsSync(GOLD)
  ? readdirSync(GOLD).filter((f) => f.endsWith(".json") && existsSync(join(FIX, f.replace(/\.json$/, ".xlsx"))))
  : [];

describe.skipIf(!books.length)("import matches the POC", () => {
  for (const g of books) {
    const gold: GoldBook = JSON.parse(readFileSync(join(GOLD, g), "utf8"));
    const book = openBook(readFileSync(join(FIX, gold.file)), gold.file);

    describe(gold.file, () => {
      it("finds the same sheets", () => {
        expect(book.sheets.map((s) => s.name)).toEqual(gold.sheets.map((s) => s.name));
      });

      for (const gs of gold.sheets) {
        it(`${gs.name}: photo -> row mapping`, async () => {
          const rows = await rowPhotosFor(book, gs.name);
          const got = Object.fromEntries([...rows].sort((a, b) => a[0] - b[0])
            .map(([r, p]) => [String(r), sha1(p.bytes)]));
          expect(got).toEqual(gs.photoRows);
        });

        it(`${gs.name}: students, fields and photos`, async () => {
          const imp = await importSheet(book, gs.name, { embedded: true });
          expect(imp.parsed.length).toBe(gs.students.length);
          imp.parsed.forEach(({ student: st }, i) => {
            const want = gs.students[i];
            expect({
              ...st, slug: slugOf(st.name), batchLine: batchLine(st.batch),
              bloodLabel: formatBloodGroup(st.blood_group),
              photoSha1: imp.photos[i]?.source === "embedded" ? sha1(imp.photos[i].photo.bytes) : null,
            }).toEqual({
              name: want.name, course: want.course, year: want.year, batch: want.batch,
              dob: want.dob, contact: want.contact, address: want.address,
              blood_group: want.blood_group, slug: want.slug, batchLine: want.batchLine,
              bloodLabel: want.bloodLabel, photoSha1: want.photoSha1,
            });
          });
          expect(imp.coverage.matched).toBe(gs.students.filter((s) => s.photoSha1).length);
        });
      }
    });
  }
});

describe.skipIf(!existsSync(join(FIX, "2nd_year_tami.xls")))("legacy .xls", () => {
  it("reads students but no photos", async () => {
    const book = openBook(readFileSync(join(FIX, "2nd_year_tami.xls")), "2nd_year_tami.xls");
    expect(book.kind).toBe("xls");
    const [s] = await summarizeSheets(book);
    expect(s.students).toBeGreaterThan(0);
    expect(s.photos).toBe(0);
  });
});

describe("damaged input", () => {
  it("rejects a non-workbook without crashing photo extraction", async () => {
    const junk = new Uint8Array(4096).map((_, i) => (i * 37) % 251);
    let students = 0;
    try {
      students = openBook(junk, "broken.xlsx").sheets.reduce((n, s) => n + s.parsed.length, 0);
    } catch {
      students = 0;                        // SheetJS may throw; the UI reports it
    }
    expect(students).toBe(0);
    const { extractXlsxPhotos } = await import("./xlsxPhotos");
    expect((await extractXlsxPhotos(junk, null)).size).toBe(0);
  });

  it("finds no students when no column holds names", () => {
    const book = openBook(new TextEncoder().encode("A,B\n1,2\n3,4\n"), "nums.csv");
    expect(book.sheets[0].parsed).toEqual([]);
  });
});
