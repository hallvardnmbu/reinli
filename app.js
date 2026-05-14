import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { dirname, join } from "path";

let __dirname = dirname(new URL(import.meta.url).pathname);
__dirname =
  __dirname.startsWith("/") && __dirname.includes(":")
    ? __dirname.replace(/^\/([A-Z]):/, "$1:\\").replace(/\//g, "\\")
    : __dirname;

const reinli = new Elysia().all("*", ({ request }) => {
  const url = new URL(request.url);
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = Bun.file(join(join(__dirname, "dist"), filePath));
  return new Response(file);
});

export default reinli;

if (import.meta.main) {
  reinli.listen(3000);
  console.log(`http://${reinli.server?.hostname}:${reinli.server?.port}`);
}
