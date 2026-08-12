// A minimal static file server with COOP/COEP headers, used only by the
// e2e test suite. Zero dependencies, on purpose - same "no unverified
// moving parts" philosophy as the rest of this project. This is NOT meant
// as a production server; see deploy/ for real per-platform header configs.

import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

export function startServer(rootDir, port = 0) {
  const server = http.createServer((req, res) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(rootDir, safePath);

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, "index.html");
    }

    if (!existsSync(filePath)) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    res.setHeader("Content-Type", MIME[extname(filePath)] || "application/octet-stream");
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actualPort = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${actualPort}` });
    });
  });
}

// Allow running directly for manual testing: node e2e/serve-with-headers.mjs [port]
if (import.meta.url === `file://${process.argv[1]}`) {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  const port = Number(process.argv[2]) || 8080;
  const { url } = await startServer(rootDir, port);
  console.log(`Serving ${rootDir} at ${url} with COOP/COEP headers (Ctrl+C to stop)`);
}
