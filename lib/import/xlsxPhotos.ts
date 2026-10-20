// Photos embedded in an .xlsx, mapped to the worksheet row they belong to.
// SheetJS does not expose pictures, so the package is opened with JSZip and the
// XML parts are read directly.  Port of the POC's extract_xlsx_photos(); the
// reasoning behind each rule is in CLAUDE.md "Photos embedded in the workbook".

import JSZip from "jszip";

export interface EmbeddedPhoto {
  bytes: Uint8Array;
  /** the media part it came from, e.g. "xl/media/image3.jpeg" */
  part: string;
  ext: string;
  mime: string;
}

/** {0-based worksheet row: photo} */
export type RowPhotos = Map<number, EmbeddedPhoto>;

const NS = {
  main: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  xlrd: "http://schemas.microsoft.com/office/spreadsheetml/2017/richdata",
  rvr: "http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel",
};

const EMU_PER_POINT = 12700;
const DEFAULT_ROW_PT = 15.0;

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".bmp": "image/bmp", ".webp": "image/webp",
  ".tif": "image/tiff", ".tiff": "image/tiff",
};

// -- small XML helpers (DOMParser in the browser, @xmldom/xmldom in tests) --

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

/** Direct element children, optionally filtered to one namespaced name. */
function children(el: Element, ns?: string, local?: string): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1) continue;
    const e = n as Element;
    if (!local || (e.namespaceURI === ns && e.localName === local)) out.push(e);
  }
  return out;
}

const child = (el: Element, ns: string, local: string) => children(el, ns, local)[0] ?? null;

/** All descendants with this name, in document order. */
function descendants(el: Element | Document, ns: string, local: string): Element[] {
  return Array.from(el.getElementsByTagNameNS(ns, local));
}

function childText(el: Element, ns: string, local: string, dflt: string): string {
  const c = child(el, ns, local);
  return c ? (c.textContent ?? "") : dflt;
}

// -- package helpers --

function normPath(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function extOf(part: string): string {
  const m = /\.[^./]+$/.exec(part);
  return m ? m[0].toLowerCase() : "";
}

class Package {
  constructor(private zip: JSZip) {}

  has(part: string): boolean {
    return this.zip.file(part) !== null;
  }

  async xml(part: string): Promise<Document> {
    return parseXml(await this.zip.file(part)!.async("string"));
  }

  async bytes(part: string): Promise<Uint8Array> {
    return this.zip.file(part)!.async("uint8array");
  }

  /** Relationship id -> target part, resolved relative to `part`. */
  async rels(part: string): Promise<Map<string, string>> {
    const slash = part.lastIndexOf("/");
    const folder = slash >= 0 ? part.slice(0, slash) : "";
    const name = part.slice(slash + 1);
    const relPart = `${folder}/_rels/${name}.rels`;
    const out = new Map<string, string>();
    if (!this.has(relPart)) return out;
    const doc = await this.xml(relPart);
    for (const rel of children(doc.documentElement)) {
      let target = rel.getAttribute("Target") ?? "";
      target = target.startsWith("/") ? target.slice(1) : normPath(`${folder}/${target}`);
      out.set(rel.getAttribute("Id") ?? "", target);
    }
    return out;
  }

  async photo(part: string): Promise<EmbeddedPhoto> {
    const ext = extOf(part);
    return { bytes: await this.bytes(part), part, ext, mime: MIME[ext] ?? "application/octet-stream" };
  }
}

// -- "Place in Cell" images (Excel 365) --

/** In-cell images are values, reached through a chain of index tables:
 *  cell vm -> metadata valueMetadata rc(t,v) -> futureMetadata rvb i ->
 *  rdrichvalue rv v[0] -> richValueRel rel r:id -> media part.
 *  The cell reference *is* the row, so these are exact. */
async function inCellPhotos(pkg: Package, sheet: Document): Promise<RowPhotos> {
  const out: RowPhotos = new Map();
  const need = ["xl/metadata.xml", "xl/richData/rdrichvalue.xml", "xl/richData/richValueRel.xml"];
  if (need.some((p) => !pkg.has(p))) return out;

  const cells: [number, number][] = [];
  for (const c of descendants(sheet, NS.main, "c")) {
    const vm = c.getAttribute("vm");
    if (!vm) continue;
    const digits = (c.getAttribute("r") ?? "").replace(/\D/g, "");
    if (digits) cells.push([Number(digits) - 1, Number(vm)]);
  }
  if (!cells.length) return out;

  const meta = await pkg.xml("xl/metadata.xml");
  const types = descendants(meta, NS.main, "metadataType").map((t) => t.getAttribute("name") ?? "");
  const future = new Map<string, number[]>();
  for (const fm of descendants(meta, NS.main, "futureMetadata")) {
    future.set(fm.getAttribute("name") ?? "", children(fm, NS.main, "bk").map((bk) => {
      const rvb = descendants(bk, NS.xlrd, "rvb")[0];
      return rvb ? Number(rvb.getAttribute("i") ?? "0") : 0;
    }));
  }
  const valueMeta: [number, number][] = [];
  const vmEl = child(meta.documentElement, NS.main, "valueMetadata");
  if (vmEl) {
    for (const bk of children(vmEl, NS.main, "bk")) {
      const rc = child(bk, NS.main, "rc");
      valueMeta.push(rc ? [Number(rc.getAttribute("t") ?? "1"), Number(rc.getAttribute("v") ?? "0")] : [1, 0]);
    }
  }

  const rvs = descendants(await pkg.xml("xl/richData/rdrichvalue.xml"), NS.xlrd, "rv").map((rv) => {
    const v0 = children(rv, NS.xlrd, "v")[0]?.textContent ?? "";
    return /^\d+$/.test(v0) ? Number(v0) : -1;
  });

  const relMap = await pkg.rels("xl/richData/richValueRel.xml");
  const relParts = descendants(await pkg.xml("xl/richData/richValueRel.xml"), NS.rvr, "rel")
    .map((r) => relMap.get(r.getAttributeNS(NS.r, "id") ?? ""));

  const at = <T>(arr: T[], i: number): T | undefined => (i >= 0 && i < arr.length ? arr[i] : undefined);
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [row, vm] of cells) {
    const tv = at(valueMeta, vm - 1);
    if (!tv) continue;
    const type = at(types, tv[0] - 1);
    const rvI = type !== undefined ? at(future.get(type) ?? [], tv[1]) : undefined;
    const relI = rvI !== undefined ? at(rvs, rvI) : undefined;
    const part = relI !== undefined ? at(relParts, relI) : undefined;
    if (!part || !pkg.has(part)) continue;
    out.set(row, await pkg.photo(part));
  }
  return out;
}

// -- floating pictures --

/** Y offset in EMU of the top of each row, from the sheet's own row heights. */
function rowTops(sheet: Document, nRows: number): number[] {
  const fmt = child(sheet.documentElement, NS.main, "sheetFormatPr");
  let defaultPt = DEFAULT_ROW_PT;
  const dflt = fmt?.getAttribute("defaultRowHeight");
  if (dflt) defaultPt = Number(dflt);

  const heights = new Map<number, number>();
  for (const row of descendants(sheet, NS.main, "row")) {
    const r = Number(row.getAttribute("r") ?? "0") - 1;
    const ht = row.getAttribute("ht");
    if (r >= 0 && ht) heights.set(r, Number(ht));
    if (row.getAttribute("hidden") === "1") heights.set(r, 0);
  }
  const tops = [0];
  for (let r = 0; r < nRows; r++) {
    tops.push(tops[tops.length - 1] + pyRound((heights.get(r) ?? defaultPt) * EMU_PER_POINT));
  }
  return tops;
}

/** Python's round(): halves go to the even neighbour. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Find the worksheet part for a sheet name (or the first sheet). */
async function sheetPart(pkg: Package, sheetName: string | null): Promise<string | null> {
  if (!pkg.has("xl/workbook.xml")) return null;
  const wb = await pkg.xml("xl/workbook.xml");
  const rels = await pkg.rels("xl/workbook.xml");
  for (const sh of descendants(wb, NS.main, "sheet")) {
    if (sheetName === null || sh.getAttribute("name") === sheetName) {
      const part = rels.get(sh.getAttributeNS(NS.r, "id") ?? "");
      return part && pkg.has(part) ? part : null;
    }
  }
  return null;
}

/**
 * Pull the photos on one worksheet, keyed by 0-based worksheet row.
 *
 * Floating pictures are placed by their vertical *centre* against a ruler
 * built from the sheet's row heights - the anchor row Excel records is often
 * one row high.  In-cell images carry their row exactly and win.
 */
export async function extractXlsxPhotos(
  data: ArrayBuffer | Uint8Array, sheetName: string | null,
): Promise<RowPhotos> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return new Map();
  }
  const pkg = new Package(zip);
  const part = await sheetPart(pkg, sheetName);
  if (!part) return new Map();

  const sheet = await pkg.xml(part);
  const inCell = await inCellPhotos(pkg, sheet);

  const dr = child(sheet.documentElement, NS.main, "drawing");
  if (!dr) return inCell;
  const drawPart = (await pkg.rels(part)).get(dr.getAttributeNS(NS.r, "id") ?? "");
  if (!drawPart || !pkg.has(drawPart)) return inCell;

  const media = await pkg.rels(drawPart);
  const drawing = await pkg.xml(drawPart);

  const picks: { row: number; rowOff: number; toRow: number; toOff: number; cy: number; part: string }[] = [];
  let maxRow = 0;
  for (const anchor of children(drawing.documentElement)) {
    const frm = child(anchor, NS.xdr, "from");
    const to = child(anchor, NS.xdr, "to");
    const blip = descendants(anchor, NS.a, "blip")[0];
    if (!frm || !blip) continue;
    const mpart = media.get(blip.getAttributeNS(NS.r, "embed") ?? "");
    if (!mpart || !pkg.has(mpart)) continue;
    const row = Number(childText(frm, NS.xdr, "row", "0"));
    const rowOff = Number(childText(frm, NS.xdr, "rowOff", "0"));
    let toRow = row;
    let toOff = 0;
    if (to) {
      toRow = Number(childText(to, NS.xdr, "row", String(row)));
      toOff = Number(childText(to, NS.xdr, "rowOff", "0"));
    }
    // the first a:ext in document order - as the POC read it
    const ext = descendants(anchor, NS.a, "ext")[0];
    const cy = ext ? Number(ext.getAttribute("cy") ?? "0") || 0 : 0;
    picks.push({ row, rowOff, toRow, toOff, cy, part: mpart });
    maxRow = Math.max(maxRow, row, toRow);
  }
  if (!picks.length) return inCell;

  const tops = rowTops(sheet, maxRow + 4);
  const rowAt = (y: number) => {
    let lo = 0;
    let hi = tops.length - 2;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (tops[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const placed = picks.map(({ row, rowOff, toRow, toOff, cy, part: p }) => {
    const top = tops[Math.min(row, tops.length - 1)] + rowOff;
    // a twoCellAnchor without an extent carries its bottom edge instead
    const bot = cy ? top + cy : tops[Math.min(toRow, tops.length - 1)] + toOff;
    return { y: Math.floor((top + Math.max(bot, top)) / 2), part: p };
  });
  placed.sort((a, b) => a.y - b.y || (a.part < b.part ? -1 : a.part > b.part ? 1 : 0));

  const out: RowPhotos = new Map();
  for (const { y, part: p } of placed) {
    let r = rowAt(y);
    while (out.has(r)) r += 1;      // two pictures on one row: take the next
    out.set(r, await pkg.photo(p));
  }
  for (const [r, ph] of inCell) out.set(r, ph);   // an in-cell row is exact
  return out;
}
