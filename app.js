import { join } from "path";

const dir = join(import.meta.dir, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".css":  "text/css",
  ".wasm": "application/wasm",
  ".glb":  "model/gltf-binary",
  ".ifc":  "application/octet-stream",
  ".ico":  "image/x-icon",
};

function mimeType(path) {
  const ext = path.match(/\.[^./]+$/)?.[0] ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

function cacheControl(pathname) {
  if (pathname === "/" || pathname === "/index.html") {
    return "no-cache, no-store, must-revalidate";
  }
  // Vite embeds a content hash in JS/CSS filenames — safe to cache forever
  if (/\/[^/]+-[a-zA-Z0-9]{8,}\.(js|css)$/.test(pathname)) {
    return "public, max-age=31536000, immutable";
  }
  // Models and WASM change only on redeploy — cache for one week
  return "public, max-age=604800";
}

export default async function reinli(request) {
  const url = new URL(request.url);
  const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const absPath = join(dir, filePath);

  const headers = {
    "Content-Type": mimeType(absPath),
    "Cache-Control": cacheControl(filePath),
    "Vary": "Accept-Encoding",
  };

  const acceptsGzip = request.headers.get("Accept-Encoding")?.includes("gzip");

  if (acceptsGzip) {
    const gz = Bun.file(absPath + ".gz");
    if (await gz.exists()) {
      return new Response(gz, { headers: { ...headers, "Content-Encoding": "gzip" } });
    }
  }

  const file = Bun.file(absPath);
  if (await file.exists()) return new Response(file, { headers });

  return new Response(Bun.file(join(dir, "index.html")), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
