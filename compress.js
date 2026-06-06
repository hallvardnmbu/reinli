import { readdirSync, statSync } from "fs";
import { join, extname } from "path";

const dir = join(import.meta.dir, "dist");

const COMPRESS = new Set([".js", ".mjs", ".css", ".html", ".wasm", ".ifc", ".glb"]);

function* walk(path) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

let totalOrig = 0, totalComp = 0;

for (const file of walk(dir)) {
  if (file.endsWith(".gz")) continue;
  if (!COMPRESS.has(extname(file))) continue;

  const data = new Uint8Array(await Bun.file(file).arrayBuffer());
  const compressed = Bun.gzipSync(data, { level: 9 });

  totalOrig += data.byteLength;
  totalComp += compressed.byteLength;

  await Bun.write(file + ".gz", compressed);

  const pct = Math.round((1 - compressed.byteLength / data.byteLength) * 100);
  const kb = (n) => (n / 1024).toFixed(0) + "KB";
  console.log(`  ${file.replace(dir + "/", "")}  ${kb(data.byteLength)} → ${kb(compressed.byteLength)} (-${pct}%)`);
}

const mb = (n) => (n / 1024 / 1024).toFixed(1) + " MB";
console.log(`\nTotal: ${mb(totalOrig)} → ${mb(totalComp)} (saved ${mb(totalOrig - totalComp)})`);
