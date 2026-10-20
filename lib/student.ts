// Values derived from a student record.  Each mirrors the POC exactly; the
// golden files in fixtures/golden pin the behaviour.

/** Name -> file-safe upper-case slug.  The contract for export file names and
 *  for matching bulk-dropped photo files to students. */
export function slugOf(name: string): string {
  const s = name.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s.toUpperCase() || "STUDENT";
}

/** Slugs for a list, with duplicates suffixed _2, _3, ... in order. */
export function uniqueSlugs(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const s = slugOf(n);
    const k = (seen.get(s) ?? 0) + 1;
    seen.set(s, k);
    return k > 1 ? `${s}_${k}` : s;
  });
}

/** "2025-2027" -> "BATCH 2025 - 2027". */
export function batchLine(batch: string): string {
  let b = (batch ?? "").trim();
  if (!b) return "";
  if (!b.toUpperCase().startsWith("BATCH")) b = "BATCH " + b;
  return b.replace(/\s*-\s*/g, " - ").toUpperCase();
}

/** "B+" -> "B +ve",  "AB-" -> "AB -ve",  "A1+ve" -> "A1 +ve",  "o positive" -> "O +ve". */
export function formatBloodGroup(raw: string): string {
  let t = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!t) return "";
  t = t.replace(/(VE|POS(ITIVE)?|NEG(ATIVE)?)$/, (m) =>
    m.startsWith("POS") ? "+" : m.startsWith("NEG") ? "-" : "");
  const m = /^([A-Z0-9]+?)\s*([+-])$/.exec(t);
  return m ? `${m[1]} ${m[2]}ve` : t;
}
