/**
 * Builds the furniture for the SKY email look: the band at the foot of the
 * mail and the clouds that drift in its margins.
 *
 *   node scripts/build-email-sky.mjs            # rebuild from art/email-sky
 *   node scripts/build-email-sky.mjs --cut <f>  # split a sheet of drawings
 *
 * ── Why a script and not a design file ────────────────────────────────────
 *
 * James draws these in batches and drops them in ~/Desktop/Emails, several to
 * a sheet - "the clouds are in a 4x4 grid, so you might just want to chop them
 * up". `--cut` does that: it finds each drawing on the sheet by its own alpha
 * rather than by dividing the sheet into equal boxes, because the drawings are
 * never actually on the grid they were asked for. The big cloud on the sheet
 * of four crossed the halfway line by 45px, and cutting into quarters took a
 * slice off it.
 *
 * ── Why the pink is baked in ──────────────────────────────────────────────
 *
 * GIF transparency is ONE BIT: a pixel is there or it is not. A watercolour
 * edge on a one-bit mask fringes, so the clouds are drawn onto PAPER and sent
 * as flat rectangles. That is also why PAPER here and PAPER in shell-sky.ts
 * have to stay the same value - a seam appears between them otherwise.
 *
 * ── Why frame zero matters ────────────────────────────────────────────────
 *
 * Outlook on Windows draws only the FIRST frame of a GIF, so frame zero of
 * each cloud is it at rest in the middle of its drift. Everywhere else it
 * floats; there it simply sits, and nothing looks half-finished.
 */
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ART = "art/email-sky";
const OUT = "public/email/sky";
/** The pink everything is drawn on. Must match PAPER in lib/email/shell-sky.ts. */
const PAPER = { r: 0xfd, g: 0xf2, b: 0xef, alpha: 1 };
const TMP = process.env.SKY_TMP || path.join(process.env.TMPDIR || "/tmp", "sky-frames");

/* ── Splitting a sheet ───────────────────────────────────────────────────
   Every run of touching non-transparent pixels is one drawing. Anything
   under 5000 pixels is a stray speck and is thrown away. */
async function cut(file, prefix = "piece") {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const found = [];

  for (let p = 0; p < W * H; p++) {
    if (seen[p] || data[p * C + 3] <= 8) continue;
    let sp = 0;
    stack[sp++] = p;
    seen[p] = 1;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    while (sp) {
      const q = stack[--sp];
      const x = q % W, y = (q / W) | 0;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const r = ny * W + nx;
        if (!seen[r] && data[r * C + 3] > 8) { seen[r] = 1; stack[sp++] = r; }
      }
    }
    if (n > 5000) found.push({ x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }

  /* Reading order, so the names match the way the sheet looks. */
  found.sort((a, b) => (Math.abs(a.y0 - b.y0) > 60 ? a.y0 - b.y0 : a.x0 - b.x0));
  fs.mkdirSync(ART, { recursive: true });
  for (let i = 0; i < found.length; i++) {
    const b = found[i];
    const out = `${ART}/${prefix}-${i + 1}.png`;
    await sharp(file).extract({ left: b.x0, top: b.y0, width: b.w, height: b.h }).png().toFile(out);
    console.log(out, b.w + "x" + b.h);
  }
}

/* ── The band at the foot of the mail ────────────────────────────────────
   Hill, garden, sky and clouds are all drawn into ONE picture, so nothing
   has to line up against anything else once it is in an inbox. */
async function band() {
  const W = 1200, H = 470;
  const hills = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="170"  cy="600" rx="460" ry="290" fill="#e6ebe0"/>
    <ellipse cx="1060" cy="560" rx="440" ry="260" fill="#e0e7d8"/>
    <ellipse cx="600"  cy="660" rx="620" ry="300" fill="#d8e1cd"/>
  </svg>`;
  const house = await sharp(`${ART}/house.png`).resize({ width: 720 }).toBuffer();
  const hm = await sharp(house).metadata();
  const right = await sharp(`${ART}/cloud-2.png`).resize({ width: 178 }).toBuffer();
  const left = await sharp(`${ART}/cloud-4.png`).resize({ width: 150 }).toBuffer();

  fs.mkdirSync(OUT, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: PAPER } })
    .composite([
      { input: Buffer.from(hills), top: 0, left: 0 },
      { input: right, top: 64, left: 862 },
      { input: left, top: 150, left: 30 },
      /* Stands ON the bottom edge - the band is flush with the foot. */
      { input: house, top: H - hm.height, left: Math.round((W - hm.width) / 2) },
    ])
    /* A palette PNG rather than a JPEG: it keeps the flat pink EXACTLY the
       value the mail's background is, and a shifted pink shows as a seam. */
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(`${OUT}/band.png`);
  console.log("band.png", W + "x" + H, size(`${OUT}/band.png`));
}

/* ── One drifting cloud ─────────────────────────────────────────────────
   Cropped so it runs off the edge of the mail, as it does in the drawing,
   then walked round a slow sine: down and up, with a smaller sway across it
   on a different phase so the two never quite repeat together. */
async function cloudGif({ name, src, width, side, bleed, ampY, ampX, frames, delayMs }) {
  let buf = await sharp(`${ART}/${src}`).resize({ width: Math.round(width / (1 - bleed)) }).png().toBuffer();
  const m = await sharp(buf).metadata();
  const cutPx = Math.round(m.width * bleed);
  buf = await sharp(buf)
    .extract({ left: side === "left" ? cutPx : 0, top: 0, width: m.width - cutPx, height: m.height })
    .toBuffer();
  const cm = await sharp(buf).metadata();

  const W = cm.width, H = cm.height + ampY * 2 + 4;
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  for (let i = 0; i < frames; i++) {
    const t = (i / frames) * Math.PI * 2;
    const dy = Math.round(Math.sin(t) * ampY);
    const dx = Math.round(Math.sin(t * 0.5 + 0.9) * ampX);
    await sharp({ create: { width: W, height: H, channels: 4, background: PAPER } })
      .composite([{
        input: buf,
        top: ampY + 2 + dy,
        left: Math.max(0, Math.min(W - cm.width, dx + (side === "left" ? -ampX : ampX))),
      }])
      .png()
      .toFile(path.join(dir, String(i).padStart(3, "0") + ".png"));
  }

  const out = `${OUT}/${name}.gif`;
  /* dither=none on purpose: the cloud is a smooth wash of near-identical
     pinks, dithering it trebles the file and shows as grain on a phone. */
  execFileSync("ffmpeg", ["-y", "-v", "error", "-framerate", String(1000 / delayMs),
    "-i", path.join(dir, "%03d.png"),
    "-filter_complex", "[0:v]split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none",
    "-loop", "0", out]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(name + ".gif", W + "x" + H, frames + " frames", size(out));
}

const size = (f) => (fs.statSync(f).size / 1024).toFixed(0) + "KB";

const cutArg = process.argv.indexOf("--cut");
if (cutArg > -1) {
  await cut(process.argv[cutArg + 1], process.argv[cutArg + 2] ?? "piece");
} else {
  await band();
  await cloudGif({ name: "cloud-left", src: "cloud-1.png", width: 160, side: "left", bleed: 0.26, ampY: 9, ampX: 4, frames: 18, delayMs: 220 });
  await cloudGif({ name: "cloud-right", src: "cloud-3.png", width: 172, side: "right", bleed: 0.3, ampY: 8, ampX: 4, frames: 18, delayMs: 240 });
}
