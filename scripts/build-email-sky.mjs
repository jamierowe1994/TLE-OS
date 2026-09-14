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

/* ── Calming a drawing down ──────────────────────────────────────────────
   James, 14 Sep 2026, on the password drawing: "it is a little bit too
   green, so we might just want to level that out." Blanket desaturation
   takes the skin and the hair with it, so this only touches pixels whose HUE
   is green - the washes, the shirt, the padlock - and leaves everything else
   exactly as drawn. */
async function lessGreen(file, amount = 0.62) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.02) continue;
    let h;
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 70 || h > 175) continue;
    /* Pull it towards its own grey, which keeps the paper warm rather than
       turning the washes to ash. */
    const grey = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = Math.round((r * amount + grey * (1 - amount)) * 255);
    data[i + 1] = Math.round((g * amount + grey * (1 - amount)) * 255);
    data[i + 2] = Math.round((b * amount + grey * (1 - amount)) * 255);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/* ── The password drawing, corrected ─────────────────────────────────────
   The drawing carries a hand-lettered "TLE OS" on the tablet, sparks and
   all. James: "crop out the TLE OS - it should be the logo TLE OS." So the
   lettering is papered over in the screen's own off-white and the real
   wordmark goes in its place, tilted to sit on the same line the tablet is
   drawn on. */
async function resetArt() {
  const word = await sharp("public/brand/tle-os-logo.png")
    .extract({ left: 410, top: 132, width: 566, height: 127 })
    .resize({ width: 240 })
    .rotate(-3.5, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const wm = await sharp(word).metadata();
  const paper = Buffer.from('<svg width="300" height="108"><rect width="300" height="108" rx="6" fill="#faf8f3"/></svg>');
  const fixed = await sharp(`${ART}/reset-raw.png`)
    .composite([
      { input: paper, left: 424, top: 84 },
      { input: word, left: Math.round(552 - wm.width / 2), top: Math.round(146 - wm.height / 2) },
    ])
    .png()
    .toBuffer();
  fs.writeFileSync(`${ART}/reset.png`, await lessGreen(fixed));
  console.log("reset.png rebuilt from reset-raw.png");
}

/* ── The hero picture for a list email ──────────────────────────────────
   The drawing and the pink shape behind it are ONE flat picture. They have
   to be: there is no layering in an inbox, and a shape that has to sit
   behind a drawing is a shape that has to be painted with it. */
async function hero({ name, art, blob, H = 760, drawWidth = 1130 }) {
  const W = 1200;
  const drawing = await sharp(`${ART}/${art}`).resize({ width: drawWidth }).toBuffer();
  const dm = await sharp(drawing).metadata();
  fs.mkdirSync(OUT, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${blob}</svg>`), top: 0, left: 0 },
      { input: drawing, top: Math.round((H - dm.height) / 2), left: Math.round((W - dm.width) / 2) },
    ])
    .png({ palette: true, quality: 92, effort: 10 })
    .toFile(`${OUT}/${name}.png`);
  console.log(name + ".png", W + "x" + H, size(`${OUT}/${name}.png`));
}

/* ── A row marker: one doodle glyph in a soft disc ─────────────────────
   SVG does not render in Outlook at all, so every one of these is baked to
   PNG at twice its size on the page. The glyphs are solid black on clear,
   which is what lets a flat colour be poured through them. */
const TICK = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <path d="M7 21 L16 30 L33 11" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* "Nobody here can see the one you choose" wants an eye with a line through
   it, and the doodle set has no eye. Drawn in the same weight as the rest. */
const EYE_OFF = `<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 22 C10 13 16 9 22 9 C28 9 34 13 40 22 C34 31 28 35 22 35 C16 35 10 31 4 22 Z" fill="none" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/>
  <circle cx="22" cy="22" r="5" fill="none" stroke="#000" stroke-width="3.2"/>
  <path d="M8.5 36.5 L35.5 7.5" stroke="#000" stroke-width="3.4" stroke-linecap="round"/>
</svg>`;

const BANG = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <rect x="17" y="7" width="6" height="18" rx="3" fill="#000"/>
  <circle cx="20" cy="32" r="3.4" fill="#000"/>
</svg>`;

async function disc({ name, glyph, ring, ink, d = 84, g = 40 }) {
  /* A glyph is either a name in the doodle set or raw SVG for something the
     set does not have. Either way it arrives as solid black on clear, which
     is what lets a flat colour be poured through it. */
  const src = glyph.trimStart().startsWith("<svg") ? Buffer.from(glyph) : `public/icons/doodle/${glyph}.svg`;
  const black = await sharp(src).resize({ width: g, height: g, fit: "inside" }).png().toBuffer();
  const bm = await sharp(black).metadata();
  const tinted = await sharp({ create: { width: bm.width, height: bm.height, channels: 4, background: ink } })
    .composite([{ input: black, blend: "dest-in" }])
    .png()
    .toBuffer();
  const circle = `<svg width="${d}" height="${d}" xmlns="http://www.w3.org/2000/svg"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="${ring}"/></svg>`;
  await sharp({ create: { width: d, height: d, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: Buffer.from(circle), top: 0, left: 0 },
      { input: tinted, top: Math.round((d - bm.height) / 2), left: Math.round((d - bm.width) / 2) },
    ])
    .png()
    .toFile(`${OUT}/${name}.png`);
  console.log(name + ".png", d + "x" + d, size(`${OUT}/${name}.png`));
}

const size = (f) => (fs.statSync(f).size / 1024).toFixed(0) + "KB";

const cutArg = process.argv.indexOf("--cut");
if (cutArg > -1) {
  await cut(process.argv[cutArg + 1], process.argv[cutArg + 2] ?? "piece");
} else {
  await band();
  await cloudGif({ name: "cloud-left", src: "cloud-1.png", width: 160, side: "left", bleed: 0.26, ampY: 9, ampX: 4, frames: 18, delayMs: 220 });
  await cloudGif({ name: "cloud-right", src: "cloud-3.png", width: 172, side: "right", bleed: 0.3, ampY: 8, ampX: 4, frames: 18, delayMs: 240 });

  await hero({
    name: "hero-certificates",
    art: "desk.png",
    /* One sweep that bleeds off both edges, high on the right where the
       plant is and dropping away to the left behind the notebook. */
    /* The bottom edge DIPS under the right sleeve rather than cutting across
       it. James, 13 Sep 2026: "the arm on the right-hand side is getting cut
       off ... have the pink look like it's framing it a bit around that arm."
       The cuff bottoms out at y=675 on this canvas, so the shape carries on
       to 714 beneath it and only rises once it is past the elbow. */
    blob: `<path d="M0,486 C120,392 268,470 402,452 C548,432 592,214 786,150 C930,102 1094,150 1200,116 L1200,724 C1160,744 1084,740 1020,716 C958,692 918,702 866,678 C760,632 600,650 420,630 C280,616 140,628 0,582 Z" fill="#fbe6e0"/>`,
  });

  /* Solid discs with a white glyph, 13 Sep 2026, from James's second list
     drawing: a clay circle with an exclamation for anything already gone,
     a sage clock for anything still running. The pale-circle version said
     nothing at a glance, which on a list of three is the whole job. */
  await hero({
    name: "hero-own-compliance",
    art: "papers.png",
    H: 700,
    drawWidth: 800,
    /* Not an oval. James, 13 Sep 2026: "a bit not flat-shaped ... shorter on
       the right and left-hand sides and then come up at the top ... tuck it
       at the bottom a little bit more, just so it falls behind the
       briefcase." So it is lower at both shoulders, rises over the middle,
       and the bottom edge lifts across the briefcase - which is the one
       thing in the drawing that should stand in FRONT of the shape rather
       than sit inside it. */
    blob: `<path d="M150,392 C158,222 286,88 462,42 C556,16 632,8 700,12 C822,20 986,50 1052,178 C1100,272 1076,436 948,528 C866,588 772,546 680,560 C600,572 548,640 424,644 C320,648 186,598 160,498 C140,444 146,424 150,392 Z" fill="#fbe6e0"/>`,
  });

  await hero({
    name: "hero-deal-moved",
    art: "door.png",
    H: 720,
    drawWidth: 618,
    /* Two shapes rather than one: a big pink behind the door and a smaller
       one swinging out to the right, so the open door has something to open
       INTO. One blob around a doorway just reads as a stamp behind it. */
    blob: `<path d="M232,96 C400,58 560,72 636,168 C716,268 690,430 606,522 C520,616 358,660 244,620 C132,580 74,452 88,326 C102,204 132,118 232,96 Z" fill="#fbe6e0"/>
           <path d="M846,238 C956,214 1076,252 1112,348 C1150,448 1118,576 1026,624 C934,672 812,648 762,568 C712,488 724,346 780,286 C806,258 818,244 846,238 Z" fill="#f7ece7"/>`,
  });

  await disc({ name: "disc-attention", glyph: BANG, ring: "#c0736a", ink: { r: 255, g: 255, b: 255, alpha: 1 }, g: 34 });
  /* Both of these arrive with their own watercolour ground painted in, so
     neither gets a shape behind it - a vector blob under a painted one reads
     as two grounds. */
  await resetArt();
  /* A lighter touch than the password drawing: the map and the binoculars
     are MEANT to be green, it was only running warm-free across the whole
     picture. */
  fs.writeFileSync(`${ART}/radar.png`, await lessGreen(`${ART}/radar-raw.png`, 0.8));
  await hero({ name: "hero-radar", art: "radar.png", H: 620, drawWidth: 1120, blob: "" });
  await hero({ name: "hero-reset", art: "reset.png", H: 730, drawWidth: 940, blob: "" });

  await hero({ name: "hero-job", art: "job.png", H: 720, drawWidth: 1040, blob: "" });

  /* Row marks for the maintenance inbox mails: a pale disc with an outline
     glyph, not the solid alarm discs. "2 documents on the job" is a record,
     not a warning, and a clay exclamation beside it would read as one. */
  await disc({ name: "mark-home", glyph: "home", ring: "#eeeceb", ink: { r: 0x6f, g: 0x67, b: 0x63, alpha: 1 }, g: 36 });
  await disc({ name: "mark-doc", glyph: "file-contract", ring: "#fbe3de", ink: { r: 0xa8, g: 0x5a, b: 0x51, alpha: 1 }, g: 34 });

  await hero({ name: "hero-video", art: "video.png", H: 700, drawWidth: 760, blob: "" });

  await hero({ name: "hero-digest", art: "digest.png", H: 600, drawWidth: 1130, blob: "" });

  /* The set-up mail's drawing arrives with its own watercolour ground under
     it, so this one gets no shape behind - a vector blob under a painted
     one reads as two grounds. */
  await hero({ name: "hero-account", art: "laptop.png", H: 660, drawWidth: 940, blob: "" });

  /* The three reassurances under the button: pale discs, clay glyphs. */
  await disc({ name: "say-once", glyph: "mail", ring: "#fbe3de", ink: { r: 0xa8, g: 0x5a, b: 0x51, alpha: 1 }, d: 84, g: 36 });
  await disc({ name: "say-never", glyph: "lock", ring: "#fbe3de", ink: { r: 0xa8, g: 0x5a, b: 0x51, alpha: 1 }, d: 84, g: 36 });
  await disc({ name: "say-private", glyph: EYE_OFF, ring: "#fbe3de", ink: { r: 0xa8, g: 0x5a, b: 0x51, alpha: 1 }, d: 84, g: 40 });

  await disc({ name: "disc-good", glyph: TICK, ring: "#8a9a76", ink: { r: 255, g: 255, b: 255, alpha: 1 }, g: 34 });
  await disc({ name: "disc-ok", glyph: "clock", ring: "#8a9a76", ink: { r: 255, g: 255, b: 255, alpha: 1 }, g: 38 });
  await disc({ name: "disc-tip", glyph: "info", ring: "#ffffff", ink: { r: 0xa8, g: 0x5a, b: 0x51, alpha: 1 }, d: 76, g: 34 });
}
