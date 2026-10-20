// Upload -> store: read the dropped files, resolve photos, hash them.

import { hashBytes } from "@/lib/import/coverage";
import { importSheet, type Book } from "@/lib/import";
import type { Student, StudentPhoto } from "@/lib/types";

export interface DroppedFile {
  name: string;
  blob: Blob;
  bytes: Uint8Array;
}

export const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
export const BOOK_ACCEPT = ".xlsx,.xlsm,.xls,.csv";

export async function readDropped(files: File[]): Promise<DroppedFile[]> {
  return Promise.all(files.map(async (f) => ({ name: f.name, blob: f, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

export async function photoFromFile(file: File | Blob, source: StudentPhoto["source"] = "assigned"): Promise<StudentPhoto> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { blob: file, source, hash: hashBytes(bytes) };
}

export async function importForStore(book: Book, sheet: string, embedded: boolean, files: DroppedFile[]):
  Promise<{ students: Student[]; photos: (StudentPhoto | null)[] }> {
  const imp = await importSheet(book, sheet, { embedded, files, fileBytes: (f) => f.bytes });
  const photos = imp.photos.map((r): StudentPhoto | null => {
    if (!r) return null;
    if (r.source === "file") return { blob: r.file.blob, source: "file", hash: hashBytes(r.file.bytes) };
    const { bytes, mime } = r.photo;
    return { blob: new Blob([bytes as BlobPart], { type: mime }), source: "embedded", hash: hashBytes(bytes) };
  });
  return { students: imp.parsed.map((p) => p.student), photos };
}
