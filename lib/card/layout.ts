// (student, palette) -> display list in card units.  The canvas and SVG
// backends only paint this list, so the PNG and the SVG cannot drift apart.

import { batchLine, formatBloodGroup } from "@/lib/student";
import type { Student } from "@/lib/types";
import { COLLEGES, type College } from "./colleges";
import {
  CARD_H, CARD_W, CONDENSE, G, WINDOW_BOX, waveLeftAt, type Box, type Pt,
} from "./geometry";
import type { Palette, RGB } from "./themes";
import { capScale, inkH, inkW, wrapValue, type FontKey, type Measure } from "./text";

export type AssetKey = "logo" | "sign" | "drop";

export type PathCmd =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  /** elliptical arc, clockwise from angle a0 to a1 about (cx, cy), ending at (x, y) */
  | { op: "A"; cx: number; cy: number; rx: number; ry: number; a0: number; a1: number; x: number; y: number }
  | { op: "Z" };

export interface TextPrim {
  kind: "text";
  text: string;
  font: FontKey;
  fill: RGB;
  /** target ink box, in the local frame */
  x: number; y: number; w: number; h: number;
  /** optional frame: translate to `origin`, then rotate by `angle` degrees */
  origin?: Pt;
  angle?: number;
}

export type Prim =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: RGB }
  | { kind: "poly"; pts: Pt[]; fill: RGB }
  | { kind: "path"; cmds: PathCmd[]; fill?: RGB; stroke?: RGB; lineWidth?: number }
  | { kind: "asset"; asset: AssetKey; box: Box; opacity?: number }
  | { kind: "photo"; clip: PathCmd[]; box: Box }
  | TextPrim;

/** Natural pixel sizes of the artwork that loaded; a missing key draws the
 *  fallback shape instead. */
export type AssetSizes = Partial<Record<AssetKey, { w: number; h: number }>>;

// -- text placement -------------------------------------------------------

export function inkCap(measure: Measure, text: string, font: FontKey, fill: RGB, x: number, yTop: number,
                cap: number, condense = 1, anchor: "l" | "c" = "l", maxW?: number): TextPrim | null {
  if (!text) return null;
  const k = capScale(measure, font, cap);
  const m = measure(text, font);
  let w = inkW(m) * k * condense;
  if (maxW && w > maxW) w = maxW;
  const h = inkH(m) * k;
  if (w <= 0 || h <= 0) return null;
  if (anchor === "c") x -= w / 2;
  return { kind: "text", text, font, fill, x, y: yTop, w, h };
}

/** Ink stretched to fill the box exactly. */
function fitted(text: string, font: FontKey, fill: RGB, b: Box): TextPrim {
  return { kind: "text", text, font, fill, x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] };
}

/** Centred on cx, scaled to `height`, squeezed if wider than maxW. */
function fittedHeight(measure: Measure, text: string, font: FontKey, fill: RGB,
                      cx: number, top: number, height: number, maxW: number): TextPrim | null {
  if (!text) return null;
  const m = measure(text, font);
  if (inkH(m) <= 0) return null;
  const w = Math.min(maxW, (inkW(m) * height) / inkH(m));
  return { kind: "text", text, font, fill, x: cx - w / 2, y: top, w, h: height };
}

// -- shapes -----------------------------------------------------------------

/** The photo window: elliptical caps top and bottom, straight sides. */
export function windowPath(): PathCmd[] {
  const { photo_cx: cx, photo_cy: cy, photo_cap: cap } = G;
  const a = G.photo_w / 2;
  const half = G.photo_h / 2;
  const topC = cy - (half - cap);
  const botC = cy + (half - cap);
  return [
    { op: "M", x: cx - a, y: topC },
    { op: "A", cx, cy: topC, rx: a, ry: cap, a0: Math.PI, a1: 2 * Math.PI, x: cx + a, y: topC },
    { op: "L", x: cx + a, y: botC },
    { op: "A", cx, cy: botC, rx: a, ry: cap, a0: 0, a1: Math.PI, x: cx - a, y: botC },
    { op: "Z" },
  ];
}

function ellipsePath(b: Box): PathCmd[] {
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  const rx = (b[2] - b[0]) / 2;
  const ry = (b[3] - b[1]) / 2;
  return [
    { op: "M", x: cx - rx, y: cy },
    { op: "A", cx, cy, rx, ry, a0: Math.PI, a1: 2 * Math.PI, x: cx + rx, y: cy },
    { op: "A", cx, cy, rx, ry, a0: 0, a1: Math.PI, x: cx - rx, y: cy },
    { op: "Z" },
  ];
}

/** Fallback blood drop, used only if the icon asset is missing. */
function teardrop(cx: number, cy: number, r: number, apexY: number, steps = 200): Pt[] {
  const d0 = cy - apexY;
  if (d0 <= r) return [[cx, apexY], [cx - r, cy], [cx + r, cy]];
  const g = Math.acos(r / d0);
  const pts: Pt[] = [[cx, apexY]];
  const span = 2 * Math.PI - 2 * g;
  for (let i = 0; i <= steps; i++) {
    const th = -Math.PI / 2 - g + (span * i) / steps;
    pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
  }
  return pts;
}

/** Artwork centred in `box` at its own aspect. */
function contain(size: { w: number; h: number }, b: Box): Box {
  const bw = b[2] - b[0];
  const bh = b[3] - b[1];
  const r = Math.min(bw / size.w, bh / size.h);
  const w = size.w * r;
  const h = size.h * r;
  const x = b[0] + (bw - w) / 2;
  const y = b[1] + (bh - h) / 2;
  return [x, y, x + w, y + h];
}

// -- details block ------------------------------------------------------------

export interface DetailLayout { cap: number; pitch: number; lines: string[] }

/** Row size + the wrapped address.  Rows start at cap 21 and shrink a unit at
 *  a time until the block clears the signature.  `fixedRows` is how many
 *  one-line rows sit above the address (DOB, CONTACT, and REG. NO if printed). */
export function layoutDetails(address: string, measure: Measure, fixedRows = 2): DetailLayout {
  const k0 = CONDENSE.detail;
  const plan = (cap: number) => {
    const k = capScale(measure, "bold", cap);
    const pitch = (cap * G.row_pitch) / G.row_cap;
    const width = (s: string) => measure(s, "bold").advance * k * k0;
    const limit = (i: number) => {
      const y = G.row_top + (fixedRows + i) * pitch + cap;
      const room = waveLeftAt(y) - G.value_x - 14;
      return Math.max(120, Math.min(G.value_max_w, room));
    };
    const lines = wrapValue(address, width, limit);
    return { cap, pitch, lines, end: G.row_top + pitch * (fixedRows + lines.length) };
  };
  let p = plan(G.row_cap);
  while (p.end > G.detail_bottom && p.cap > G.row_cap_min) p = plan(p.cap - 1);
  return { cap: p.cap, pitch: p.pitch, lines: p.lines };
}

// -- the card -------------------------------------------------------------------

export function layoutCard(st: Student, C: Palette, measure: Measure, assets: AssetSizes,
                           hasPhoto: boolean, college: College = COLLEGES.scas): Prim[] {
  const out: (Prim | null)[] = [];
  const push = (...p: (Prim | null)[]) => out.push(...p);

  push({ kind: "rect", x: 0, y: 0, w: CARD_W, h: CARD_H, fill: C.white });

  // watermark - the logo, faint, over the detail rows
  if (assets.logo) {
    const w = G.wm_width;
    const h = (w * assets.logo.h) / assets.logo.w;
    const [cx, cy] = G.wm_center;
    push({ kind: "asset", asset: "logo", box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], opacity: G.wm_opacity });
  }

  // header
  push(assets.logo
    ? { kind: "asset", asset: "logo", box: contain(assets.logo, G.logo_box) }
    : { kind: "path", cmds: ellipsePath(G.logo_box), stroke: C.blue, lineWidth: 3 });
  push(fitted(college.name, "heavy", C.blue, G.title_box));
  push(fitted(college.sub, "bold", C.magenta, G.line2_box));
  for (const { text, top, h, color, maxW } of college.lines) {
    push(fittedHeight(measure, text, "bold", C[color], G.hdr_cx, top, h, maxW ?? G.hdr_max_w));
  }

  // chevron
  const { chev_top: t, chev_mid: m, chev_bottom: b, chev_wedge_w: wd } = G;
  push({ kind: "poly", pts: [[0, t], [wd, m], [CARD_W - wd, m], [CARD_W, t], [CARD_W, b], [0, b]], fill: C.hdr_green });

  // batch - reads bottom to top, rotated about the foot of the strip
  const batch = batchLine(st.batch);
  if (batch) {
    push({ kind: "text", text: batch, font: "bold", fill: C.blue, x: 0, y: 0,
           w: G.batch_y1 - G.batch_y0, h: G.batch_cap, origin: [G.batch_x, G.batch_y1], angle: -90 });
  }

  // photo window
  const win = windowPath();
  if (hasPhoto) push({ kind: "photo", clip: win, box: WINDOW_BOX });
  push({ kind: "path", cmds: win, stroke: C.orange, lineWidth: G.photo_stroke });

  // blood group
  const db = G.drop_box;
  if (assets.drop) push({ kind: "asset", asset: "drop", box: contain(assets.drop, db) });
  else {
    const r = (db[2] - db[0]) / 2;
    push({ kind: "poly", pts: teardrop(db[0] + r, db[3] - r, r, db[1]), fill: C.red });
  }
  push(inkCap(measure, formatBloodGroup(st.blood_group), "bold", C.red, (db[0] + db[2]) / 2,
              G.bg_text_top, G.bg_text_cap, 1, "c", G.bg_text_max_w));

  // name + course
  const cx = CARD_W / 2;
  push(inkCap(measure, st.name, "bold", C.magenta, cx, G.name_top, G.name_cap, CONDENSE.name, "c", G.name_max_w));
  push(inkCap(measure, st.course, "bold", C.blue, cx, G.course_top, G.course_cap, CONDENSE.course, "c", G.course_max_w));

  // (REG. NO) / DOB / CONTACT / ADDRESS
  const fixed: [string, string[]][] = [["DOB", [st.dob]], ["CONTACT", [st.contact]]];
  // a sheet without register numbers gets the usual three rows, not a blank one
  if (college.regNo && st.reg_no) fixed.unshift(["REG. NO", [st.reg_no]]);
  const { cap, pitch, lines } = layoutDetails(st.address, measure, fixed.length);
  let y = G.row_top;
  for (const [label, values] of [...fixed, ["ADDRESS", lines] as [string, string[]]]) {
    push(inkCap(measure, label, "bold", C.black, G.label_x, y, cap, CONDENSE.detail));
    push(inkCap(measure, ":", "bold", C.black, G.colon_x, y, cap, CONDENSE.detail));
    values.forEach((v, i) => push(inkCap(measure, v, "bold", C.black, G.value_x, y + i * pitch, cap, CONDENSE.detail)));
    y += pitch * Math.max(1, values.length);
  }

  // signature
  const sb = G.sign_box;
  if (assets.sign) push({ kind: "asset", asset: "sign", box: contain(assets.sign, sb) });
  else {
    push({ kind: "path", stroke: C.sign_green, lineWidth: 3, cmds: [
      { op: "M", x: sb[0], y: sb[3] - 10 },
      { op: "L", x: sb[0] + (sb[2] - sb[0]) * 0.6, y: sb[1] },
      { op: "L", x: sb[2], y: sb[3] },
    ] });
  }
  const pb = G.principal_box;
  push(inkCap(measure, "Principal", "bold", C.navy, pb[0], pb[1], (pb[3] - pb[1]) * 0.72));

  // bottom wave
  for (const [name, p0, p1, p2, p3] of G.wave) {
    push({ kind: "path", fill: C[name], cmds: [
      { op: "M", x: p0[0], y: p0[1] },
      { op: "C", x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], x: p3[0], y: p3[1] },
      { op: "L", x: CARD_W, y: CARD_H },
      { op: "L", x: CARD_W, y: p0[1] },
      { op: "Z" },
    ] });
  }

  return out.filter((p): p is Prim => p !== null);
}
