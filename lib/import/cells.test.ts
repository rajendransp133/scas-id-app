import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { batchLine, formatBloodGroup, slugOf, uniqueSlugs } from "@/lib/student";
import { clean, inferColumns, mapHeaders, readCells, rowsToStudents, type Row } from "./cells";
import { resolvePhotos } from "./merge";
import { coverage } from "./coverage";

const BLOOD = join(__dirname, "..", "..", "fixtures", "golden", "blood.json");

describe("student helpers", () => {
  it.skipIf(!existsSync(BLOOD))("formats blood groups like the POC", () => {
    const cases: Record<string, string> = JSON.parse(readFileSync(BLOOD, "utf8"));
    for (const [raw, want] of Object.entries(cases)) expect(formatBloodGroup(raw)).toBe(want);
  });

  it("slugs and de-duplicates", () => {
    expect(slugOf(" P.ABINAYA ")).toBe("P_ABINAYA");
    expect(slugOf("...")).toBe("STUDENT");
    expect(uniqueSlugs(["A B", "a-b", "C"])).toEqual(["A_B", "A_B_2", "C"]);
  });

  it("builds the batch line", () => {
    expect(batchLine("2025-2027")).toBe("BATCH 2025 - 2027");
    expect(batchLine("batch 2025 -2027")).toBe("BATCH 2025 - 2027");
    expect(batchLine("  ")).toBe("");
  });
});

describe("cells", () => {
  it("cleans values", () => {
    expect(clean(null)).toBe("");
    expect(clean(9876543210)).toBe("9876543210");
    expect(clean({ y: 2008, m: 11, d: 10, H: 0, M: 0, S: 0 })).toBe("10.11.2008");
    expect(clean({ y: 2008, m: 1, d: 2, H: 9, M: 5, S: 0 })).toBe("02.01.2008 09:05");
    expect(clean("  A   B ")).toBe("A B");
    expect(clean(true)).toBe("True");
  });

  it("maps headers exactly, then by substring", () => {
    const m = mapHeaders(["S.NO", "NAME OF THE STUDENT", "COURCE ", "D.O.B", "STUDENTS MOBILE NO.",
                          "Blood Group:", "BATCH", "PHOTO"]);
    expect(m).toMatchObject({ name: 1, course: 2, dob: 3, contact: 4, blood_group: 5, batch: 6, photo: 7 });
    expect(mapHeaders(["FULL NAME", "ADDRESS"])).toMatchObject({ name: 0, address: 1 });
  });

  it("maps the College of Education layout", () => {
    const m = mapHeaders(["S.NO", "FULL NAME", "BATCH", "DEPARTMENT", "REGISTER NUMBER", "DOB", "CONTACT",
                          "ADDRESS", "BLOOD GROUP", "PHOTO"]);
    expect(m).toEqual({ name: 1, batch: 2, course: 3, reg_no: 4, dob: 5, contact: 6, address: 7,
                        blood_group: 8, photo: 9 });
    const [s] = rowsToStudents([
      [0, ["S.NO", "FULL NAME", "BATCH", "DEPARTMENT", "REGISTER NUMBER", "DOB", "CONTACT", "ADDRESS", "BLOOD GROUP"]],
      [1, [1, "T.KEERTHANA", "2025 - 2027", "B.Ed., ENGLISH", 2512345678, "25.11.2004", 9843983828,
           "1/100, THUVAR", "A+Ve"]],
    ]);
    expect(s.student).toMatchObject({ name: "T.KEERTHANA", course: "B.Ed., ENGLISH", reg_no: "2512345678",
                                      contact: "9843983828", blood_group: "A+Ve" });
  });

  it("infers columns of a header-less sheet", () => {
    const rows = [
      [1, "ARUN K", "B.Sc PHYSICS", "12.03.2006", "9876543210", "12, MAIN ROAD, KARAIKUDI, SIVAGANGAI", "O+", "2025-2028"],
      [2, "BALA S", "B.Sc PHYSICS", "01.01.2006", "9876500000", "4, EAST STREET, PUDUKKOTTAI - 622001", "B+VE", "2025-2028"],
      [3, "CHITRA M", "B.Sc PHYSICS", "05.06.2005", "9000000001", "9/2, NORTH CAR STREET, ARANTHANGI", "AB-", "2025-2028"],
      [4, "DEEPA R", "B.Sc PHYSICS", "07.07.2006", "9000000002", "77, TEMPLE ROAD, ALANGUDI, PUDUKKOTTAI", "A1+", "2025-2028"],
    ];
    expect(inferColumns(rows)).toEqual({
      blood_group: 6, batch: 7, dob: 3, contact: 4, course: 2, address: 5, name: 1,
    });
    const students = rowsToStudents(rows.map((r, i): Row => [i, r]));
    expect(students.map((s) => s.student.name)).toEqual(["ARUN K", "BALA S", "CHITRA M", "DEEPA R"]);
  });

  it("skips a title row above the header", () => {
    const parsed = rowsToStudents([
      [0, ["SUDHARSAN COLLEGE OF ARTS AND SCIENCE"]],
      [2, ["S.NO", "NAME", "COURSE"]],
      [3, [1, "ARUN", "BCA"]],
      [4, [2, null, "BCA"]],
    ]);
    expect(parsed).toEqual([{ row: 3, photoCell: "", student: expect.objectContaining({ name: "ARUN", course: "BCA" }) }]);
  });

  it("reads CSV as text", () => {
    const csv = "﻿NAME,DOB,CONTACT\nARUN,01.02.2006,09876543210\n";
    const wb = readCells(new TextEncoder().encode(csv), "list.csv");
    const [s] = rowsToStudents(wb.sheets[0].rows);
    expect(s.student).toMatchObject({ name: "ARUN", dob: "01.02.2006", contact: "09876543210" });
  });
});

describe("photo priority and coverage", () => {
  const parsed = [
    { row: 1, photoCell: "#VALUE!", student: { name: "ARUN K" } },
    { row: 2, photoCell: "custom.JPG", student: { name: "BALA" } },
    { row: 3, photoCell: "", student: { name: "CHITRA" } },
  ].map((p) => ({ ...p, student: { course: "", year: "", batch: "", dob: "", contact: "", address: "", blood_group: "", reg_no: "", ...p.student } }));
  const emb = (n: number) => ({ bytes: new Uint8Array([n]), part: `xl/media/image${n}.png`, ext: ".png", mime: "image/png" });
  const rows = new Map([[1, emb(1)], [2, emb(2)], [3, emb(3)]]);

  it("prefers named file > slug file > embedded, and ignores #VALUE!", () => {
    const files = [{ name: "custom.jpg" }, { name: "arun_k.PNG" }];
    const r = resolvePhotos(parsed, rows, files);
    expect(r[0]).toEqual({ source: "file", file: files[1] });
    expect(r[1]).toEqual({ source: "file", file: files[0] });
    expect(r[2]).toEqual({ source: "embedded", photo: rows.get(3) });
    expect(resolvePhotos(parsed, null, [])).toEqual([null, null, null]);
  });

  it("reports missing and duplicate photos", () => {
    const a = new Uint8Array([1, 2, 3]);
    const c = coverage([a, null, new Uint8Array([1, 2, 3]), new Uint8Array([9])]);
    expect(c).toEqual({ total: 4, matched: 3, missing: [1], duplicates: [[0, 2]] });
  });
});
