// Extra end-to-end flows, run by smoke.mjs when E2E_FULL=1.
// Each later sprint appends its flow here.

export async function run(ctx) {
  const { page, step } = ctx;
  await step("3-editor", async () => {
    await page.getByRole("link", { name: "Edit photo" }).click();
    await page.waitForURL("**/editor?i=0");
    const stage = page.locator("canvas[aria-label^='Photo editing area']");
    await stage.waitFor();
    const box = await stage.boundingBox();
    // drag right and zoom in, then straighten via the slider
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    await page.mouse.wheel(0, -300);
    await page.getByRole("button", { name: "Flip" }).click();
    await page.waitForTimeout(800);
  });

  await step("4-review-edited", async () => {
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForURL("**/review");
    await page.locator("span[title='Edited']").first().waitFor();
    await page.waitForTimeout(1000);
  });

  await step("4b-reload-keeps-session", async () => {
    await page.reload();
    await page.locator("span[title='Edited']").first().waitFor();
    const rows = await page.locator("ul[aria-label=Students] li").count();
    if (rows < 2) throw new Error(`expected the class after reload, got ${rows} rows`);
  });

  await exportFlow(ctx);
}

export async function exportFlow({ page, step, shots }) {
  const { default: JSZip } = await import("jszip");
  const { readFileSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const results = {};

  const generate = async (name) => {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 300_000 }),
      page.getByRole("button", { name: /^Generate \d+ cards/ }).click(),
    ]);
    const path = join(shots, name);
    await dl.saveAs(path);
    return JSZip.loadAsync(readFileSync(path));
  };

  await step("5-generate", async () => {
    await page.locator("nav[aria-label=Steps]:visible").getByRole("link", { name: /^Generate/ }).click();
    await page.waitForURL("**/generate");
    await page.getByRole("button", { name: /^Generate \d+ cards/ }).waitFor();
    await page.waitForTimeout(1500);
  });

  await step("6-export-print", async () => {
    const t = Date.now();
    const zip = await generate("print.zip");
    results.print = { ms: Date.now() - t, files: Object.keys(zip.files).filter((f) => !zip.files[f].dir) };
  });

  await step("7-export-both", async () => {
    await page.getByRole("radio", { name: /classic/ }).click();
    await page.getByLabel("Both").check();
    await page.getByRole("button", { name: /^300$/ }).click();
    await page.getByLabel("Edge smoothing").selectOption("2");
    await page.getByLabel(/Also make A4 print sheets/).check();
    const t = Date.now();
    const zip = await generate("both.zip");
    results.both = { ms: Date.now() - t, files: Object.keys(zip.files).filter((f) => !zip.files[f].dir) };
    const svg = await zip.file(results.both.files.find((f) => f.endsWith(".svg") && f.startsWith("cards/"))).async("string");
    writeFileSync(join(shots, "card.svg"), svg);
  });

  await step("8-svg-in-browser", async () => {
    await page.setViewportSize({ width: 719, height: 1144 });
    await page.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${readFileSync(join(shots, "card.svg")).toString("base64")}" style="width:719px;height:1144px"></body>`);
    await page.waitForTimeout(1000);
  });

  writeFileSync(join(shots, "export.json"), JSON.stringify(results, null, 1));
  return results;
}
