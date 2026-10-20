// Writes file.gz next to every compressible file in out/, so nginx's
// gzip_static serves them without compressing anything at request time.
//   node deploy/precompress.mjs [dir]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { constants, gzipSync } from "node:zlib";

const root = resolve(process.argv[2] ?? join(import.meta.dirname, "..", "out"));
const EXT = new Set([".html", ".js", ".css", ".txt", ".svg", ".json", ".map", ".ico"]);

let files = 0, before = 0, after = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!EXT.has(extname(p))) continue;
    const src = readFileSync(p);
    const gz = gzipSync(src, { level: constants.Z_BEST_COMPRESSION });
    if (gz.length >= src.length) continue; // nothing gained; serve the original
    writeFileSync(p + ".gz", gz);
    files++; before += src.length; after += gz.length;
  }
};
walk(root);
console.log(`gzipped ${files} files: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
