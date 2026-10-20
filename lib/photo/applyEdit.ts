// How a student photo fills the card's photo window, with the user's
// non-destructive PhotoEdit applied.  Shared by the canvas backend, the SVG
// backend (which bakes the result into a JPEG) and the editor.

import type { Box } from "@/lib/card/geometry";
import { DEFAULT_EDIT, type PhotoEdit } from "@/lib/types";
import { adjustPixels, sharpenParams, unsharp } from "./adjust";

export type Img = CanvasImageSource & { width: number; height: number };

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type Surface = { width: number; height: number; getContext(t: "2d"): unknown };
export type MakeSurface = (w: number, h: number) => Surface;

const defaultMake: MakeSurface = (w, h) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const quarterTurned = (deg: number) => Math.abs(Math.round(deg / 90)) % 2 === 1;

/** Scale (box units per image pixel) at zoom 1: the photo just covers the box. */
export function coverScale(img: { width: number; height: number }, bw: number, bh: number, rotation = 0): number {
  const [iw, ih] = quarterTurned(rotation) ? [img.height, img.width] : [img.width, img.height];
  return Math.max(bw / iw, bh / ih);
}

/** How many output pixels each source pixel becomes, at `pxPerUnit`. */
export function upscaleFactor(img: { width: number; height: number }, box: Box, edit: PhotoEdit,
                              pxPerUnit: number): number {
  return coverScale(img, box[2] - box[0], box[3] - box[1], edit.rotation) * edit.zoom * pxPerUnit;
}

export const hasAdjustments = (e: PhotoEdit) => e.brightness !== 0 || e.contrast !== 0 || e.saturation !== 0;

const adjustedCache = new WeakMap<object, { key: string; out: Surface }>();

/** The source with brightness / contrast / saturation applied (cached). */
export function adjustedSource(img: Img, e: PhotoEdit, make: MakeSurface = defaultMake): Img {
  if (!hasAdjustments(e)) return img;
  const key = `${e.brightness}|${e.contrast}|${e.saturation}`;
  const hit = adjustedCache.get(img);
  if (hit?.key === key) return hit.out as unknown as Img;
  const out = make(img.width, img.height);
  const ctx = out.getContext("2d") as Ctx2D;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  adjustPixels(data.data, e.brightness, e.contrast, e.saturation);
  ctx.putImageData(data, 0, 0);
  adjustedCache.set(img, { key, out });
  return out as unknown as Img;
}

function place(ctx: Ctx2D, img: Img, box: Box, e: PhotoEdit): void {
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const r = coverScale(img, bw, bh, e.rotation) * e.zoom;
  ctx.save();
  ctx.fillStyle = e.fill;
  ctx.fillRect(x0, y0, bw, bh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(x0 + bw / 2 + e.offsetX * bw, y0 + bh / 2 + e.offsetY * bh);
  ctx.rotate((e.rotation * Math.PI) / 180);
  ctx.scale(e.flipH ? -r : r, r);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

export interface DrawOpts {
  /** output px per card unit (dpi / 300) - decides whether sharpening applies */
  outPxPerUnit?: number;
  make?: MakeSurface;
}

/**
 * Draw `img` into `box` (in the context's current units).  With the default
 * edit the photo is cover-fitted and centred, as the POC did.  The caller sets
 * any clip; the fill colour is painted across the box first.
 */
export function drawPhoto(ctx: Ctx2D, img: Img, box: Box, edit: PhotoEdit = DEFAULT_EDIT, opts: DrawOpts = {}): void {
  const make = opts.make ?? defaultMake;
  const src = adjustedSource(img, edit, make);
  const dev = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);     // device px per unit
  const out = opts.outPxPerUnit ?? dev;
  const r = upscaleFactor(src, box, edit, out);
  if (!edit.sharpen || r <= 1.05) {
    place(ctx, src, box, edit);
    return;
  }
  // Sharpen at device resolution: draw the box onto its own surface, apply
  // the POC's unsharp mask (radii scaled from output to device px), paste back.
  const bw = box[2] - box[0];
  const bh = box[3] - box[1];
  const w = Math.max(1, Math.round(bw * dev));
  const h = Math.max(1, Math.round(bh * dev));
  const tmp = make(w, h);
  const t = tmp.getContext("2d") as Ctx2D;
  t.scale(w / bw, h / bh);
  place(t, src, [0, 0, bw, bh], edit);
  const data = t.getImageData(0, 0, w, h);
  const p = sharpenParams(r);
  unsharp(data.data, w, h, p.radius * (dev / out), p.percent, p.threshold);
  t.putImageData(data, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tmp as unknown as CanvasImageSource, box[0], box[1], bw, bh);
  ctx.restore();
}
