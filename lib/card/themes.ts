// Colour themes.  "blue" is the primary (wordmark, course, batch, website);
// the chevron and bottom band are lighter relatives of it.  Everything else is
// a fixed accent.  See CLAUDE.md "Themes".

export type RGB = readonly [number, number, number];

export type PaletteKey =
  | "blue" | "magenta" | "black" | "hdr_green" | "orange" | "red"
  | "sign_green" | "navy" | "yellow" | "green" | "white";

export type Palette = Record<PaletteKey, RGB>;

export const BASE_COLORS: Palette = {
  blue: [0, 0, 254],
  magenta: [246, 58, 215],
  black: [0, 0, 0],
  hdr_green: [10, 190, 118],
  orange: [242, 112, 2],
  red: [255, 2, 4],
  sign_green: [0, 118, 0],
  navy: [0, 0, 78],
  yellow: [255, 223, 0],
  green: [90, 155, 113],
  white: [255, 255, 255],
};

export function hexToRgb(h: string): RGB {
  const s = h.trim().replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as unknown as RGB;
}

export function rgbToHex(c: RGB): string {
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Python's round(): halves go to the even neighbour. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d !== 0.5) return d > 0.5 ? f + 1 : f;
  return f % 2 === 0 ? f : f + 1;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return c1.map((a, i) => pyRound(a + (c2[i] - a) * t)) as unknown as RGB;
}

const shade = (c: RGB, t: number) => mix(c, [0, 0, 0], t);

// colorsys.rgb_to_hls / hls_to_rgb, ported as-is
function rgbToHls(r: number, g: number, b: number): [number, number, number] {
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const sumc = maxc + minc;
  const rangec = maxc - minc;
  const l = sumc / 2;
  if (minc === maxc) return [0, l, 0];
  const s = l <= 0.5 ? rangec / sumc : rangec / (2 - maxc - minc);
  const rc = (maxc - r) / rangec;
  const gc = (maxc - g) / rangec;
  const bc = (maxc - b) / rangec;
  let h = r === maxc ? bc - gc : g === maxc ? 2 + rc - bc : 4 + gc - rc;
  h = ((h / 6) % 1 + 1) % 1;
  return [h, l, s];
}

function v(m1: number, m2: number, hue: number): number {
  hue = ((hue % 1) + 1) % 1;
  if (hue < 1 / 6) return m1 + (m2 - m1) * hue * 6;
  if (hue < 0.5) return m2;
  if (hue < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - hue) * 6;
  return m1;
}

function hlsToRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
  const m1 = 2 * l - m2;
  return [v(m1, m2, h + 1 / 3), v(m1, m2, h), v(m1, m2, h - 1 / 3)];
}

const hls = (c: RGB) => rgbToHls(c[0] / 255, c[1] / 255, c[2] / 255);

/** Same hue as `c`, at the given lightness / saturation. */
function at(c: RGB, lightness: number, saturation?: number): RGB {
  const [h, , s] = hls(c);
  return hlsToRgb(h, lightness, saturation ?? s).map((x) => pyRound(x * 255)) as unknown as RGB;
}

function hueGap(c1: RGB, c2: RGB): number {
  const d = Math.abs(hls(c1)[0] - hls(c2)[0]) % 1;
  return Math.min(d, 1 - d);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Build a full palette from one primary colour. */
export function makeTheme(primary: string | RGB, overrides: Partial<Record<PaletteKey, string>> = {}): Palette {
  const p = typeof primary === "string" ? hexToRgb(primary) : primary;
  const [, l, s] = hls(p);
  const theme: Palette = {
    ...BASE_COLORS,
    blue: p,
    navy: shade(p, 0.45),
    hdr_green: at(p, clamp(l + 0.1, 0.42, 0.55), clamp(s, 0.75, 1)),
    green: at(p, 0.55, clamp(s * 0.62, 0.45, 0.85)),
  };
  // the name is printed in the magenta accent; a primary in the same corner of
  // the wheel would swallow it, so the name switches to a contrasting blue
  if (hueGap(p, BASE_COLORS.magenta) < 0.11) theme.magenta = hexToRgb("#0047ff");
  for (const [k, hex] of Object.entries(overrides)) theme[k as PaletteKey] = hexToRgb(hex!);
  return theme;
}

const VIVID: Record<string, string> = {
  parrot: "#3dbf00",
  emerald: "#00a651",
  turquoise: "#00b3c8",
  electric: "#0066ff",
  violet: "#6a00ff",
  purple: "#a800c7",
  magenta: "#ff0080",
  crimson: "#ed0b2c",
  flame: "#ff5a00",
  gold: "#e09000",
};

export const THEMES: Record<string, Palette> = {
  classic: { ...BASE_COLORS },
  green: makeTheme("#36802d", { hdr_green: "#4caf3c", green: "#7ba96f" }),
  orange: makeTheme("#ff3f12", { hdr_green: "#ff7a4d", green: "#d98368" }),
  navy: makeTheme("#1b4f72", { hdr_green: "#2e86c1", green: "#6e93ae" }),
  ...Object.fromEntries(Object.entries(VIVID).map(([k, hex]) => [k, makeTheme(hex)])),
};

export const THEME_NAMES = Object.keys(THEMES).sort();

export const css = (c: RGB) => rgbToHex(c);
