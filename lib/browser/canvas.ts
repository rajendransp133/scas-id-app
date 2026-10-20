// Browser-side plumbing for the card renderer: canvases, fonts, artwork and
// decoded photos.  Works in the page and in a Web Worker.

import type { AnyCanvas, MakeCanvas } from "@/lib/card/canvasBackend";
import type { CardAssets } from "@/lib/card/render";
import { CANVAS_FONT, canvasMeasure, type Measure } from "@/lib/card/text";
import type { Img } from "@/lib/photo/applyEdit";

export const makeCanvas: MakeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h) as unknown as AnyCanvas;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c as unknown as AnyCanvas;
};

let measure: Measure | null = null;

/** One shared, cached measurer.  Call after fonts are ready. */
export function getMeasure(): Measure {
  if (!measure) {
    const ctx = makeCanvas(8, 8).getContext("2d") as CanvasRenderingContext2D;
    measure = canvasMeasure(ctx);
  }
  return measure;
}

let fontsReady: Promise<void> | null = null;

/** Wait until the card fonts (or their fallbacks) are usable for measuring. */
export function ensureFonts(): Promise<void> {
  if (!fontsReady) {
    const fonts = (globalThis as { fonts?: FontFaceSet }).fonts
      ?? (typeof document !== "undefined" ? document.fonts : undefined);
    fontsReady = fonts
      ? Promise.all(Object.values(CANVAS_FONT).map((f) => fonts.load(f, "SUDHARSAN"))).then(() => undefined, () => undefined)
      : Promise.resolve();
  }
  return fontsReady;
}

/** Is the real Arial family available (vs a fallback face)? */
export async function hasCardFonts(): Promise<boolean> {
  await ensureFonts();
  const fonts = typeof document !== "undefined" ? document.fonts : (globalThis as { fonts?: FontFaceSet }).fonts;
  try {
    return Boolean(fonts?.check(`bold 12px Arial`) && fonts?.check(`12px "Arial Black"`));
  } catch {
    return false;
  }
}

export const ASSET_URLS = {
  logo: "/card-assets/college_logo.png",
  sign: "/card-assets/principal_sign.png",
  drop: "/card-assets/blood_drop.png",
} as const;

let assets: Promise<CardAssets> | null = null;

/** The card artwork, decoded once.  A missing file falls back to a shape. */
export function loadCardAssets(base = typeof location !== "undefined" ? location.origin : ""): Promise<CardAssets> {
  if (!assets) {
    assets = (async () => {
      const out: CardAssets = {};
      await Promise.all(Object.entries(ASSET_URLS).map(async ([k, url]) => {
        try {
          const res = await fetch(base + url);
          if (res.ok) out[k as keyof CardAssets] = (await createImageBitmap(await res.blob())) as Img;
        } catch { /* fallback shape */ }
      }));
      return out;
    })();
  }
  return assets;
}

const decoded = new WeakMap<Blob, Promise<Img>>();

/** Decode a photo once, honouring its EXIF orientation. */
export function decodePhoto(blob: Blob): Promise<Img> {
  let p = decoded.get(blob);
  if (!p) {
    p = createImageBitmap(blob, { imageOrientation: "from-image" }) as Promise<Img>;
    decoded.set(blob, p);
  }
  return p;
}

/** Canvas -> PNG/JPEG bytes. */
export async function canvasBytes(c: AnyCanvas, type = "image/png", quality?: number): Promise<Uint8Array> {
  const anyC = c as unknown as {
    convertToBlob?: (o: { type: string; quality?: number }) => Promise<Blob>;
    toBlob?: (cb: (b: Blob | null) => void, type: string, q?: number) => void;
  };
  let blob: Blob | null = null;
  if (anyC.convertToBlob) blob = await anyC.convertToBlob({ type, quality });
  else if (anyC.toBlob) blob = await new Promise((res) => anyC.toBlob!(res, type, quality));
  if (!blob) throw new Error("could not encode canvas");
  return new Uint8Array(await blob.arrayBuffer());
}
