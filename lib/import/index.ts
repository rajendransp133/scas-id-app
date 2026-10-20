// Workbook import, end to end: cells + embedded photos -> students with photos.

import { coverage, type Coverage } from "./coverage";
import { readCells, rowsToStudents, type BookKind, type ParsedStudent } from "./cells";
import { resolvePhotos, type Resolved } from "./merge";
import { extractXlsxPhotos, type RowPhotos } from "./xlsxPhotos";

export type { ParsedStudent } from "./cells";
export type { EmbeddedPhoto } from "./xlsxPhotos";
export type { Resolved } from "./merge";
export type { Coverage } from "./coverage";

export interface SheetSummary {
  name: string;
  students: number;
  photos: number;     // pictures found on the sheet
}

export interface ImportedSheet<F> {
  name: string;
  kind: BookKind;
  parsed: ParsedStudent[];
  photos: Resolved<F>[];
  coverage: Coverage;
}

export interface Book {
  fileName: string;
  kind: BookKind;
  data: Uint8Array;
  sheets: { name: string; parsed: ParsedStudent[] }[];
}

/** Embedded pictures can only be read from the zip-based formats. */
export const canHoldPhotos = (kind: BookKind) => kind === "xlsx";

export function openBook(data: ArrayBuffer | Uint8Array, fileName: string): Book {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = readCells(bytes, fileName);
  return {
    fileName, kind: wb.kind, data: bytes,
    sheets: wb.sheets.map((s) => ({ name: s.name, parsed: rowsToStudents(s.rows) })),
  };
}

export async function rowPhotosFor(book: Book, sheet: string): Promise<RowPhotos> {
  return canHoldPhotos(book.kind) ? extractXlsxPhotos(book.data, sheet) : new Map();
}

/** Per-sheet counts, so a class split across two sheets gets noticed. */
export async function summarizeSheets(book: Book): Promise<SheetSummary[]> {
  return Promise.all(book.sheets.map(async (s) => ({
    name: s.name,
    students: s.parsed.length,
    photos: (await rowPhotosFor(book, s.name)).size,
  })));
}

export function photoBytes<F>(r: Resolved<F>, fileBytes: (f: F) => Uint8Array | null): Uint8Array | null {
  if (!r) return null;
  return r.source === "embedded" ? r.photo.bytes : fileBytes(r.file);
}

export async function importSheet<F extends { name: string }>(
  book: Book, sheet: string,
  opts: { embedded: boolean; files?: F[]; fileBytes?: (f: F) => Uint8Array | null },
): Promise<ImportedSheet<F>> {
  const s = book.sheets.find((x) => x.name === sheet) ?? book.sheets[0];
  const rows = opts.embedded ? await rowPhotosFor(book, s.name) : null;
  const photos = resolvePhotos(s.parsed, rows, opts.files ?? []);
  const bytes = photos.map((p) => photoBytes(p, opts.fileBytes ?? (() => null)));
  return { name: s.name, kind: book.kind, parsed: s.parsed, photos, coverage: coverage(bytes) };
}
