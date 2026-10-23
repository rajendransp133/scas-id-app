/// <reference lib="webworker" />
// Renders an export off the main thread.  Messages in: { job, origin }.
// Messages out: progress | done | error.

import { browserEnv } from "@/lib/browser/env";
import { runJob, type GenJob } from "@/lib/generate/job";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<{ job: GenJob; origin: string }>) => {
  try {
    if (typeof OffscreenCanvas === "undefined" || !new OffscreenCanvas(1, 1).getContext("2d")) {
      ctx.postMessage({ type: "unsupported" });
      return;
    }
    const env = await browserEnv(e.data.job.college ?? "scas", e.data.origin);
    const res = await runJob(e.data.job, env, (p) => ctx.postMessage({ type: "progress", ...p }));
    ctx.postMessage({ type: "done", zip: res.zip, files: res.files });
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
