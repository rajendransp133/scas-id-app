# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A **frontend-only Next.js app** (no backend, no API routes, no server actions) that generates student ID cards for Sudharsan College of Arts and Science (SCAS) and Sudharsan College of Education (SCE); see "Colleges". It replaces a Python proof of concept (`scas-id-card/`, gitignored, safe to delete): **never import, shell out to, or read from that folder**. Everything the app needs from it is specified in this file and pinned by the golden fixtures; treat this file as the source of truth for the card design.

Scope:
1. Bulk upload an Excel workbook (`.xlsx`, also `.xlsm`/`.xls`/`.csv`) holding student rows and their photos.
2. Review/edit the parsed students and see which ones lack a photo.
3. A minimal **photo editor** per student (manual crop/align — **no ML**: no face detection, no auto-crop models).
4. Render cards in the fixed layout below, with every generation option the old CLI had.
5. Export **PNG** (print bitmaps) and **SVG for CorelDRAW** (editable vectors), as single files or a ZIP, plus optional A4 print sheets (PNG + PDF only).

@AGENTS.md

## Stack and commands

- **Next.js 16** (App Router) + React 19 + TypeScript + Tailwind v4, `output: "export"` in `next.config.ts` so the build is a static site. This Next version has breaking changes from older training data, so check `node_modules/next/dist/docs/` before using an unfamiliar API. Every page that touches files or canvas is a client component.
- Static export doesn't support dynamic routes without `generateStaticParams`, and student slugs only exist at runtime. So routes take query params (`/editor?i=3`, read with `useSearchParams` inside `<Suspense>`), not `[slug]` segments.
- **This machine's `node` on PATH is broken**: a globally installed npm package called `node` shadows the real binary and prints nothing. Prefix shell commands with `export PATH="/c/Users/rajen/AppData/Local/nvm/v22.14.0:$PATH";` (Git Bash). Keep `@types/node` on ^22, which matches the runtime; Vitest's peer range rejects ^20.
- Libraries: `xlsx` (SheetJS, install from the SheetJS CDN tarball — the npm registry copy is stale) for cell values; `jszip` for reading workbook internals and writing the ZIP export; `jspdf` for the PDF sheet; `zustand` for state. Avoid heavyweight image libs — Canvas 2D does all pixel work.
- `npm run dev` · `npm run build` (static export to `out/`) · `npm run lint` · `npm test` (Vitest) · single test: `npx vitest run path/to/file.test.ts -t "name"` · `npx tsc --noEmit`.
- Tests run the **real canvas backend in Node** via `@napi-rs/canvas` (`test/nodeCanvas.ts` registers `C:/Windows/Fonts/ariblk.ttf` and `arialbd.ttf`; font-dependent tests skip without them). `CARD_DIFF_DIR=<dir> npx vitest run lib/card` dumps renders and diff maps for inspection.
- **End-to-end**: `npm run build && node e2e/smoke.mjs [workbook] [shots-dir]` serves `out/` (`e2e/serve.mjs`) and drives the system Edge via `playwright-core` (`E2E_CHANNEL=chrome` for Chrome). Upload and review run by default. `E2E_FULL=1` adds the editor, reload persistence, two exports (600 dpi print, then both formats in another theme with A4 PNG sheets and PDF) and renders the SVG in the browser (`e2e/flows.mjs`). It fails on any console error or HTTP 4xx. Screenshots and the downloaded ZIPs land in `e2e/shots/` (gitignored). `node e2e/mobile.mjs` emulates touch at 360/390/768 px and fails on sideways page scroll or visible controls under 40 px tall (touch sizes come from `pointer-coarse:h-10` in `components/ui.tsx`; phone inputs use 16 px text so iOS doesn't zoom).
- Static hosting: Next 16 prefetches `__next.<seg>.__PAGE__.txt`, but the export writes `__next.<seg>/__PAGE__.txt`. A host without that rewrite only loses prefetching, because navigation falls back to a full load. `e2e/serve.mjs` shows the mapping.
- Pure logic (parsing, column inference, blood-group formatting, slugging, address wrapping, row mapping, theme math) lives in framework-free modules under `lib/` and is unit-tested. Shared types are in `lib/types.ts`; app state is in `store/useStore.ts` (zustand, keyed by student index).
- **Test fixtures** (`fixtures/`, gitignored because they hold real student data): `2nd_year_msc_cs` (floating pictures, "COURCE" header), `2nd_year_mcom` (in-cell images, 3 sheets of which 2 are empty), `1st_year_math` (both kinds), `1st_year_bcom` (title row above the header, in-cell), `2nd_year_ma_english` (2 populated sheets, floating), `2nd_year_tami.xls` (legacy BIFF, no golden file).
- **Golden references** in `fixtures/golden/` were dumped from the Python POC before it was deleted, and are the oracle for the port. They are produced with the classic theme at 300 dpi, supersample 4, with no sharpening:
  - `<book>.json`: per sheet, `photoRows` (0-based row → sha1 of the image bytes) and `students` with every cleaned field, `slug`, `batchLine`, `bloodLabel`, `photoSha1` and the address layout `detail {cap, pitch, lines}`.
  - `<book>/<SLUG>.png|svg`: reference renders of the first 3 students.
  - `themes.json`, `wave_left.json` (`waveLeftAt` sampled every 10 units) and `blood.json` (formatting cases).

  Tests skip themselves when `fixtures/` is absent.

The card bitmaps are static files in `public/card-assets/`: `college_logo.png` (1266×1151 RGBA), `principal_sign.png` (200×44 RGBA), `blood_drop.png` (663×980 RGBA), and the SCE signature `sce/principal_sign.png` (216×39 RGBA, keyed out of a 241×52 JPEG scan, so it's a little soft at 600 dpi; replace it with a better scan of the same kind). They are already pre-processed: transparent backgrounds, wordmark trimmed off the logo, "Principal" caption trimmed off the signature. The app uses them as they are and never re-derives them.

## Architecture

```
/ (app/page.tsx) ─ lib/import: openBook → summarizeSheets → importSheet
      │            (cells.ts + xlsxPhotos.ts + merge.ts + coverage.ts)
      ▼            lib/browser/importFlow.ts hashes photos into StudentPhoto
store/useStore.ts  students[], photos[] (Blob + hash), edits{i: PhotoEdit}, options, selected
      │            components/Persistence.tsx mirrors it into IndexedDB (lib/browser/persist.ts)
      ├─ /review   table + coverage banner + CardPreview
      ├─ /editor   PhotoStage (manual crop) → setEdit
      └─ /generate options → lib/browser/generate.ts → workers/render.worker.ts → lib/generate/job.ts
                                                     (main-thread fallback runs the same runJob)

lib/card/layout.ts  (student, palette, measure) → Prim[] in card units
   ├─ canvasBackend.ts  paint(Prim[]) on any 2D context → PNG (+ lib/png/phys.ts pHYs DPI)
   └─ svgBackend.ts     the same Prim[] → SVG string (shared <defs>, live <text>)
```

- **One layout, two backends.** `layoutCard` turns `(student, palette)` into a display list (`rect`, `poly`, `path` with M/L/C/A/Z, `asset`, `photo`, ink-box `text` with an optional rotated frame). Both backends only paint that list, so the PNG and SVG can't drift apart. Path `A` commands carry the ellipse centre and angles for canvas, and the endpoint for SVG.
- **Measuring.** Every text decision goes through a `Measure` (`lib/card/text.ts`: `canvasMeasure` over any 2D context, cached). Layout, both backends and the tests share one measurer per environment. `lib/browser/canvas.ts` holds the browser singletons: `makeCanvas` (OffscreenCanvas or `<canvas>`), `ensureFonts`, `getMeasure`, `loadCardAssets` and `decodePhoto` (EXIF-aware, cached per Blob).
- **Photos.** Original bytes are never modified. `PhotoEdit` is applied at render time by `lib/photo/applyEdit.ts` (`drawPhoto`), which is shared by the canvas backend, the SVG backend (baked into the embedded JPEG) and the editor stage. `effectiveEdit()` in the store supplies defaults plus the global sharpen option when a student has no edit. An unreadable photo (`decodePhoto` rejects) renders as an empty window; it never fails a render or an export.
- **Export** (`runJob`): for each theme, PNG cards are drawn onto print-sheet pages as they are rendered, so nothing is held in memory. Sheets are split into pages under 16384 px per side and 64 MP per page (canvas limits), named `sheet-N.png` and added as PDF pages. The SVG sheet is a single page with shared defs. Folders are per theme only when more than one theme is chosen. The runner takes an `AbortSignal`; the worker is cancelled by terminating it.
- **State gotcha:** zustand v5 selectors must return stable values. A selector that builds a new object or array on every call causes React error #185 (infinite update loop). Select primitives, or use `useStore()` / `useStore.getState()` for actions.

## Data import (port of the POC's rules — keep them)

**Student fields:** `name, course, year, batch, dob, contact, address, blood_group, reg_no, photo`.

**Header detection:** the first non-empty row containing a cell whose normalised text includes `"name"` is the header. Normalise = trim, lowercase, collapse whitespace, strip a trailing `:`. For each field, first look for an exact alias match, then a substring match:
```
name        : name of the student | name | student name | student
course      : cource | course | degree | class | department | dept   ("cource" is a real typo in the sheets)
year        : year | study year
dob         : dob | date of birth | d.o.b
contact     : students mobile no. | students mobile no | mobile | mobile no | contact | contact no | phone
address     : address | residential address
blood_group : blood group | blood | bloodgroup | blood grp
batch       : batch | batch year
photo       : photo | image | photo file
reg_no      : register number | register no | reg no | reg. no | reg.no | registration number | registration no | roll no | roll number
```
Header-less inference never fills `reg_no`.

**No header row → infer columns from their contents.** A column is claimed by the first predicate below that more than 60% of its non-empty cells satisfy, choosing the best-scoring free column:
1. `blood_group`: `^(AB|A|B|O)\s*[12]?\s*[+-]?\s*(VE|POS(ITIVE)?|NEG(ATIVE)?)?$` (case-insensitive)
2. `batch`: `^\d{4}\s*[-/]\s*\d{2,4}$`
3. `dob`: `^\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}$`
4. `contact`: 9–13 digits after stripping non-digits, and not a date
5. `year`: contains `"YEAR"`
6. Drop the first remaining serial column (all values are ints of at most 4 digits, strictly increasing).
7. `course` is the text column with the **fewest distinct values**, accepted only if it has at most `max(3, rows/4)` distinct values. Pick it by repetition, never by length: course names can be longer than addresses.
8. `address` is the remaining column with the longest average text. `name` is whatever is left with the most distinct values.

**Cell cleaning:** null → `""`. Dates → `DD.MM.YYYY` (with ` HH:MM` only if there is a time). Read with SheetJS `cellDates: true`, and handle raw Excel serial numbers in DOB columns. Integer-valued floats → int (phone numbers must not become `9.15e9`). Collapse whitespace. Skip fully empty rows and rows with no name.

**Workbooks with several sheets:** let the user choose the sheet (the old `--sheet-name`), and show a per-sheet count so a class split across two sheets is noticed.

**Derived values:**
- `slug` = name with each run of non-`[A-Za-z0-9]` characters replaced by `_`, trimmed of `_`, uppercased; `"STUDENT"` if empty. Duplicate slugs in one export get `_2`, `_3`, and so on. This slug is used for export file names and for matching bulk-uploaded photos.
- `batchLine`: empty if there's no batch. Otherwise prefix `BATCH ` unless it already starts with "BATCH", normalise `\s*-\s*` to ` - `, and uppercase.
- `formatBloodGroup`: drop whitespace and uppercase; turn a trailing `POS…` into `+`, `NEG…` into `-`, and drop `VE`; then `^([A-Z0-9]+?)([+-])$` → `"$1 $2ve"` (e.g. `B+` → `B +ve`, `A1+ve` → `A1 +ve`). Anything that doesn't match is shown as is.

## Photos embedded in the workbook

SheetJS does not give you pictures, so open the `.xlsx` with JSZip and parse the XML with `DOMParser`. Excel stores a photo in one of two ways, and both must work:

**1. Floating pictures** (`xl/drawings/drawingN.xml` via the sheet's `<drawing r:id>` and its rels). Excel doesn't record which row a picture belongs to, and the anchor row often points one row too high. Derive the row like this:
- Build a vertical ruler in EMU from the sheet's row heights: `ht` in points per `<row>` (hidden rows = 0); missing rows use `sheetFormatPr/@defaultRowHeight`, else 15pt. 1pt = 12700 EMU.
- Picture top = `tops[from.row] + from.rowOff`. Bottom = top + `a:ext/@cy`, or for a twoCellAnchor without `cy`, `tops[to.row] + to.rowOff`.
- The picture's **vertical centre** decides the row (binary search over `tops`). Process pictures sorted by centre; if two land on the same row, push the later one to the next row.
- Never infer rows by sorting pictures and stepping a median pitch. That approach put wrong faces on real cards.

**2. "Place in Cell" images (Excel 365)** are cell values, not drawings: cell `vm="k"` → `xl/metadata.xml` `valueMetadata/bk[k-1]/rc@t,@v` → `metadataType[t-1]@name` → `futureMetadata[name]/bk[v]//xlrd:rvb@i` → `xl/richData/rdrichvalue.xml` `rv[i]/v[0]` → `xl/richData/richValueRel.xml` `rel[n]@r:id` → its rels → the media part. The cell reference gives the row exactly, so in-cell photos win over floating ones on the same row. These cells read back as `#VALUE!` text: a PHOTO column value that isn't a usable image must be ignored, not treated as a photo.

**Photo priority per student:** a photo the user assigned/uploaded in the app → a bulk-dropped image file whose name matches the student's slug (`.jpg/.jpeg/.png`) → the photo embedded on that row. Users can also turn off embedded photos (the old `--no-embedded-photos`).

**Coverage report** (port of `check_photo_rows.py`): per sheet, show `matched/total`, list the students without a photo, and flag rows that share a byte-identical image (Excel stores duplicates once). A student without a photo gets an empty photo window. Warn about this before export, but don't block it.

Legacy `.xls` (BIFF) workbooks: SheetJS reads their cells, but embedded pictures can't be extracted. Say so in the UI and ask the user to add photos by hand.

## Photo editor (manual, no ML)

Its job is to fit a head shot into the card's photo window. Requirements:
- The crop is locked to the window aspect `325/378 ≈ 0.860`, not 35:45, and shown through the window's real shape (ellipse-capped rectangle, with the orange stroke). The preview is the actual card.
- Pan (drag and arrow keys), zoom (wheel, slider, pinch), rotate (90° steps plus a fine straighten slider of about ±15°), and horizontal flip.
- Optional guides to replace the removed face detection: headroom line at about 10% from the top, head-height band at about 70%, centre line, and eye line.
- Fill colour for areas uncovered by zooming out or rotating (default white, plus an eyedropper to pick the backdrop colour).
- Light adjustments: brightness, contrast, saturation. All default to 0. The source photos must be left untouched by default; the POC found that automatic contrast (CLAHE) dulled them.
- Optional sharpening, off by default (the old `--no-sharpen` was the recommended setting). When on, apply it only if the photo is being enlarged: unsharp radius `clamp(r·0.9, 1, 4)` px, amount `min(110, 45·r)`%, threshold 3, where `r` is the upscale factor.
- Replace or upload a photo, reset, before/after toggle, and previous/next student with edits kept.
- A low-resolution warning when the source has fewer pixels than the window at the chosen DPI (many sources are about 120×160 px).
- Read EXIF orientation when decoding (`createImageBitmap(blob, { imageOrientation: "from-image" })`).
- With no edit, the photo is **cover-fitted and centred** in the window's bounding box (scale = `max(boxW/w, boxH/h)`).

`PhotoEdit = { zoom, offsetX, offsetY (in window units), rotation, flipH, fill, brightness, contrast, saturation, sharpen }`. Both backends apply it the same way. The SVG backend bakes it into the embedded JPEG.

## Card design (exact — reproduce, don't redesign)

Card units are **300-DPI pixels**. The card is **719 × 1144** units = 2.397 × 3.813 in = **60.9 × 96.9 mm**. Output scale = `dpi / 300`. The physical size never changes; DPI only sets the pixel count (300 → 719×1144, 600 → 1438×2288, 1200 → 2876×4576).

Header text constants (SCAS): `SUDHARSAN` · `COLLEGE OF ARTS AND SCIENCE` · `PERUMANADU, PUDUKKOTTAI.` · `PH : +91 9150750972, +91 9600409700` · `scascollege.ac.in`. They live in the college profile (`lib/card/colleges.ts`), with the other college's; see "Colleges". The table below is the SCAS card, which the golden files pin.

Paint order: white background → watermark → header → chevron → batch → photo → blood drop → name/course → details → signature → wave.

| Element | Geometry (card units) | Colour key |
|---|---|---|
| Watermark | logo, width 320, centred on (352, 905), opacity 0.11 | — |
| Logo | contain-fit in box (30,42)–(116,137) | — |
| "SUDHARSAN" | ink stretched to fill (136,45)–(687,127), font **Arial Black** | `blue` |
| "COLLEGE OF ARTS AND SCIENCE" | ink stretched to fill (43,149)–(674,176), Arial Bold | `magenta` |
| address / phone / website | centred on x=359, ink height 26 / 27 / 24 at top 191 / 229 / 266, natural width capped at 656 | `black` / `black` / `blue` |
| Chevron | polygon (0,254) (78,300) (641,300) (719,254) (719,304) (0,304) | `hdr_green` |
| Batch line | ink 294 long × 28 cap, rotated −90° (reads bottom to top), at x=45 from y=666 up to y=372; omit if no batch | `blue` |
| Photo window | centre (359, 502.5), w 325, h 378, elliptical caps of ry 138 (rx = w/2) top and bottom, joined by straight sides; photo clipped to it; 4-unit stroke on top | stroke `orange` |
| Blood drop | contain-fit in (598,366)–(662,458) | — |
| Blood group text | centred under the drop centre, top 466, cap 22, max width 118 | `red` |
| Name | centred x=359, top 702, cap 35, condense 0.73, max width 600 | `magenta` |
| Course | centred, top 754, cap 25, condense 0.85, max width 600 | `blue` |
| Detail rows | `DOB`, `CONTACT`, `ADDRESS` labels at x=55, `:` at x=190, values at x=206; top 812, cap 21, pitch 36, condense 0.66 | `black` |
| Signature | contain-fit in (38,1017)–(226,1063) | — |
| "Principal" | left/top at (69,1068), cap = 29·0.72 | `navy` |
| Wave | three cubic Béziers, each closed via (719,1144) and (719,p0.y), painted in this order: `yellow` (718,851) (603,987) (434.4,1088.5) (175,1143); `black` (718,875) (620,993.2) (465.8,1093) (222,1143); `green` (718,900) (628.8,1007.6) (500.7,1093.8) (282,1143) | as listed |

If an asset fails to load, draw a fallback: an outlined ellipse for the logo, a teardrop for the drop, a three-point polyline for the signature.

**Text model ("ink boxes").** All positions refer to the *ink* bounding box of the glyphs, not the font's em box. For a run with cap height `c`: measure the text with `measureText` (`actualBoundingBoxLeft/Right/Ascent/Descent`) at a large reference size (200px). Scale so that the ink of "H" is `c` tall. Multiply the width by the condense factor, and squeeze further to `maxW` if it overflows. Then place the ink box's top-left at the target (centre anchor: x − w/2). Fitted runs (`SUDHARSAN`, line 2) scale the ink independently in x and y to fill their box exactly. Height-fitted runs (header lines 3–5) scale uniformly to the height, then cap the width. Condensing is how a normal-width font reproduces the original narrow lettering.

Fonts: wordmark **Arial Black**, everything else **Arial Bold**. Await `document.fonts.load(...)` before measuring, and fall back to bold sans-serif. Because each run is fitted to a measured ink box, a substitute font changes the letterforms but keeps the layout.

**Kerning off.** The POC's Pillow had no raqm, so it set every run unkerned, and its address line breaks were decided on those wider widths. Measure and draw with `fontKerning = "none"` (canvas) / `font-kerning="none"` (SVG). With kerning on, about 2% of the golden addresses wrap differently. Address wrapping measures the **advance width** (`TextMetrics.width`, which is what Pillow's `getbbox` width was), while positioning uses the **ink box**. Our SVG positions text by true ink boxes; the POC's SVG used Pillow's advance-based boxes, so our SVG matches the PNG output more closely than the POC's own SVG did.

**Address wrapping and auto-shrink.** First split at commas, keeping the comma on the end of each chunk, and join chunks while they fit. Then break between words if a chunk still overflows. The width of line `i` is `clamp(waveLeftAt(y) − 206 − 14, 120, 460)`, where `y = 812 + (2+i)·pitch + cap` and `waveLeftAt` is the left edge of the **yellow** wave curve at that y (the card width above the curve, its end x below it). This makes lines shorten as they approach the wave. The block ends at `812 + pitch·(2 + lines)`. While that is past **1012** (clear of the signature), reduce `cap` by 1, down to a minimum of 15, with `pitch = cap·36/21`, and re-wrap. Both backends must use the same wrap result. The SVG backend measures at 8× scale, so line breaks match the print-resolution bitmap.

## Colleges

`lib/card/colleges.ts` holds one profile per college: the two fitted runs (`name`, `sub`), the height-fitted header `lines` (text, top, height, colour, optional width cap), `regNo`, the logo/signature URLs and the sample workbook. Everything else (geometry, themes, text model, backends) is shared. `layoutCard(..., college)` defaults to SCAS, whose output must stay identical to the golden files.

- **SCAS**: lines at top/height 191/26, 229/27 (black) and 266/24 (website, `blue`); `regNo` off.
- **SCE** (B.Ed.): `SUDHARSAN` / `COLLEGE OF EDUCATION`, then black lines `PERUMANADU, PUDUKKOTTAI - 622 104` (186/22), `COLLEGE CODE : 11620, PH.NO : +91 96599 93525` (216/22), `Approved by the N.C.T.E. No: F.S.R.O /NCTE /B.Ed/ APSO412/2007` (246/17, max width 620) and `Approved by TNTEU/ affiliation /2007/3163` (270/17, max width 520). There's no website. The approval lines must stay clear of the chevron's wedges, which rise from (0,254) to (78,300); `lib/card/colleges.test.ts` checks this. Its signature is `sce/principal_sign.png`, and the logo is shared.
- `regNo` (SCE): a `REG. NO` row goes above DOB when the student has one, and `layoutDetails(address, measure, fixedRows)` counts it, so the address wraps and shrinks against one more row. The DEPARTMENT column maps to `course` and is printed as written (e.g. `B.Ed., ENGLISH`).
- The college is chosen after sign-in, before the upload page (`components/CollegePicker.tsx`). It's stored in localStorage (`lib/browser/college.ts`, key `scas-id-card:college`), survives "Start over", and is cleared on sign-out. Every render path takes it: `CardPreview`, `renderSingle`, and `GenJob.college` for the worker, with assets loaded per college by `loadCardAssets(college)`. The e2e smoke test picks SCAS unless `E2E_COLLEGE=sce`.

## Themes

The palette keys are `blue` (primary: wordmark, course, batch, website), `navy`, `hdr_green` (chevron), `green` (bottom band), and `magenta` (name and line 2). The fixed accents are `black #000000`, `orange #f27002`, `red #ff0204`, `sign_green #007600`, `yellow #ffdf00`, and `white #ffffff`.

| theme | blue | navy | hdr_green | green | magenta |
|---|---|---|---|---|---|
| classic | #0000fe | #00004e | #0abe76 | #5a9b71 | #f63ad7 |
| green | #36802d | #1e4619 | #4caf3c | #7ba96f | #f63ad7 |
| orange | #ff3f12 | #8c230a | #ff7a4d | #d98368 | #f63ad7 |
| navy | #1b4f72 | #0f2b3f | #2e86c1 | #6e93ae | #f63ad7 |
| parrot | #3dbf00 | #226900 | #4df200 | #73d345 | #f63ad7 |
| emerald | #00a651 | #005b2d | #00d96a | #45d38b | #f63ad7 |
| turquoise | #00b3c8 | #00626e | #00e1fb | #45c4d3 | #f63ad7 |
| electric | #0066ff | #00388c | #1a75ff | #457ed3 | #f63ad7 |
| violet | #6a00ff | #3a008c | #791aff | #8045d3 | #f63ad7 |
| purple | #a800c7 | #5c006d | #d300fa | #bd45d3 | #0047ff |
| magenta | #ff0080 | #8c0046 | #ff1a8d | #d3458d | #0047ff |
| crimson | #ed0b2c | #820618 | #f52442 | #cd4b5e | #f63ad7 |
| flame | #ff5a00 | #8c3200 | #ff6b1a | #d37745 | #f63ad7 |
| gold | #e09000 | #7b4f00 | #ffab14 | #d3a145 | #f63ad7 |

**Custom theme from one primary colour `p`** (HLS colour space): `navy` = mix `p` 45% toward black. `hdr_green` = hue of `p` at lightness `clamp(L(p)+0.10, 0.42, 0.55)` and saturation `clamp(S(p), 0.75, 1)`. `green` = hue of `p` at lightness 0.55 and saturation `clamp(S(p)·0.62, 0.45, 0.85)`. If `p`'s hue is within 0.11 (on a 0–1 hue wheel) of the magenta accent, change `magenta` to `#0047ff` so the name still stands out. Individual keys can be overridden. The `green`/`orange`/`navy` rows in the table are hand-tuned overrides of this formula; the vivid rows are the formula's output.

## Generation options (UI equivalents of the old CLI flags)

| Old flag | UI control | Default |
|---|---|---|
| `--theme` | theme picker with live preview, **one theme per export** (`options.themes` holds one; `runJob` still accepts several and then writes a `<theme>/` folder each) | violet |
| `--format png\|svg\|both` | output: PNG, CorelDRAW (SVG), or both | png |
| `--dpi` | 300 (draft), 600 (print), 1200, or custom; show the resulting px and mm | 600 |
| `--supersample` | anti-aliasing 1–4: render at N× and downscale in halving steps with `imageSmoothingQuality = "high"` | 4 |
| `--svg-raster` | resolution of the bitmaps embedded in the SVG, relative to 300 dpi (2 = 600 dpi) | 2 |
| `--no-sheet` / `--pdf` | "also make A4 print sheets": always A4, PNG pages plus a PDF. **Hidden when the output is CorelDRAW (SVG) only, and never written as SVG**; with "Both" it still makes the PNG sheets. No columns, labels or PDF choice to ask for (`--cols`/`--labels` are gone) | off |
| `--no-sharpen` | sharpening toggle (in the editor and globally) | sharpen off |
| `--sheet-name` | sheet selector on import | first sheet |
| `--no-embedded-photos` | "use photos from the workbook" toggle | on |
| `--cdr` | **not possible**: see below | — |

Export: individual downloads plus one ZIP (`cards/<SLUG>.png|svg`, optional `sheet.png`/`sheet-N.png` and `sheet.pdf`; no SVG sheet). Show a summary before exporting: student count, how many have a photo, card size in mm, and bitmap px at the chosen DPI.

**PNG details:** write a `pHYs` chunk with the chosen DPI into each PNG. `canvas.toBlob` doesn't, and print shops rely on it. Use `toBlob`, never `toDataURL`, for large canvases.

**Print sheet:** always **A4 landscape, 4 × 2 cards at actual size**, centred, no gaps (cut along shared edges); `A4`, `a4Slot` and `PER_PAGE` in `lib/generate/job.ts`. Portrait would fit 3 × 3 but leaves only 3 mm top and bottom, inside most printers' unprintable margin; landscape keeps ≥ 8 mm. One page per 8 students (`sheet.png` when there's one page, else `sheet-N.png`). PNG pages are rendered at `min(dpi, 600)` (A4 at 1200 dpi is 139 MP, past canvas limits) with that DPI in pHYs; `sheet.pdf` has one A4 page per sheet.

## SVG / CorelDRAW output

CorelDRAW's `.cdr` format is closed. The POC made `.cdr` files by driving an installed CorelDRAW over COM, which a browser can't do, so the app offers **SVG as the CorelDRAW format**. Users open it with File → Import (or by dragging it in) and get editable curves and live text. Label the option clearly ("CorelDRAW (SVG)") and explain this in the UI. Requirements:
- Root: `width="60.9…mm" height="96.9…mm" viewBox="0 0 719 1144"` (units × 25.4/300), with the `xlink` namespace declared. CorelDRAW expects `xlink:href`.
- Shapes are real vectors: the chevron as a `<polygon>`, the photo window as a path with two `A` arcs (`M cx−a,topC A a,138 0 0 1 cx+a,topC L cx+a,botC A a,138 0 0 1 cx−a,botC Z`, where topC/botC = cy ∓ (h/2 − 138)), and the waves as `C` paths.
- Text stays as live `<text>`: font-size 200, `font-family="Arial Black"` (wordmark) or `"Arial"` with `font-weight="bold"`, `xml:space="preserve"`. Each run sits in a `<g transform="translate(x,y) scale(sx,sy)">` that maps its measured ink box onto the target box. Escape `& < > "`.
- Bitmaps are embedded as base64 data URIs, defined once in `<defs>` and placed with `<use>`. This keeps a sheet of 60 cards from containing 60 copies of the logo, and identical clip paths are shared the same way. Artwork is PNG (keeps alpha); photos are JPEG at quality 0.92, rendered with the PhotoEdit applied at `svgRaster` × units. The watermark is kept as a separate semi-transparent object (`opacity="0.11"`) at half resolution, so it can still be restyled in CorelDRAW.
- Number formatting: at most 3 decimal places, with trailing zeros stripped.
- Unlike the POC, the watermark keeps full colour at half resolution. The POC also cut it to 128 colours; canvas has no cheap way to do that.
- The SVG tests rasterise with `@napi-rs/canvas`, which skips `<use>` → `<image>`, so they compare vector placement against the POC's SVG rasterised the same way. The browser check of the embedded bitmaps is `e2e` step `8-svg-in-browser`.
- Note in the UI that CorelDRAW resets live text using the fonts installed on that machine. Recommend Convert to Curves (Ctrl+Shift+Q) before sending files to a print shop.
