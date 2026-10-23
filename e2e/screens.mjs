// Full-page screenshots of every screen with a class loaded, at three widths,
// for design review (before/after a restyle).
//   npm run build && node e2e/screens.mjs [workbook] [out-dir]
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { serve } from "./serve.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const book = resolve(process.argv[2] ?? join(ROOT, "fixtures", "2nd_year_msc_cs.xlsx"));
const out = resolve(process.argv[3] ?? join(ROOT, "e2e", "shots", "screens"));
mkdirSync(out, { recursive: true });

const WIDTHS = [1440, 768, 390];
const SCREENS = [["review", "/review"], ["editor", "/editor?i=0"], ["generate", "/generate"]];

const server = await serve(join(ROOT, "out"));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await ctx.addInitScript(() => {               // skip the sign-in and college screens
  localStorage.setItem("scas-id-card:session", "admin");
  localStorage.setItem("scas-id-card:college", "scas");
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    await page.goto(base + "/");
    await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("scas-id-cards"); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
    await page.reload();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, `${w}-0-first-run.png`), fullPage: true });
    await page.locator('input[type=file][accept*=".xlsx"]').setInputFiles(book);
    const go = page.getByRole("button", { name: /Continue with \d+ students/ });
    await go.waitFor();
    await page.screenshot({ path: join(out, `${w}-1-upload.png`), fullPage: true });
    await go.click();
    await page.waitForURL("**/review");
    await page.waitForTimeout(1500); // the session is saved 400 ms after a change; goto() reloads
    for (const [name, path] of SCREENS) {
      await page.goto(base + path);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(out, `${w}-${SCREENS.findIndex((s) => s[0] === name) + 2}-${name}.png`), fullPage: true });
    }
    console.log(`ok  ${w}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`screens in ${out}`);
