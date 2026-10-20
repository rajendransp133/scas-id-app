// Starting exports from the page: in a worker when the browser can render
// there, otherwise on the main thread with the same code.

import { renderToCanvas } from "@/lib/card/canvasBackend";
import { cardPrims } from "@/lib/card/render";
import { renderCardSvg } from "@/lib/card/svgBackend";
import { THEMES } from "@/lib/card/themes";
import { runJob, type GenJob, type GenResult, type GenStudent, type Progress } from "@/lib/generate/job";
import { setPngDpi } from "@/lib/png/phys";
import { slugOf } from "@/lib/student";
import type { GenerateOptions } from "@/lib/types";
import { canvasBytes } from "./canvas";
import { browserEnv } from "./env";

export interface Running {
  promise: Promise<GenResult>;
  cancel: () => void;
}

function onMainThread(job: GenJob, onProgress: (p: Progress) => void): Running {
  const ac = new AbortController();
  const promise = (async () => runJob(job, await browserEnv(location.origin), onProgress, ac.signal))();
  return { promise, cancel: () => ac.abort() };
}

export function startJob(job: GenJob, onProgress: (p: Progress) => void): Running {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return onMainThread(job, onProgress);

  const worker = new Worker(new URL("../../workers/render.worker.ts", import.meta.url), { type: "module" });
  let fallback: Running | null = null;
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<GenResult>((resolve, rej) => {
    reject = rej;
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m);
      else if (m.type === "done") { worker.terminate(); resolve({ zip: m.zip, files: m.files }); }
      else if (m.type === "error") { worker.terminate(); rej(new Error(m.message)); }
      else if (m.type === "unsupported") {
        worker.terminate();
        fallback = onMainThread(job, onProgress);
        fallback.promise.then(resolve, rej);
      }
    };
    worker.onerror = (e) => { worker.terminate(); rej(new Error(e.message || "Rendering failed")); };
  });
  worker.postMessage({ job, origin: location.origin });
  return {
    promise,
    cancel: () => {
      if (fallback) fallback.cancel();
      else { worker.terminate(); reject(new Error("cancelled")); }
    },
  };
}

/** One card in the chosen format(s), rendered here and now. */
export async function renderSingle(gs: GenStudent, o: GenerateOptions, theme: string): Promise<{ name: string; blob: Blob }[]> {
  const env = await browserEnv(location.origin);
  const img = gs.photo ? await env.decode(gs.photo).catch(() => null) : null;
  const cj = { student: gs.student, palette: THEMES[theme] ?? THEMES.classic, photo: img, edit: gs.edit };
  const prims = cardPrims(cj, env.measure, env.assets);
  const slug = slugOf(gs.student.name);
  const out: { name: string; blob: Blob }[] = [];
  if (o.format !== "svg") {
    const c = renderToCanvas(env.make, prims, { measure: env.measure, assets: env.assets, photo: img, edit: gs.edit },
                             o.dpi, o.supersample);
    const png = setPngDpi(await canvasBytes(c), o.dpi);
    out.push({ name: `${slug}.png`, blob: new Blob([png as BlobPart], { type: "image/png" }) });
  }
  if (o.format !== "png") {
    const svg = await renderCardSvg(prims, { measure: env.measure, assets: env.assets, photo: img ? { key: "0", img, edit: gs.edit } : null },
                                    env.make, env.encode, o.svgRaster);
    out.push({ name: `${slug}.svg`, blob: new Blob([svg], { type: "image/svg+xml" }) });
  }
  return out;
}

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
