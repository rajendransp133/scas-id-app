// Which photo each student gets.  Priority (after any photo the user assigns
// in the app, which the store handles): a dropped file named in the PHOTO
// column -> a dropped file named <SLUG>.jpg/.jpeg/.png -> the picture embedded
// on that student's row.

import { slugOf } from "@/lib/student";
import type { ParsedStudent } from "./cells";
import type { EmbeddedPhoto, RowPhotos } from "./xlsxPhotos";

export type Resolved<F> =
  | { source: "file"; file: F }
  | { source: "embedded"; photo: EmbeddedPhoto }
  | null;

const PHOTO_EXT = [".jpg", ".jpeg", ".png"];

const baseName = (p: string) => p.split(/[\\/]/).pop()!.toLowerCase();

export function resolvePhotos<F extends { name: string }>(
  parsed: ParsedStudent[], rowPhotos: RowPhotos | null, files: F[] = [],
): Resolved<F>[] {
  const byName = new Map<string, F>();
  for (const f of files) byName.set(baseName(f.name), f);

  return parsed.map(({ student, row, photoCell }) => {
    // A "Place in Cell" image reads back as "#VALUE!" - text, but no file
    if (photoCell) {
      const f = byName.get(baseName(photoCell));
      if (f) return { source: "file", file: f };
    }
    const slug = slugOf(student.name).toLowerCase();
    for (const ext of PHOTO_EXT) {
      const f = byName.get(slug + ext);
      if (f) return { source: "file", file: f };
    }
    const ph = rowPhotos?.get(row);
    return ph ? { source: "embedded", photo: ph } : null;
  });
}
