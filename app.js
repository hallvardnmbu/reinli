import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";

const reinli = new Elysia().use(staticPlugin({ assets: "dist", prefix: "/" }));

export default reinli;

if (import.meta.main) {
  reinli.listen(3000);
  console.log(`http://${reinli.server?.hostname}:${reinli.server?.port}`);
}
