// Paints a display list onto a 2D canvas.  The context is scaled so the list is
// drawn in card units; supersampling renders at N x and reduces in halving
// steps, which keeps the curves smooth.

import { drawPhoto, type Ctx2D, type Img } from "@/lib/photo/applyEdit";
import type { PhotoEdit } from "@/lib/types";
import { BASE_DPI, CARD_H, CARD_W } from "./geometry";
import type { AssetKey, PathCmd, Prim } from "./layout";
import { css } from "./themes";
import { CANVAS_FONT, inkH, inkW, type Measure } from "./text";

export interface AnyCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): unknown;
}

export type MakeCanvas = (w: number, h: number) => AnyCanvas;

export const ctxOf = (c: AnyCanvas) => c.getContext("2d") as Ctx2D;

export interface PaintInputs {
  measure: Measure;
  assets: Partial<Record<AssetKey, Img>>;
  photo?: Img | null;
  edit?: PhotoEdit;
  /** output px per card unit, before supersampling (set by renderToCanvas) */
  outPxPerUnit?: number;
  make?: MakeCanvas;
  /** replaces the photo draw - the SVG and editor paths hook in here */
  drawPhoto?: (ctx: Ctx2D, box: Prim & { kind: "photo" }) => void;
}

export function tracePath(ctx: Ctx2D, cmds: PathCmd[]): void {
  ctx.beginPath();
  for (const c of cmds) {
    switch (c.op) {
      case "M": ctx.moveTo(c.x, c.y); break;
      case "L": ctx.lineTo(c.x, c.y); break;
      case "C": ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y); break;
      case "A": ctx.ellipse(c.cx, c.cy, c.rx, c.ry, 0, c.a0, c.a1, false); break;
      case "Z": ctx.closePath(); break;
    }
  }
}

/** Paint the list in card units onto `ctx` (whose transform maps units -> px). */
export function paint(ctx: Ctx2D, prims: Prim[], inp: PaintInputs): void {
  for (const p of prims) {
    switch (p.kind) {
      case "rect":
        ctx.fillStyle = css(p.fill);
        ctx.fillRect(p.x, p.y, p.w, p.h);
        break;
      case "poly":
        ctx.beginPath();
        p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = css(p.fill);
        ctx.fill();
        break;
      case "path":
        tracePath(ctx, p.cmds);
        if (p.fill) { ctx.fillStyle = css(p.fill); ctx.fill(); }
        if (p.stroke) {
          ctx.strokeStyle = css(p.stroke);
          ctx.lineWidth = p.lineWidth ?? 1;
          ctx.lineJoin = "round";
          ctx.stroke();
        }
        break;
      case "asset": {
        const img = inp.assets[p.asset];
        if (!img) break;
        ctx.save();
        ctx.globalAlpha = p.opacity ?? 1;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, p.box[0], p.box[1], p.box[2] - p.box[0], p.box[3] - p.box[1]);
        ctx.restore();
        break;
      }
      case "photo":
        ctx.save();
        tracePath(ctx, p.clip);
        ctx.clip();
        if (inp.drawPhoto) inp.drawPhoto(ctx, p);
        else if (inp.photo) drawPhoto(ctx, inp.photo, p.box, inp.edit, { outPxPerUnit: inp.outPxPerUnit, make: inp.make });
        ctx.restore();
        break;
      case "text": {
        const m = inp.measure(p.text, p.font);
        const bw = inkW(m);
        const bh = inkH(m);
        if (bw <= 0 || bh <= 0) break;
        ctx.save();
        if (p.origin) ctx.translate(p.origin[0], p.origin[1]);
        if (p.angle) ctx.rotate((p.angle * Math.PI) / 180);
        ctx.translate(p.x, p.y);
        ctx.scale(p.w / bw, p.h / bh);
        ctx.font = CANVAS_FONT[p.font];
        ctx.fontKerning = "none";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = css(p.fill);
        ctx.fillText(p.text, m.left, m.ascent);
        ctx.restore();
        break;
      }
    }
  }
}

/** Output size in px for a DPI. */
export function cardPixels(dpi: number): { w: number; h: number } {
  const s = dpi / BASE_DPI;
  return { w: Math.round(CARD_W * s), h: Math.round(CARD_H * s) };
}

/** Reduce `src` to w x h in halving steps (a cheap stand-in for Lanczos). */
export function downscale(make: MakeCanvas, src: AnyCanvas, w: number, h: number): AnyCanvas {
  let cur = src;
  while (cur.width / 2 >= w * 1.0001 && cur.height / 2 >= h * 1.0001) {
    const next = make(Math.round(cur.width / 2), Math.round(cur.height / 2));
    const c = ctxOf(next);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(cur as unknown as CanvasImageSource, 0, 0, next.width, next.height);
    cur = next;
  }
  if (cur.width === w && cur.height === h) return cur;
  const out = make(w, h);
  const c = ctxOf(out);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  c.drawImage(cur as unknown as CanvasImageSource, 0, 0, w, h);
  return out;
}

/** Render a display list to a canvas at `dpi`, supersampled `ss` times. */
export function renderToCanvas(make: MakeCanvas, prims: Prim[], inp: PaintInputs,
                               dpi: number, ss: number): AnyCanvas {
  const { w, h } = cardPixels(dpi);
  const k = Math.max(1, Math.round(ss));
  const s = (dpi / BASE_DPI) * k;
  const big = make(Math.round(CARD_W * s), Math.round(CARD_H * s));
  const ctx = ctxOf(big);
  ctx.scale(s, s);
  paint(ctx, prims, { outPxPerUnit: dpi / BASE_DPI, make, ...inp });
  return k > 1 ? downscale(make, big, w, h) : big;
}
