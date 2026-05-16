import { join } from "path";

const dir = join(import.meta.dir, "dist");

export default async function reinli(request) {
  const url = new URL(request.url);
  const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = Bun.file(join(dir, filePath));
  if (await file.exists()) return new Response(file);
  return new Response(Bun.file(join(dir, "index.html")));
}
