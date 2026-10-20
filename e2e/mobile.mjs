// Phone and tablet check with touch emulation: every screen with a class loaded,
// at 360, 390 and 768 px. Fails on sideways page scroll or on visible controls
// under 40 px tall; saves first-screen and full-page screenshots.
//   npm run build && node e2e/mobile.mjs [workbook] [out-dir]
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { serve } from "./serve.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const book = resolve(process.argv[2] ?? join(ROOT, "fixtures", "2nd_year_msc_cs.xlsx"));
const out = resolve(process.argv[3] ?? join(ROOT, "e2e", "shots", "mobile"));
mkdirSync(out, { recursive: true });

const SIZES = [[360, 740], [390, 844], [768, 1024]];
const SCREENS = [["review", "/review"], ["editor", "/editor?i=0"], ["generate", "/generate"]];
const MIN = 40;

const server = await serve(join(ROOT, "out"));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? "msedge" });
const problems = [];

/** Sideways page scroll, and visible controls a thumb can't hit. */
async function audit(page, where) {
  const r = await page.evaluate((min) => {
    const wide = document.documentElement.scrollWidth - window.innerWidth;
    const small = [];
    for (const el of document.querySelectorAll("button, a[href], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select")) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") continue;
      // inline text links inside a sentence are exempt
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
      if (b.height < min - 0.5) small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(b.height)}px`);
    }
    return { wide, small: [...new Set(small)] };
  }, MIN);
  if (r.wide > 0) problems.push(`${where}: page scrolls sideways by ${r.wide}px`);
  for (const s of r.small) problems.push(`${where}: ${s}`);
}

try {
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`${w}: ${e}`));
    await page.goto(base + "/");
    await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("scas-id-cards"); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
    await page.reload();
    await page.waitForTimeout(500);
    await audit(page, `${w} upload-empty`);
    await page.locator('input[type=file][accept*=".xlsx"]').setInputFiles(book);
    const go = page.getByRole("button", { name: /Continue with \d+ students/ });
    await go.waitFor();
    await audit(page, `${w} upload`);
    await page.screenshot({ path: join(out, `${w}-1-upload.png`), fullPage: true });
    await go.click();
    await page.waitForURL("**/review");
    await page.waitForTimeout(1500);
    for (const [i, [name, path]] of SCREENS.entries()) {
      await page.goto(base + path);
      await page.waitForTimeout(2500);
      await audit(page, `${w} ${name}`);
      await page.screenshot({ path: join(out, `${w}-${i + 2}-${name}.png`) });
      await page.screenshot({ path: join(out, `${w}-${i + 2}-${name}-full.png`), fullPage: true });
    }
    // review on a phone: tapping a student brings their details into view
    if (w < 1024) {
      await page.goto(base + "/review");
      await page.waitForTimeout(1500);
      await page.locator("ul[aria-label=Students] li button").nth(2).tap();
      await page.waitForTimeout(800);
      const top = await page.locator("section[aria-label^='Details for']").evaluate((el) => el.getBoundingClientRect().top);
      if (top < 0 || top > 120) problems.push(`${w} review: details at ${Math.round(top)}px after a tap`);
      await page.screenshot({ path: join(out, `${w}-5-review-tapped.png`) });
    }
    await ctx.close();
    console.log(`ok  ${w}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`screens in ${out}`);
