// One-call card rendering for the app, the worker and the tests.

import type { Img } from "@/lib/photo/applyEdit";
import type { PhotoEdit, Student } from "@/lib/types";
import { renderToCanvas, type AnyCanvas, type MakeCanvas, type PaintInputs } from "./canvasBackend";
import { layoutCard, type AssetKey, type AssetSizes, type Prim } from "./layout";
import type { Palette } from "./themes";
import type { Measure } from "./text";

export type CardAssets = Partial<Record<AssetKey, Img>>;

export function assetSizes(assets: CardAssets): AssetSizes {
  const out: AssetSizes = {};
  for (const [k, img] of Object.entries(assets)) {
    if (img) out[k as AssetKey] = { w: img.width, h: img.height };
  }
  return out;
}

export interface CardJob {
  student: Student;
  palette: Palette;
  photo?: Img | null;
  edit?: PhotoEdit;
}

export function cardPrims(job: CardJob, measure: Measure, assets: CardAssets): Prim[] {
  return layoutCard(job.student, job.palette, measure, assetSizes(assets), Boolean(job.photo));
}

export function renderCardCanvas(make: MakeCanvas, job: CardJob, measure: Measure,
                                 assets: CardAssets, dpi: number, supersample: number,
                                 extra: Partial<PaintInputs> = {}): AnyCanvas {
  const prims = cardPrims(job, measure, assets);
  return renderToCanvas(make, prims, { measure, assets, photo: job.photo, edit: job.edit, ...extra },
                        dpi, supersample);
}
