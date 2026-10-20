// Canvas PNG encoders write no resolution, and print shops rely on it.  This
// inserts (or replaces) a pHYs chunk so the file says its real DPI.

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

let CRC_TABLE: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Return a copy of `png` tagged with `dpi` (pixels per metre, unit = metre). */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (!SIG.every((v, i) => png[i] === v)) throw new Error("not a PNG");
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, ppm);
  dv.setUint32(4, ppm);
  data[8] = 1;
  const phys = chunk("pHYs", data);

  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let o = 8;
  while (o < png.length) {
    const len = u32(png, o);
    const type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    const end = o + 12 + len;
    if (type !== "pHYs") parts.push(png.subarray(o, end));
    if (type === "IHDR") parts.push(phys);
    o = end;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let w = 0;
  for (const p of parts) { out.set(p, w); w += p.length; }
  return out;
}

/** Read the DPI a PNG declares, or null. */
export function getPngDpi(png: Uint8Array): number | null {
  let o = 8;
  while (o < png.length) {
    const len = u32(png, o);
    const type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    if (type === "pHYs" && png[o + 16] === 1) return Math.round(u32(png, o + 8) * 0.0254);
    if (type === "IDAT") return null;
    o += 12 + len;
  }
  return null;
}
