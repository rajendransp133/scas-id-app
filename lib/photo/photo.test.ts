import { describe, expect, it } from "vitest";
import { WINDOW_BOX } from "@/lib/card/geometry";
import { DEFAULT_EDIT } from "@/lib/types";
import { createCanvas, makeCanvas } from "@/test/nodeCanvas";
import { adjustPixels, sharpenParams, unsharp } from "./adjust";
import { coverScale, drawPhoto, upscaleFactor, type Img } from "./applyEdit";

const make = (w: number, h: number) => makeCanvas(w, h) as never;

function solid(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = createCanvas(w, h);
  draw(c.getContext("2d") as unknown as CanvasRenderingContext2D);
  return c as unknown as Img;
}

describe("adjustments", () => {
  it("leaves pixels alone at zero", () => {
    const px = new Uint8ClampedArray([10, 120, 250, 255]);
    adjustPixels(px, 0, 0, 0);
    expect([...px]).toEqual([10, 120, 250, 255]);
  });

  it("brightens, adds contrast and desaturates", () => {
    const px = new Uint8ClampedArray([100, 100, 100, 255]);
    adjustPixels(px, 0.5, 0, 0);
    expect(px[0]).toBe(150);
    const c = new Uint8ClampedArray([200, 200, 200, 255]);
    adjustPixels(c, 0, 1, 0);
    expect(c[0]).toBe(255);
    const s = new Uint8ClampedArray([255, 0, 0, 255]);
    adjustPixels(s, 0, 0, -1);
    expect(s[0]).toBe(s[1]);
  });

  it("unsharp raises edge contrast and ignores flat areas", () => {
    const w = 20;
    const px = new Uint8ClampedArray(w * w * 4);
    for (let i = 0; i < w * w; i++) {
      const v = i % w < w / 2 ? 80 : 180;
      px.set([v, v, v, 255], i * 4);
    }
    unsharp(px, w, w, 2, 100, 3);
    const row = 10 * w * 4;
    expect(px[row + 9 * 4]).toBeLessThan(80);         // dark side of the edge darkens
    expect(px[row + 10 * 4]).toBeGreaterThan(180);    // light side lightens
    expect(px[row]).toBe(80);                          // far from the edge: untouched
    expect(sharpenParams(3)).toEqual({ radius: 2.7, percent: 110, threshold: 3 });
  });
});

describe("drawPhoto", () => {
  it("cover-fits by default and swaps sides for a quarter turn", () => {
    expect(coverScale({ width: 100, height: 200 }, 325, 378)).toBeCloseTo(3.25);
    expect(coverScale({ width: 100, height: 200 }, 325, 378, 90)).toBeCloseTo(3.78);
    expect(upscaleFactor({ width: 120, height: 160 }, WINDOW_BOX, DEFAULT_EDIT, 2)).toBeCloseTo((325 / 120) * 2);
  });

  it("pans by a fraction of the window and fills uncovered areas", () => {
    // left half black, right half white
    const img = solid(100, 100, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 100, 100); c.fillStyle = "#000"; c.fillRect(0, 0, 50, 100); });
    const box = [0, 0, 100, 100] as const;
    const at = (edit: typeof DEFAULT_EDIT, x: number) => {
      const c = createCanvas(100, 100);
      drawPhoto(c.getContext("2d") as never, img, box, edit, { make });
      return c.getContext("2d").getImageData(x, 50, 1, 1).data[0];
    };
    expect(at(DEFAULT_EDIT, 25)).toBe(0);
    expect(at({ ...DEFAULT_EDIT, offsetX: 0.5 }, 75)).toBe(0);                    // black half moved right
    expect(at({ ...DEFAULT_EDIT, flipH: true }, 25)).toBe(255);                    // mirrored
    expect(at({ ...DEFAULT_EDIT, zoom: 0.5, fill: "#ff0000" }, 5)).toBe(255);      // fill shows at the edge
  });

  it("sharpens only when enlarging", () => {
    const img = solid(10, 10, (c) => { c.fillStyle = "#555"; c.fillRect(0, 0, 10, 10); c.fillStyle = "#aaa"; c.fillRect(5, 0, 5, 10); });
    const draw = (sharpen: boolean) => {
      const c = createCanvas(100, 100);
      drawPhoto(c.getContext("2d") as never, img, [0, 0, 100, 100], { ...DEFAULT_EDIT, sharpen }, { outPxPerUnit: 1, make });
      return [...c.getContext("2d").getImageData(0, 50, 100, 1).data];
    };
    expect(draw(true)).not.toEqual(draw(false));
  });
});
