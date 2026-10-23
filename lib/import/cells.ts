// Reading student rows out of a workbook's cells: header detection, the alias
// map, content-based column inference for header-less sheets, and cleaning.
// A port of the POC's load_students(); see CLAUDE.md "Data import".

import * as XLSX from "xlsx";
import type { Student } from "@/lib/types";

/** A calendar value, kept as parts so no timezone can shift it. */
export interface ExcelDate { y: number; m: number; d: number; H: number; M: number; S: number }

export type Cell = string | number | boolean | ExcelDate | null;

/** A non-empty row with its 0-based worksheet row number. */
export type Row = [row: number, cells: Cell[]];

export type BookKind = "xlsx" | "xls" | "csv";

export interface SheetData { name: string; rows: Row[] }

export interface WorkbookData { kind: BookKind; sheets: SheetData[] }

export interface ParsedStudent {
  student: Student;
  /** 0-based worksheet row - the key embedded photos are mapped by */
  row: number;
  /** raw PHOTO column text, if the sheet has one */
  photoCell: string;
}

const ERRORS: Record<number, string> = {
  0x00: "#NULL!", 0x07: "#DIV/0!", 0x0f: "#VALUE!", 0x17: "#REF!",
  0x1d: "#NAME?", 0x24: "#NUM!", 0x2a: "#N/A", 0x2b: "#GETTING_DATA",
};

export function bookKind(fileName: string): BookKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "txt") return "csv";
  if (ext === "xls") return "xls";
  return "xlsx";
}

function isExcelDate(v: Cell): v is ExcelDate {
  return typeof v === "object" && v !== null;
}

function cellValue(c: XLSX.CellObject | undefined, date1904: boolean): Cell {
  if (!c || c.v === undefined || c.v === null) return null;
  switch (c.t) {
    case "s": return String(c.v);
    case "b": return Boolean(c.v);
    case "e": return ERRORS[c.v as number] ?? c.w ?? "#ERR";
    case "d": {
      const d = c.v as Date;
      return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(),
               H: d.getHours(), M: d.getMinutes(), S: d.getSeconds() };
    }
    case "n": {
      const v = c.v as number;
      // a number in a date format is a date - as openpyxl reports it
      if (c.z && typeof c.z === "string" && XLSX.SSF.is_date(c.z)) {
        const p = XLSX.SSF.parse_date_code(v, { date1904 });
        if (p) return { y: p.y, m: p.m, d: p.d, H: p.H, M: p.M, S: p.S };
      }
      return v;
    }
    default: return String(c.v);
  }
}

/** Parse a workbook (xlsx/xlsm/xls) or CSV into rows of cells, per sheet. */
export function readCells(data: ArrayBuffer | Uint8Array, fileName: string): WorkbookData {
  const kind = bookKind(fileName);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let wb: XLSX.WorkBook;
  if (kind === "csv") {
    // every CSV value stays text, as Python's csv module gives it
    let text = new TextDecoder("utf-8").decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    wb = XLSX.read(text, { type: "string", raw: true });
  } else {
    wb = XLSX.read(bytes, { type: "array", cellNF: true, cellDates: false });
  }
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);
  const sheets: SheetData[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows: Row[] = [];
    if (ws && ws["!ref"]) {
      const range = XLSX.utils.decode_range(ws["!ref"]);
      // columns and rows are absolute from A1, like openpyxl's iter_rows()
      for (let r = 0; r <= range.e.r; r++) {
        const cells: Cell[] = [];
        for (let c = 0; c <= range.e.c; c++) {
          cells.push(cellValue(ws[XLSX.utils.encode_cell({ r, c })], date1904));
        }
        if (cells.some((v) => clean(v))) rows.push([r, cells]);
      }
    }
    return { name, rows };
  });
  return { kind, sheets };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Python's str() for the cell types we produce. */
function pyStr(v: Cell): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (isExcelDate(v)) return `${v.y}-${pad(v.m)}-${pad(v.d)} ${pad(v.H)}:${pad(v.M)}:${pad(v.S)}`;
  return String(v);
}

/** Cell -> card text.  Dates become DD.MM.YYYY to match the text cells. */
export function clean(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (isExcelDate(v)) {
    const date = `${pad(v.d)}.${pad(v.m)}.${v.y}`;
    return v.H || v.M || v.S ? `${date} ${pad(v.H)}:${pad(v.M)}` : date;
  }
  return pyStr(v).trim().replace(/\s+/g, " ");
}

/** Header text normalised for alias matching. */
export function norm(h: Cell): string {
  return (h ? pyStr(h) : "").trim().toLowerCase().replace(/\s+/g, " ").replace(/:+$/, "");
}

export type Field = keyof Student | "photo";

export const ALIASES: Record<Field, string[]> = {
  name: ["name of the student", "name", "student name", "student"],
  course: ["cource", "course", "degree", "class", "department", "dept"],
  year: ["year", "study year"],
  dob: ["dob", "date of birth", "d.o.b"],
  contact: ["students mobile no.", "students mobile no", "mobile", "mobile no",
            "contact", "contact no", "phone"],
  address: ["address", "residential address"],
  blood_group: ["blood group", "blood", "bloodgroup", "blood grp"],
  batch: ["batch", "batch year"],
  photo: ["photo", "image", "photo file"],
  reg_no: ["register number", "register no", "reg no", "reg. no", "reg.no", "registration number",
           "registration no", "roll no", "roll number"],
};

export type ColumnMap = Partial<Record<Field, number>>;

/** Exact alias match first, then substring, per field. */
export function mapHeaders(headers: Cell[]): ColumnMap {
  const n = headers.map(norm);
  const out: ColumnMap = {};
  for (const [field, names] of Object.entries(ALIASES) as [Field, string[]][]) {
    let i = n.findIndex((h) => names.includes(h));
    if (i < 0) i = n.findIndex((h) => h !== "" && names.some((a) => h.includes(a)));
    if (i >= 0) out[field] = i;
  }
  return out;
}

const RE_DATE = /^\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}$/;
const RE_BLOOD = /^(AB|A|B|O)\s*[12]?\s*[+-]?\s*(VE|POS(ITIVE)?|NEG(ATIVE)?)?$/i;
const RE_BATCH = /^\d{4}\s*[-/]\s*\d{2,4}$/;

/** Which column is which, from the values - for sheets with no header row. */
export function inferColumns(data: Cell[][]): ColumnMap {
  const width = Math.max(0, ...data.map((r) => r.length));
  const cols: string[][] = [];
  for (let i = 0; i < width; i++) cols.push(data.map((r) => (i < r.length ? clean(r[i]) : "")));

  const frac = (vals: string[], pred: (v: string) => boolean) => {
    const seen = vals.filter(Boolean);
    return seen.length ? seen.filter(pred).length / seen.length : 0;
  };
  const digits = (v: string) => v.replace(/\D/g, "");
  const distinct = (i: number) => new Set(cols[i].filter(Boolean)).size;

  const cmap: ColumnMap = {};
  const free = new Set(Array.from({ length: width }, (_, i) => i));
  const sortedFree = () => [...free].sort((a, b) => a - b);

  const claim = (field: Field, pred: (v: string) => boolean, thresh = 0.6) => {
    let best: number | null = null;
    let score = thresh;
    for (const i of sortedFree()) {
      const f = frac(cols[i], pred);
      if (f > score) { best = i; score = f; }
    }
    if (best !== null) { cmap[field] = best; free.delete(best); }
  };

  claim("blood_group", (v) => RE_BLOOD.test(v));
  claim("batch", (v) => RE_BATCH.test(v));
  claim("dob", (v) => RE_DATE.test(v));
  claim("contact", (v) => { const n = digits(v).length; return n >= 9 && n <= 13 && !RE_DATE.test(v); });
  claim("year", (v) => v.toUpperCase().includes("YEAR"));
  // a serial column: short integers, and they climb
  for (const i of sortedFree()) {
    const vals = cols[i].filter(Boolean);
    if (vals.length && vals.every((v) => /^\d{1,4}$/.test(v)) &&
        vals.every((v, k) => k === 0 || Number(vals[k - 1]) < Number(v))) {
      free.delete(i);
      break;
    }
  }

  const text = sortedFree().filter((i) => cols[i].some(Boolean));
  const nRows = data.length;
  const take = (i: number) => text.splice(text.indexOf(i), 1);

  // the course repeats across a whole class - identify it by repetition, never
  // by length (course names can be longer than addresses)
  if (text.length) {
    const course = text.reduce((a, b) => (distinct(b) < distinct(a) ? b : a));
    if (distinct(course) <= Math.max(3, Math.floor(nRows / 4))) {
      cmap.course = course;
      take(course);
    }
  }
  if (text.length) {
    const avg = (i: number) => cols[i].reduce((s, v) => s + v.length, 0) / Math.max(1, cols[i].length);
    const addr = text.reduce((a, b) => (avg(b) > avg(a) ? b : a));
    cmap.address = addr;
    take(addr);
  }
  if (text.length) {
    cmap.name = text.reduce((a, b) => (distinct(b) > distinct(a) ? b : a));
  }
  return cmap;
}

/** Rows -> students.  Finds the header, or infers the columns without one. */
export function rowsToStudents(rows: Row[]): ParsedStudent[] {
  let headerI = rows.findIndex(([, cells]) => cells.some((c) => norm(c).includes("name")));
  let cmap: ColumnMap;
  let data: Row[];
  if (headerI < 0) {
    cmap = inferColumns(rows.map(([, c]) => c));
    data = rows;
    headerI = -1;
  } else {
    cmap = mapHeaders(rows[headerI][1]);
    data = rows.slice(headerI + 1);
  }
  const out: ParsedStudent[] = [];
  for (const [row, cells] of data) {
    const get = (f: Field) => {
      const i = cmap[f];
      return i !== undefined && i < cells.length ? clean(cells[i]) : "";
    };
    const name = get("name");
    if (!name) continue;
    out.push({
      row,
      photoCell: get("photo"),
      student: {
        name, course: get("course"), year: get("year"), batch: get("batch"),
        dob: get("dob"), contact: get("contact"), address: get("address"),
        blood_group: get("blood_group"), reg_no: get("reg_no"),
      },
    });
  }
  return out;
}
