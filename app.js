import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { dirname, join } from "path";

let __dirname = dirname(new URL(import.meta.url).pathname);
__dirname =
  __dirname.startsWith("/") && __dirname.includes(":")
    ? __dirname.replace(/^\/([A-Z]):/, "$1:\\").replace(/\//g, "\\")
    : __dirname;

const reinli = new Elysia().use(staticPlugin({ assets: join(__dirname, "dist"), prefix: "/" }));

export default reinli;

if (import.meta.main) {
  reinli.listen(3000);
  console.log(`http://${reinli.server?.hostname}:${reinli.server?.port}`);
}
