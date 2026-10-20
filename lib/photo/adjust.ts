// Pixel operations for the photo editor.  Pure functions over RGBA buffers, so
// they behave the same in the page, in a worker and in tests.

/** Brightness / contrast / saturation, each -1..1 with 0 = untouched. */
export function adjustPixels(px: Uint8ClampedArray, brightness: number, contrast: number, saturation: number): void {
  const b = 1 + brightness;
  const c = 1 + contrast;
  const s = 1 + saturation;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] * b;
    let g = px[i + 1] * b;
    let bl = px[i + 2] * b;
    r = (r - 128) * c + 128;
    g = (g - 128) * c + 128;
    bl = (bl - 128) * c + 128;
    const l = 0.299 * r + 0.587 * g + 0.114 * bl;
    px[i] = l + (r - l) * s;
    px[i + 1] = l + (g - l) * s;
    px[i + 2] = l + (bl - l) * s;
  }
}

/** One horizontal + one vertical box-blur pass of radius r. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[(y * w + Math.min(w - 1, Math.max(0, k))) * 4 + ch];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + ch] = acc / win;
        const add = Math.min(w - 1, x + r + 1);
        const sub = Math.max(0, x - r);
        acc += src[(y * w + add) * 4 + ch] - src[(y * w + sub) * 4 + ch];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 4 + ch];
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + ch] = acc / win;
        const add = Math.min(h - 1, y + r + 1);
        const sub = Math.max(0, y - r);
        acc += tmp[(add * w + x) * 4 + ch] - tmp[(sub * w + x) * 4 + ch];
      }
    }
  }
  return out;
}

/**
 * Unsharp mask in Pillow's terms: Gaussian `radius` (sigma, px), `percent`
 * strength, and a `threshold` below which differences are left alone.  The
 * Gaussian is approximated by three box blurs.
 */
export function unsharp(px: Uint8ClampedArray, w: number, h: number,
                        radius: number, percent: number, threshold: number): void {
  // box radius whose 3-pass result matches sigma: sigma^2 = 3 * ((2r+1)^2 - 1) / 12
  const r = Math.max(1, Math.round((Math.sqrt(4 * radius * radius + 1) - 1) / 2));
  let blur: Float32Array = Float32Array.from(px);
  for (let i = 0; i < 3; i++) blur = boxBlur(blur, w, h, r);
  const k = percent / 100;
  for (let i = 0; i < px.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const v = px[i + ch];
      const d = v - blur[i + ch];
      if (Math.abs(d) >= threshold) px[i + ch] = v + d * k;
    }
  }
}

/** The POC's sharpening for a photo enlarged `r` times. */
export function sharpenParams(r: number): { radius: number; percent: number; threshold: number } {
  return { radius: Math.max(1, Math.min(4, r * 0.9)), percent: Math.min(110, 45 * r), threshold: 3 };
}
