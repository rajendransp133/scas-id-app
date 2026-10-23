import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Student } from "@/lib/types";
import { hasArial, loadAssets, makeCanvas, nodeMeasure, toPng } from "@/test/nodeCanvas";
import { COLLEGES } from "./colleges";
import { G } from "./geometry";
import { layoutCard, layoutDetails, type TextPrim } from "./layout";
import { renderCardCanvas } from "./render";
import { THEMES } from "./themes";

const OUT = process.env.CARD_DIFF_DIR;

const student: Student = {
  name: "S.KAVIYA", course: "B.Ed., ENGLISH", year: "", batch: "2025 - 2027", dob: "14.06.2003",
  contact: "9876543210", address: "12/4, NORTH STREET, KEERANUR (PO), KULATHUR (TK), PUDUKKOTTAI - 622502",
  blood_group: "B+Ve", reg_no: "2513021045",
};

const texts = (st: Student, id: keyof typeof COLLEGES) =>
  layoutCard(st, THEMES.classic, nodeMeasure, { logo: { w: 1266, h: 1151 }, sign: { w: 216, h: 39 }, drop: { w: 663, h: 980 } },
             false, COLLEGES[id]).filter((p): p is TextPrim => p.kind === "text");

/** x of the chevron's left wedge at height y (it rises from (0,254) to (78,300)). */
const wedgeX = (y: number) => (y <= G.chev_top ? 0 : (G.chev_wedge_w * (y - G.chev_top)) / (G.chev_mid - G.chev_top));

describe.skipIf(!hasArial)("College of Education card", () => {
  it("carries its own header, both approval lines clear of the chevron", () => {
    const t = texts(student, "sce");
    for (const line of COLLEGES.sce.lines) {
      const p = t.find((x) => x.text === line.text)!;
      expect(p, line.text).toBeDefined();
      const bottom = p.y + p.h;
      expect(bottom).toBeLessThanOrEqual(G.chev_mid);
      // both ends stay outside the wedges (symmetric about the card centre)
      expect(p.x, line.text).toBeGreaterThan(wedgeX(bottom) + 4);
      expect(p.x + p.w, line.text).toBeLessThan(719 - wedgeX(bottom) - 4);
    }
    // lines don't overlap each other
    const ls = COLLEGES.sce.lines;
    for (let i = 1; i < ls.length; i++) expect(ls[i].top).toBeGreaterThan(ls[i - 1].top + ls[i - 1].h);
    expect(t.some((x) => x.text === "scascollege.ac.in")).toBe(false);
  });

  it("prints REG. NO above DOB and keeps the address clear of the signature", () => {
    const t = texts(student, "sce");
    const reg = t.find((x) => x.text === "REG. NO")!;
    const dob = t.find((x) => x.text === "DOB")!;
    expect(reg.y).toBe(G.row_top);
    expect(dob.y).toBeGreaterThan(reg.y);
    expect(t.some((x) => x.text === student.reg_no)).toBe(true);
    const d = layoutDetails(student.address, nodeMeasure, 3);
    expect(G.row_top + d.pitch * (3 + d.lines.length)).toBeLessThanOrEqual(G.detail_bottom);
  });

  it("drops the REG. NO row when the student has none", () => {
    const t = texts({ ...student, reg_no: "" }, "sce");
    expect(t.some((x) => x.text === "REG. NO")).toBe(false);
    expect(t.find((x) => x.text === "DOB")!.y).toBe(G.row_top);
  });

  it("leaves the Arts and Science card as it was", () => {
    const t = texts(student, "scas");
    expect(t.some((x) => x.text === "REG. NO")).toBe(false);
    expect(t.find((x) => x.text === "DOB")!.y).toBe(G.row_top);
    expect(t.some((x) => x.text === "scascollege.ac.in")).toBe(true);
  });

  it("renders with its own signature", async () => {
    const assets = await loadAssets("sce");
    expect([assets.sign!.width, assets.sign!.height]).toEqual([216, 39]);
    const c = renderCardCanvas(makeCanvas, { student, palette: THEMES.violet, college: COLLEGES.sce },
                               nodeMeasure, assets, 600, 2);
    expect([c.width, c.height]).toEqual([1438, 2288]);
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, "sce_card.png"), toPng(c));
    }
  });
});
