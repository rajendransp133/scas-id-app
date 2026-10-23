// Node-side canvas for tests: @napi-rs/canvas speaks the browser Canvas 2D API,
// so the real backends run unchanged.  Fonts are registered under the names the
// app asks for; on Windows these are the same Arial files the POC used.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, GlobalFonts, loadImage, type Image } from "@napi-rs/canvas";
import type { AnyCanvas, MakeCanvas } from "@/lib/card/canvasBackend";
import { COLLEGES, type CollegeId } from "@/lib/card/colleges";
import type { CardAssets } from "@/lib/card/render";
import { canvasMeasure, type Measure } from "@/lib/card/text";
import type { Img } from "@/lib/photo/applyEdit";

const FONTS: [string, string][] = [
  ["C:/Windows/Fonts/ariblk.ttf", "Arial Black"],
  ["C:/Windows/Fonts/arialbd.ttf", "Arial"],
];
export const hasArial = FONTS.every(([p]) => existsSync(p));
for (const [p, name] of FONTS) if (existsSync(p)) GlobalFonts.registerFromPath(p, name);

export const makeCanvas: MakeCanvas = (w, h) => createCanvas(w, h) as unknown as AnyCanvas;

export const nodeMeasure: Measure = canvasMeasure(createCanvas(8, 8).getContext("2d") as never);

export const ROOT = join(__dirname, "..");

export async function loadImg(src: string | Uint8Array): Promise<Img> {
  return (await loadImage(typeof src === "string" ? readFileSync(src) : Buffer.from(src))) as unknown as Img;
}

export async function loadAssets(college: CollegeId = "scas"): Promise<CardAssets> {
  const file = (url: string) => join(ROOT, "public", ...url.split("/").filter(Boolean));
  const { logo, sign } = COLLEGES[college].assets;
  return {
    logo: await loadImg(file(logo)),
    sign: await loadImg(file(sign)),
    drop: await loadImg(file("/card-assets/blood_drop.png")),
  };
}

export function pixels(c: AnyCanvas | Image): Uint8ClampedArray {
  const w = c.width;
  const h = c.height;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.drawImage(c as never, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

export const toPng = (c: AnyCanvas) => (c as unknown as { toBuffer(m: string): Buffer }).toBuffer("image/png");

export { createCanvas, loadImage };
