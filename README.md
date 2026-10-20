# SCAS ID Cards

Generates Sudharsan College of Arts and Science student ID cards from a class
workbook, entirely in the browser — no server, nothing uploaded anywhere.

1. **Upload** an `.xlsx` / `.xlsm` / `.xls` / `.csv`: one row per student,
   photos embedded in the sheet or added as files named after the student
   (e.g. `AJITHKUMAR_A.jpg`).
2. **Review** the parsed rows, fix text inline, see who is missing a photo.
3. **Edit photos**: crop, zoom, straighten, flip, fill, light adjustments.
4. **Generate** PNG cards (print DPI written into the file) and/or SVG for
   CorelDRAW, in one or more colour themes, with an optional print sheet and PDF.

Cards are 60.9 × 96.9 mm at any DPI (600 dpi → 1438 × 2288 px).

**CorelDRAW:** *File → Import* the `.svg`; shapes are curves and text is live.
Convert text to curves (Ctrl+Shift+Q) before sending to a print shop.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit + golden tests (fixtures/ is optional)
npm run build        # static site in out/ — host it anywhere
node e2e/smoke.mjs   # browser smoke test against out/ (E2E_FULL=1 for everything)
```

**Host on a VPS:** nginx serving `out/` with pre-gzipped files, built on your
PC and uploaded by `deploy\deploy.ps1`. See `deploy/README.md`.

See `CLAUDE.md` for the card specification and architecture.
