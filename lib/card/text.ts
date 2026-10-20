// Text measurement and the "ink box" model.  Every run is positioned by the
// box its glyphs actually ink, not by the font's em box, and is measured once
// at a large reference size and scaled - so any font at any DPI lands the same
// ink in the same place.

export type FontKey = "heavy" | "bold";

/** Reference size every run is measured (and drawn) at, before scaling. */
export const REF_PX = 200;

/** CSS font for canvas.  SVG names the faces itself (see svgBackend). */
export const CANVAS_FONT: Record<FontKey, string> = {
  heavy: `900 ${REF_PX}px "Arial Black", "Arial", sans-serif`,
  bold: `bold ${REF_PX}px Arial, "Liberation Sans", Helvetica, sans-serif`,
};

// KERNING: the POC's Pillow had no raqm, so it set every run unkerned, and
// its address line breaks were decided on those wider widths.  Measuring and
// drawing with kerning off reproduces both the spacing and the breaks.

/** Ink extents at REF_PX, relative to the alphabetic-baseline origin -
 *  canvas TextMetrics semantics.  `left` > 0 means ink left of the origin. */
export interface Ink {
  left: number;
  right: number;
  ascent: number;
  descent: number;
  /** advance width - what the POC's address wrapping measured */
  advance: number;
}

export type Measure = (text: string, font: FontKey) => Ink;

type MeasureCtx = {
  font: string;
  fontKerning?: string;
  measureText(text: string): {
    width: number;
    actualBoundingBoxLeft: number;
    actualBoundingBoxRight: number;
    actualBoundingBoxAscent: number;
    actualBoundingBoxDescent: number;
  };
};

/** A cached Measure backed by any 2D context (browser, worker or node). */
export function canvasMeasure(ctx: MeasureCtx): Measure {
  const cache = new Map<string, Ink>();
  return (text, font) => {
    const key = font + "\u0000" + text;
    let ink = cache.get(key);
    if (!ink) {
      ctx.font = CANVAS_FONT[font];
      ctx.fontKerning = "none";            // see KERNING note above
      const m = ctx.measureText(text);
      ink = {
        left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight,
        ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent,
        advance: m.width,
      };
      cache.set(key, ink);
    }
    return ink;
  };
}

export const inkW = (i: Ink) => i.left + i.right;
export const inkH = (i: Ink) => i.ascent + i.descent;

/** Scale that makes a capital "H" `cap` units tall. */
export function capScale(measure: Measure, font: FontKey, cap: number): number {
  return cap / Math.max(1e-6, inkH(measure("H", font)));
}

/**
 * Wrap an address: break after commas first, then between words.  `limit(i)`
 * is the width available to line i (lines shorten towards the wave).  A port
 * of the POC's wrap_value(), including its habit of dropping the space after a
 * comma when two chunks share a line.
 */
export function wrapValue(text: string, width: (s: string) => number,
                          limit: (i: number) => number): string[] {
  text = (text ?? "").trim().replace(/\s+/g, " ");
  if (!text) return [""];

  const parts = text.split(",").map((p) => p.trim());
  const chunks: string[] = [];
  parts.forEach((p, i) => { if (p) chunks.push(i < parts.length - 1 ? p + "," : p); });

  const lines: string[] = [];
  let buf = "";
  for (const chunk of chunks) {
    if (!buf) buf = chunk;
    else {
      const cand = buf.endsWith(",") ? buf + chunk : buf + " " + chunk;
      if (width(cand) <= limit(lines.length)) buf = cand;
      else { lines.push(buf); buf = chunk; }
    }
    // a single chunk can still overflow - break it between words
    while (width(buf) > limit(lines.length)) {
      const words = buf.split(" ");
      if (words.length === 1) break;
      let keep = words[0];
      for (const w of words.slice(1)) {
        if (width(keep + " " + w) <= limit(lines.length)) keep += " " + w;
        else break;
      }
      if (keep === buf) break;
      lines.push(keep);
      buf = buf.slice(keep.length).trim();
    }
  }
  if (buf) lines.push(buf);
  return lines.length ? lines : [""];
}
