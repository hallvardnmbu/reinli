import { join, resolve, sep } from "path";

const dir = join(import.meta.dir, "dist");

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

const fallback = () =>
  new Response(Bun.file(join(dir, "index.html")), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" },
  });

export default async function reinli(request) {
  const { pathname } = new URL(request.url);

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (decoded.includes("\0")) return new Response("Bad request", { status: 400 });

  const filePath = decoded === "/" ? "/index.html" : decoded;
  const absPath = resolve(dir, "." + filePath);
  if (!absPath.startsWith(dir + sep)) return new Response("Forbidden", { status: 403 });

  // Content-Type is left to Bun (derived from the extension); the `.gz` variant is
  // served with the original file's type.
  const headers = { "Cache-Control": cacheControl(filePath), Vary: "Accept-Encoding" };
  const file = Bun.file(absPath);

  if (request.headers.get("Accept-Encoding")?.includes("gzip")) {
    const gz = Bun.file(absPath + ".gz");
    if (await gz.exists()) {
      return new Response(gz, { headers: { ...headers, "Content-Type": file.type, "Content-Encoding": "gzip" } });
    }
  }

  if (await file.exists()) return new Response(file, { headers });

  // SPA fallback only for extensionless routes; a missing asset is a real 404.
  if (/\.[^/]+$/.test(filePath)) return new Response("Not found", { status: 404 });
  return fallback();
}
