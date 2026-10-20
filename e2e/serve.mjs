// Minimal static server for the exported site in out/ (what a host would serve).
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain",
  ".json": "application/json", ".woff2": "font/woff2",
};

export function serve(root, port = 0) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const base = normalize(join(root, url));
    // Next 16 prefetches segments as "__next.<seg>.__PAGE__.txt" but exports them
    // as "__next.<seg>/__PAGE__.txt"; a production host needs the same rewrite.
    const seg = base.replace(/(__next\.[^\\/]+)\.(__PAGE__\.txt)$/, "$1/$2");
    const candidates = [base, seg, base + ".html", join(base, "index.html")];
    const file = candidates.find((p) => p.startsWith(root) && existsSync(p) && statSync(p).isFile());
    if (!file) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
