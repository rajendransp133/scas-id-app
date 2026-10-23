// The rendering environment in a browser context (page or worker).

import type { CollegeId } from "@/lib/card/colleges";
import type { GenEnv } from "@/lib/generate/job";
import { canvasBytes, decodePhoto, ensureFonts, getMeasure, loadCardAssets, makeCanvas } from "./canvas";

export async function browserEnv(college: CollegeId, origin?: string): Promise<GenEnv> {
  await ensureFonts();
  return {
    make: makeCanvas,
    encode: (c, type, q) => canvasBytes(c, type, q),
    decode: decodePhoto,
    assets: await loadCardAssets(college, origin),
    measure: getMeasure(),
  };
}
