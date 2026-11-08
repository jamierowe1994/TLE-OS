/**
 * Keeps a Google Fonts hiccup from failing the build (8 Nov 2026).
 *
 * next/font downloads every Google font at build time and works out each
 * file's type from the end of its link (".woff2"). Some of Google's servers
 * - the ones Railway's European builders reach - now hand back links with
 * no extension at all (fonts.gstatic.com/l/font?kit=...). Next reads that as
 * null and the whole build dies with "Cannot read properties of null
 * (reading '1')". It failed three builds in a row on 8 Nov, a different font
 * each time.
 *
 * The files behind those links are woff2 (Next asks Google as a modern
 * Chrome, so the stylesheet says format('woff2')), so a link with no
 * extension is treated as woff2. Run before every `next build`. Safe to run
 * twice; if a Next upgrade moves the line, it says so and changes nothing.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
let file;
try {
  file = join(dirname(require.resolve("next/package.json")), "dist/compiled/@next/font/dist/google/loader.js");
} catch {
  console.log("[patch-next-font] next is not installed; nothing to do.");
  process.exit(0);
}
if (!existsSync(file)) {
  console.log("[patch-next-font] next/font's Google loader has moved; left alone.");
  process.exit(0);
}

const before = "/\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1]";
const after = "(/\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl) || [null, \"woff2\"])[1]";
const src = readFileSync(file, "utf8");
if (src.includes(after)) {
  console.log("[patch-next-font] already patched.");
} else if (src.includes(before)) {
  writeFileSync(file, src.replace(before, after));
  console.log("[patch-next-font] patched: Google font links with no extension are read as woff2.");
} else {
  console.log("[patch-next-font] the line has changed in this version of Next; left alone.");
}
