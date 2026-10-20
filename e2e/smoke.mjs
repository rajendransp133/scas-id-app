// End-to-end smoke test against the static build, in the system's Edge/Chrome.
//   npm run build && node e2e/smoke.mjs [workbook] [screenshot-dir]
// Uploads a workbook, walks review -> editor -> generate, checks for console
// errors and saves screenshots.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { serve } from "./serve.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const book = resolve(process.argv[2] ?? join(ROOT, "fixtures", "2nd_year_msc_cs.xlsx"));
const shots = resolve(process.argv[3] ?? join(ROOT, "e2e", "shots"));
mkdirSync(shots, { recursive: true });

const server = await serve(join(ROOT, "out"));
const base = `http://127.0.0.1:${server.address().port}`;
const channel = process.env.E2E_CHANNEL ?? "msedge";
const browser = await chromium.launch({ channel });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text());
});
page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
  } catch (e) {
    await page.screenshot({ path: join(shots, `${name}-FAILED.png`) });
    throw e;
  }
  await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false });
  console.log(`ok  ${name} (${Date.now() - t} ms)`);
};

try {
  await step("1-upload", async () => {
    await page.goto(base + "/");
    await page.locator('input[type=file][accept*=".xlsx"]').setInputFiles(book);
    await page.getByRole("button", { name: /Continue with \d+ students/ }).waitFor();
  });

  await step("2-review", async () => {
    await page.getByRole("button", { name: /Continue with \d+ students/ }).click();
    await page.waitForURL("**/review");
    await page.locator("canvas[aria-label^='ID card preview']").waitFor();
    await page.waitForTimeout(1500);
  });

  if (process.env.E2E_FULL) {
    const extra = await import(new URL("./flows.mjs", import.meta.url).href);
    await extra.run({ page, base, step, shots });
  }
} finally {
  await browser.close();
  server.close();
}

if (errors.length) {
  console.error("console errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`screenshots in ${shots}`);
