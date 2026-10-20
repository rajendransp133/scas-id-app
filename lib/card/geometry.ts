// The card design.  Every number is in 300-DPI pixels ("card units"); output
// scale = dpi / 300.  Reproduce, don't redesign - see CLAUDE.md "Card design".

export const BASE_DPI = 300;
export const CARD_W = 719;           // 60.9 mm
export const CARD_H = 1144;          // 96.9 mm
export const MM_PER_UNIT = 25.4 / BASE_DPI;

/** Everything printed in the header, in one place. */
export const COLLEGE = {
  name: "SUDHARSAN",
  sub: "COLLEGE OF ARTS AND SCIENCE",
  address: "PERUMANADU, PUDUKKOTTAI.",
  phone: "PH : +91 9150750972, +91 9600409700",
  website: "scascollege.ac.in",
};

export type Box = readonly [x0: number, y0: number, x1: number, y1: number];
export type Pt = readonly [x: number, y: number];
export type WaveColour = "yellow" | "black" | "green";

export const G = {
  // header
  logo_box: [30, 42, 116, 137] as Box,
  title_box: [136, 45, 687, 127] as Box,       // "SUDHARSAN"
  line2_box: [43, 149, 674, 176] as Box,       // COLLEGE OF ARTS AND SCIENCE
  hdr_cx: 359,
  hdr_max_w: 656,
  line3: [191, 26] as const,                   // (top, height) address
  line4: [229, 27] as const,                   // phone numbers
  line5: [266, 24] as const,                   // website
  // chevron under the header
  chev_top: 254,
  chev_mid: 300,
  chev_bottom: 304,
  chev_wedge_w: 78,
  // rotated batch text
  batch_x: 45,
  batch_y0: 372,
  batch_y1: 666,
  batch_cap: 28,
  // photo window (ellipse-capped rectangle)
  photo_cx: 359,
  photo_cy: 502.5,
  photo_w: 325,
  photo_h: 378,
  photo_cap: 138,
  photo_stroke: 4,
  // blood group
  drop_box: [598, 366, 662, 458] as Box,
  bg_text_top: 466,
  bg_text_cap: 22,
  bg_text_max_w: 118,
  // name / course
  name_top: 702,
  name_cap: 35,
  name_max_w: 600,
  course_top: 754,
  course_cap: 25,
  course_max_w: 600,
  // detail rows
  label_x: 55,
  colon_x: 190,
  value_x: 206,
  row_top: 812,
  row_pitch: 36,
  row_cap: 21,
  row_cap_min: 15,                             // auto-shrink floor
  value_max_w: 460,
  detail_bottom: 1012,                         // keep clear of the signature
  // signature
  sign_box: [38, 1017, 226, 1063] as Box,
  principal_box: [69, 1068, 187, 1097] as Box,
  // watermark - centred on the detail rows, faint enough not to swamp them
  wm_center: [352, 905] as Pt,
  wm_width: 320,
  wm_opacity: 0.11,
  // bottom wave - three cubic Beziers, each filled back to the bottom-right
  wave: [
    ["yellow", [718, 851], [603.0, 987.0], [434.4, 1088.5], [175, 1143]],
    ["black", [718, 875], [620.0, 993.2], [465.8, 1093.0], [222, 1143]],
    ["green", [718, 900], [628.8, 1007.6], [500.7, 1093.8], [282, 1143]],
  ] as readonly (readonly [WaveColour, Pt, Pt, Pt, Pt])[],
} as const;

/** Horizontal squeeze per text role - how a normal-width bold face reproduces
 *  the original's narrow lettering. */
export const CONDENSE = { name: 0.73, course: 0.85, detail: 0.66 } as const;

/** Photo window aspect: crops are taken at this, not 35:45. */
export const WINDOW_AR = G.photo_w / G.photo_h;

/** Bounding box of the photo window. */
export const WINDOW_BOX: Box = [
  G.photo_cx - G.photo_w / 2, G.photo_cy - G.photo_h / 2,
  G.photo_cx + G.photo_w / 2, G.photo_cy + G.photo_h / 2,
];

export function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 600): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
    ]);
  }
  return pts;
}

const [, w0, w1, w2, w3] = G.wave[0];
const WAVE_PTS = bezier(w0, w1, w2, w3);

/** Left edge of the bottom-right wave at card-space y, so the address can be
 *  wrapped clear of it. */
export function waveLeftAt(y: number): number {
  const pts = WAVE_PTS;
  if (y <= pts[0][1]) return CARD_W;
  if (y >= pts[pts.length - 1][1]) return pts[pts.length - 1][0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (y0 <= y && y <= y1) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return x0 + t * (x1 - x0);
    }
  }
  return CARD_W;
}
