// Photo coverage: who has a photo, who doesn't, and which students share a
// byte-identical image (Excel stores a duplicate picture once, so two rows
// can legitimately point at the same file - worth an eyeball).

export interface Coverage {
  total: number;
  matched: number;
  missing: number[];          // student indices without a photo
  duplicates: number[][];     // groups of student indices sharing one image
}

/** Content hash of a byte array (cyrb53 + length). */
export function hashBytes(b: Uint8Array): string {
  let h1 = 0xdeadbeef ^ b.length;
  let h2 = 0x41c6ce57 ^ b.length;
  for (let i = 0; i < b.length; i++) {
    h1 = Math.imul(h1 ^ b[i], 2654435761);
    h2 = Math.imul(h2 ^ b[i], 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${b.length}:${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Coverage from content hashes - for the app, where photos are already hashed. */
export function coverageFromHashes(hashes: (string | null)[]): Coverage {
  const missing: number[] = [];
  const groups = new Map<string, number[]>();
  hashes.forEach((h, i) => {
    if (!h) missing.push(i);
    else groups.set(h, [...(groups.get(h) ?? []), i]);
  });
  return {
    total: hashes.length,
    matched: hashes.length - missing.length,
    missing,
    duplicates: [...groups.values()].filter((g) => g.length > 1),
  };
}

/** `photos[i]` is student i's image bytes, or null. */
export function coverage(photos: (Uint8Array | null)[]): Coverage {
  const missing: number[] = [];
  const buckets = new Map<string, number[]>();
  photos.forEach((b, i) => {
    if (!b) { missing.push(i); return; }
    const k = hashBytes(b);
    buckets.set(k, [...(buckets.get(k) ?? []), i]);
  });
  const duplicates: number[][] = [];
  for (const idx of buckets.values()) {
    if (idx.length < 2) continue;
    // confirm: a hash collision must not invent a duplicate
    const first = photos[idx[0]]!;
    const same = idx.filter((i) => sameBytes(first, photos[i]!));
    if (same.length > 1) duplicates.push(same);
  }
  return { total: photos.length, matched: photos.length - missing.length, missing, duplicates };
}
