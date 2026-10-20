// Paints a display list as SVG - the CorelDRAW deliverable.  Shapes stay real
// curves, text stays live <text>, and the only bitmaps (logo, signature,
// blood drop, photo) are embedded once in <defs> and placed with <use>, so a
// sheet of 60 cards carries one logo.  See CLAUDE.md "SVG / CorelDRAW output".

import { drawPhoto, type Ctx2D, type Img } from "@/lib/photo/applyEdit";
import { DEFAULT_EDIT, type PhotoEdit } from "@/lib/types";
import type { AnyCanvas, MakeCanvas } from "./canvasBackend";
import { CARD_H, CARD_W, MM_PER_UNIT, type Box } from "./geometry";
import type { AssetKey, PathCmd, Prim } from "./layout";
import { css } from "./themes";
import { REF_PX, inkH, inkW, type FontKey, type Measure } from "./text";

/** SVG names the faces; CorelDRAW sets them with what that machine has. */
const SVG_FONT: Record<FontKey, { family: string; weight: string }> = {
  heavy: { family: "Arial Black", weight: "normal" },
  bold: { family: "Arial", weight: "bold" },
};

export type Encode = (c: AnyCanvas, type: "image/png" | "image/jpeg", quality?: number) => Promise<Uint8Array>;

/** Coordinates, short: 3 decimals is 1/300 of a pixel at 300 dpi. */
export function num(v: number): string {
  const s = v.toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" || s === "" ? "0" : s;
}

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function pathData(cmds: PathCmd[]): string {
  return cmds.map((c) => {
    switch (c.op) {
      case "M": case "L": return `${c.op}${num(c.x)},${num(c.y)}`;
      case "C": return `C${num(c.x1)},${num(c.y1)} ${num(c.x2)},${num(c.y2)} ${num(c.x)},${num(c.y)}`;
      case "A": return `A${num(c.rx)},${num(c.ry)} 0 0 1 ${num(c.x)},${num(c.y)}`;
      case "Z": return "Z";
    }
  }).join(" ");
}

export interface SvgPhoto {
  key: string;            // identifies the student's photo + edit within a document
  img: Img;
  edit?: PhotoEdit;
}

/** The <defs> shared by everything on one SVG page. */
export class SvgDefs {
  readonly defs: string[] = [];
  private ids = new Map<string, string>();
  private seq = 0;

  constructor(private make: MakeCanvas, private encode: Encode, readonly raster: number) {}

  private id(base: string) {
    this.seq += 1;
    return `${base}${this.seq}`;
  }

  /** Lay a bitmap exactly over `box`; it is built and embedded once per key. */
  async place(key: string, box: Box, build: (pw: number, ph: number) => AnyCanvas,
              type: "image/png" | "image/jpeg", detail = 1, extra = ""): Promise<string> {
    const [x0, y0, x1, y1] = box;
    const w = x1 - x0;
    const h = y1 - y0;
    const pw = Math.max(1, Math.round(w * this.raster * detail));
    const ph = Math.max(1, Math.round(h * this.raster * detail));
    const full = `${key}|${pw}x${ph}`;
    let ref = this.ids.get(full);
    if (!ref) {
      ref = this.id("img");
      this.ids.set(full, ref);
      const bytes = await this.encode(build(pw, ph), type, type === "image/jpeg" ? 0.92 : undefined);
      this.defs.push(`<image id="${ref}" width="${pw}" height="${ph}" preserveAspectRatio="none" ` +
                     `xlink:href="data:${type};base64,${base64(bytes)}"/>`);
    }
    return `<use xlink:href="#${ref}" transform="translate(${num(x0)},${num(y0)}) scale(${num(w / pw)},${num(h / ph)})"${extra}/>`;
  }

  clip(d: string): string {
    const key = "clip|" + d;
    let ref = this.ids.get(key);
    if (!ref) {
      ref = this.id("clip");
      this.ids.set(key, ref);
      this.defs.push(`<clipPath id="${ref}"><path d="${d}"/></clipPath>`);
    }
    return ref;
  }

  asset(name: AssetKey, img: Img, box: Box, opacity?: number): Promise<string> {
    // the watermark is printed at 11%: half resolution is invisible there
    const detail = opacity !== undefined && opacity < 1 ? 0.5 : 1;
    return this.place(`asset:${name}`, box, (pw, ph) => {
      const c = this.make(pw, ph);
      const ctx = c.getContext("2d") as Ctx2D;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, pw, ph);
      return c;
    }, "image/png", detail, opacity !== undefined ? ` opacity="${opacity}"` : "");
  }

  photo(p: SvgPhoto, box: Box): Promise<string> {
    return this.place(`photo:${p.key}`, box, (pw, ph) => {
      const c = this.make(pw, ph);
      const ctx = c.getContext("2d") as Ctx2D;
      ctx.scale(pw / (box[2] - box[0]), ph / (box[3] - box[1]));
      drawPhoto(ctx, p.img, [0, 0, box[2] - box[0], box[3] - box[1]], p.edit ?? DEFAULT_EDIT,
                { outPxPerUnit: this.raster, make: this.make });
      return c;
    }, "image/jpeg");
  }
}

export interface SvgInputs {
  measure: Measure;
  assets: Partial<Record<AssetKey, Img>>;
  photo?: SvgPhoto | null;
}

/** One card's elements, in card units. */
export async function svgElements(prims: Prim[], defs: SvgDefs, inp: SvgInputs): Promise<string> {
  const out: string[] = [];
  for (const p of prims) {
    switch (p.kind) {
      case "rect":
        out.push(`<rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}" fill="${css(p.fill)}"/>`);
        break;
      case "poly":
        out.push(`<polygon points="${p.pts.map(([x, y]) => `${num(x)},${num(y)}`).join(" ")}" fill="${css(p.fill)}"/>`);
        break;
      case "path": {
        const fill = p.fill ? css(p.fill) : "none";
        const stroke = p.stroke ? ` stroke="${css(p.stroke)}" stroke-width="${num(p.lineWidth ?? 1)}" stroke-linejoin="round"` : "";
        out.push(`<path d="${pathData(p.cmds)}" fill="${fill}"${stroke}/>`);
        break;
      }
      case "asset": {
        const img = inp.assets[p.asset];
        if (img) out.push(await defs.asset(p.asset, img, p.box, p.opacity));
        break;
      }
      case "photo":
        if (inp.photo) out.push(`<g clip-path="url(#${defs.clip(pathData(p.clip))})">${await defs.photo(inp.photo, p.box)}</g>`);
        break;
      case "text": {
        const m = inp.measure(p.text, p.font);
        const bw = inkW(m);
        const bh = inkH(m);
        if (bw <= 0 || bh <= 0) break;
        const f = SVG_FONT[p.font];
        let el = `<g transform="translate(${num(p.x)},${num(p.y)}) scale(${num(p.w / bw)},${num(p.h / bh)})">` +
          `<text x="${num(m.left)}" y="${num(m.ascent)}" font-family="${f.family}" font-size="${REF_PX}" ` +
          `font-weight="${f.weight}" font-kerning="none" fill="${css(p.fill)}" xml:space="preserve">${esc(p.text)}</text></g>`;
        if (p.origin || p.angle) {
          const [ox, oy] = p.origin ?? [0, 0];
          el = `<g transform="translate(${num(ox)},${num(oy)})${p.angle ? ` rotate(${num(p.angle)})` : ""}">${el}</g>`;
        }
        out.push(el);
        break;
      }
    }
  }
  return out.join("");
}

/** Wrap drawn elements in a page tagged with its real millimetre size. */
export function svgDocument(body: string, defs: string[], wUnits: number, hUnits: number): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" ` +
      `width="${num(wUnits * MM_PER_UNIT)}mm" height="${num(hUnits * MM_PER_UNIT)}mm" viewBox="0 0 ${num(wUnits)} ${num(hUnits)}">`,
  ];
  if (defs.length) lines.push(`<defs>${defs.join("")}</defs>`);
  lines.push(body, "</svg>", "");
  return lines.join("\n");
}

export async function renderCardSvg(prims: Prim[], inp: SvgInputs, make: MakeCanvas, encode: Encode,
                                    raster = 2): Promise<string> {
  const defs = new SvgDefs(make, encode, raster);
  const body = await svgElements(prims, defs, inp);
  return svgDocument(`<g>${body}</g>`, defs.defs, CARD_W, CARD_H);
}
