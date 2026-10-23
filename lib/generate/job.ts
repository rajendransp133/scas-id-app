// A whole export: every card in every chosen theme, as PNG and/or SVG, plus
// the optional A4 print sheets (PNG pages + PDF / SVG pages), zipped.  Runs in a Web
// Worker, or on the main thread when workers can't render.

import { jsPDF } from "jspdf";
import JSZip from "jszip";
import {
  renderToCanvas,
  type AnyCanvas,
  type MakeCanvas,
} from "@/lib/card/canvasBackend";
import { BASE_DPI, CARD_H, CARD_W } from "@/lib/card/geometry";
import { COLLEGES, type CollegeId } from "@/lib/card/colleges";
import { cardPrims, type CardAssets } from "@/lib/card/render";
import {
  SvgDefs,
  svgDocument,
  svgElements,
  type Encode,
} from "@/lib/card/svgBackend";
import { THEMES } from "@/lib/card/themes";
import type { Measure } from "@/lib/card/text";
import type { Ctx2D, Img } from "@/lib/photo/applyEdit";
import { setPngDpi } from "@/lib/png/phys";
import { uniqueSlugs } from "@/lib/student";
import type { GenerateOptions, PhotoEdit, Student } from "@/lib/types";

export interface GenStudent {
  student: Student;
  photo: Blob | null;
  edit: PhotoEdit;
}

export interface GenJob {
  students: GenStudent[];
  options: GenerateOptions;
  zipName: string;
  /** whose header and signature; default SCAS.  `env.assets` must match. */
  college?: CollegeId;
}

export interface GenEnv {
  make: MakeCanvas;
  encode: Encode;
  decode: (b: Blob) => Promise<Img>;
  assets: CardAssets;
  measure: Measure;
}

export interface Progress {
  done: number;
  total: number;
  label: string;
}

export interface GenResult {
  zip: Blob;
  files: string[];
}

/** Print sheets are A4 landscape with 4 × 2 cards, centred, no gaps (cut along
 *  shared edges). Portrait fits 3 × 3 but leaves only 3 mm top and bottom, which
 *  most printers can't reach; landscape keeps ≥ 8 mm all round. Card units. */
const UNITS_PER_MM = BASE_DPI / 25.4;
export const A4 = {
  w: 297 * UNITS_PER_MM,
  h: 210 * UNITS_PER_MM,
  cols: 4,
  rows: 2,
};
export const PER_PAGE = A4.cols * A4.rows;

/** Top-left of the k-th card on a page, in card units. */
export function a4Slot(k: number) {
  return {
    x: (A4.w - A4.cols * CARD_W) / 2 + (k % A4.cols) * CARD_W,
    y: (A4.h - A4.rows * CARD_H) / 2 + Math.floor(k / A4.cols) * CARD_H,
  };
}

/** A4 at 1200 dpi is 139 MP, past browser canvas limits, so sheet pages stop at 600. */
export const SHEET_MAX_DPI = 600;

class Aborted extends Error {
  constructor() {
    super("cancelled");
  }
}

export async function runJob(
  job: GenJob,
  env: GenEnv,
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<GenResult> {
  const o = job.options;
  const college = COLLEGES[job.college ?? "scas"];
  const themes = o.themes.length ? o.themes : ["classic"];
  const wantPng = o.format === "png" || o.format === "both";
  const wantSvg = o.format === "svg" || o.format === "both";
  const n = job.students.length;
  const slugs = uniqueSlugs(job.students.map((s) => s.student.name));
  const zip = new JSZip();
  const files: string[] = [];
  const add = (path: string, data: Uint8Array | string) => {
    zip.file(path, data, {
      compression: typeof data === "string" ? "DEFLATE" : "STORE",
    });
    files.push(path);
  };

  const total = themes.length * n * ((wantPng ? 1 : 0) + (wantSvg ? 1 : 0));
  let done = 0;
  const tick = (label: string) => {
    if (signal?.aborted) throw new Aborted();
    onProgress({ done, total, label });
  };

  // decode each photo once, for every theme
  const imgs = new Map<number, Img | null>();
  const imgOf = async (i: number) => {
    if (!imgs.has(i)) {
      const b = job.students[i].photo;
      imgs.set(i, b ? await env.decode(b).catch(() => null) : null);
    }
    return imgs.get(i)!;
  };

  const pages = Math.ceil(n / PER_PAGE);
  const sheetName = (p: number) => (pages > 1 ? `sheet-${p + 1}` : "sheet");

  for (const theme of themes) {
    const palette = THEMES[theme] ?? THEMES.classic;
    const dir = themes.length > 1 ? `${theme}/` : "";
    const cardFor = async (i: number) => {
      const img = await imgOf(i);
      const cj = {
        student: job.students[i].student,
        palette,
        photo: img,
        edit: job.students[i].edit,
        college,
      };
      return {
        img,
        edit: cj.edit,
        prims: cardPrims(cj, env.measure, env.assets),
      };
    };

    // -- PNG cards + bitmap sheet pages --------------------------------
    if (wantPng) {
      const sd = Math.min(o.dpi, SHEET_MAX_DPI);
      const ps = sd / BASE_DPI;
      let page: AnyCanvas | null = null;
      let pdf: jsPDF | null = null;

      const flushPage = async (p: number) => {
        if (!page) return;
        add(
          `${dir}${sheetName(p)}.png`,
          setPngDpi(await env.encode(page, "image/png"), sd),
        );
        if (!pdf)
          pdf = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: "a4",
            compress: true,
          });
        else pdf.addPage("a4", "landscape");
        pdf.addImage(
          await env.encode(page, "image/jpeg", 0.95),
          "JPEG",
          0,
          0,
          297,
          210,
        );
        page.width = 0; // release the pixels now, not at GC
        page = null;
      };

      for (let i = 0; i < n; i++) {
        tick(`${theme}: ${job.students[i].student.name}`);
        const { img, edit, prims } = await cardFor(i);
        const card = renderToCanvas(
          env.make,
          prims,
          { measure: env.measure, assets: env.assets, photo: img, edit },
          o.dpi,
          o.supersample,
        );
        add(
          `${dir}cards/${slugs[i]}.png`,
          setPngDpi(await env.encode(card, "image/png"), o.dpi),
        );

        if (o.sheet) {
          const k = i % PER_PAGE;
          if (k === 0) {
            await flushPage(i / PER_PAGE - 1);
            page = env.make(Math.round(A4.w * ps), Math.round(A4.h * ps));
            const pc = page.getContext("2d") as Ctx2D;
            pc.fillStyle = "#ffffff";
            pc.fillRect(0, 0, page.width, page.height);
          }
          const pc = page!.getContext("2d") as Ctx2D;
          const { x, y } = a4Slot(k);
          pc.imageSmoothingQuality = "high";
          pc.drawImage(
            card as unknown as CanvasImageSource,
            Math.round(x * ps),
            Math.round(y * ps),
            Math.round(CARD_W * ps),
            Math.round(CARD_H * ps),
          );
        }
        card.width = 0;
        done++;
      }
      if (o.sheet) await flushPage(pages - 1);
      if (pdf)
        add(
          `${dir}sheet.pdf`,
          new Uint8Array((pdf as jsPDF).output("arraybuffer")),
        );
    }

    // -- SVG cards (no sheet: CorelDRAW users lay cards out themselves) -----------------------------------
    if (wantSvg) {
      for (let i = 0; i < n; i++) {
        tick(`${theme}: ${job.students[i].student.name} (svg)`);
        const { img, edit, prims } = await cardFor(i);
        const photo = img ? { key: String(i), img, edit } : null;
        const inp = { measure: env.measure, assets: env.assets, photo };

        const defs = new SvgDefs(env.make, env.encode, o.svgRaster);
        const body = await svgElements(prims, defs, inp);
        add(
          `${dir}cards/${slugs[i]}.svg`,
          svgDocument(`<g>${body}</g>`, defs.defs, CARD_W, CARD_H),
        );

        done++;
      }
    }
  }

  onProgress({ done: total, total, label: "Compressing…" });
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
  });
  return { zip: blob, files };
}
