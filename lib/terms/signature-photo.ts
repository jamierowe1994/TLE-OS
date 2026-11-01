/**
 * A SIGNATURE FROM A PHOTO OR SCAN (Dan Richards, 1 Nov 2026: he wants his
 * real signature on the Terms of Business, not one drawn with a mouse).
 *
 * Runs in the browser, on a canvas, and ends as the same thing the pad makes:
 * a transparent PNG cut to the ink. So it travels exactly the drawn one's road
 * (agent-sign, lib/terms/signatures cleanSignature, DocuSeal's completeSubmitter)
 * and nothing past the send screen knows the difference.
 *
 *   1. Decoded the right way up (phone photos carry their turn in EXIF) onto
 *      white, so a PNG that is already transparent reads as ink on paper.
 *   2. The paper's own brightness is measured in patches across the picture,
 *      because a phone photo is never evenly white: a shadow across one corner
 *      would otherwise read as ink. Anything clearly darker than the paper
 *      around it is ink; the rest goes transparent. The ink keeps its colour
 *      (blue pen stays blue), corrected for the paper's tint.
 *   3. Specks of dust and paper grain are dropped, then it is cut to the ink
 *      with a little room, the way the drawn one is, and capped in size so it
 *      stays under the 400KB the server will take.
 */

export type SignaturePhoto = { ok: true; image: string } | { ok: false; problem: string };

const WORK = 1600; // longest side we read at: plenty for a 60px-high signature box
const OUT_W = 1000;
const OUT_H = 360;
const MIN_H = 120; // the paper shows it 60px high; twice that stays sharp on a retina screen
const MAX_URL = 380_000; // lib/terms/signatures cleanSignature refuses over 400,000

const say = (problem: string): SignaturePhoto => ({ ok: false, problem });

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    /* Older Safari: an <img> applies the EXIF turn itself. */
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function smooth(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

export async function signatureFromPhoto(file: File): Promise<SignaturePhoto> {
  if (file.type && !file.type.startsWith("image/")) return say("That isn't a picture. Choose a PNG or JPEG photo of your signature.");
  if (file.size > 30 * 1024 * 1024) return say("That picture is too large. Choose one under 30MB.");

  let src: CanvasImageSource & { width: number; height: number };
  try {
    src = await decode(file);
  } catch {
    return say("That picture couldn't be opened here. Choose a PNG or JPEG photo of your signature.");
  }
  if (!src.width || !src.height) return say("That picture couldn't be opened here. Choose a PNG or JPEG photo of your signature.");
  if (Math.max(src.width, src.height) < 60) return say("That picture is too small to read. Use a larger photo or scan.");

  const k = Math.min(1, WORK / Math.max(src.width, src.height));
  const W = Math.max(1, Math.round(src.width * k));
  const H = Math.max(1, Math.round(src.height * k));
  const work = document.createElement("canvas");
  work.width = W;
  work.height = H;
  const wx = work.getContext("2d", { willReadFrequently: true });
  if (!wx) return say("Your browser couldn't read that picture. Try drawing your signature instead.");
  wx.fillStyle = "#ffffff";
  wx.fillRect(0, 0, W, H);
  wx.imageSmoothingQuality = "high";
  wx.drawImage(src, 0, 0, W, H);
  if ("close" in src && typeof src.close === "function") src.close();
  const px = wx.getImageData(0, 0, W, H);
  const d = px.data;
  const N = W * H;

  /* Brightness of every pixel, and of the paper overall. */
  const lum = new Float32Array(N);
  const all = new Uint32Array(256);
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const l = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    lum[i] = l;
    all[l | 0]++;
  }
  const pct = (hist: Uint32Array, total: number, q: number) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) if ((seen += hist[v]) >= total * q) return v;
    return 255;
  };
  const paperAll = pct(all, N, 0.95);
  if (paperAll < 90) return say("That picture is too dark to find the paper. Take it in good light, on plain white paper.");

  /* The paper's brightness patch by patch: the bright end of each patch, since ink is thin and paper is most of it. */
  const B = Math.max(24, Math.round(Math.max(W, H) / 40));
  const GX = Math.ceil(W / B);
  const GY = Math.ceil(H / B);
  const raw = new Float32Array(GX * GY);
  const grid = new Float32Array(GX * GY);
  const hist = new Uint32Array(256);
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      hist.fill(0);
      let n = 0;
      const y1 = Math.min(H, (gy + 1) * B);
      const x1 = Math.min(W, (gx + 1) * B);
      for (let y = gy * B; y < y1; y++) for (let x = gx * B; x < x1; x++, n++) hist[lum[y * W + x] | 0]++;
      raw[gy * GX + gx] = Math.max(1, pct(hist, n, 0.9));
    }
  }
  /* Each patch takes the darkest of itself and its neighbours: a patch half on the paper and half
     on the table beyond it would otherwise call the table ink, and draw a bar along the sheet's edge. */
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      let m = raw[gy * GX + gx];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = gy + dy, xx = gx + dx;
        if (yy >= 0 && yy < GY && xx >= 0 && xx < GX) m = Math.min(m, raw[yy * GX + xx]);
      }
      grid[gy * GX + gx] = m;
    }
  }
  const paperAt = (x: number, y: number) => {
    const fx = Math.min(GX - 1, Math.max(0, x / B - 0.5));
    const fy = Math.min(GY - 1, Math.max(0, y / B - 0.5));
    const x0 = fx | 0, y0 = fy | 0;
    const x1 = Math.min(GX - 1, x0 + 1), y1 = Math.min(GY - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const top = grid[y0 * GX + x0] * (1 - tx) + grid[y0 * GX + x1] * tx;
    const bot = grid[y1 * GX + x0] * (1 - tx) + grid[y1 * GX + x1] * tx;
    return top * (1 - ty) + bot * ty;
  };

  /* Ink is what is clearly darker than the paper around it. Patches far darker than the
     paper overall (a table past the edge of the sheet) are not paper, so nothing there is ink. */
  const alpha = new Float32Array(N);
  const mask = new Uint8Array(N);
  let inked = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const P = paperAt(x, y);
      if (P < paperAll * 0.55) continue;
      const a = smooth(0.2, 0.48, (P - lum[i]) / P);
      if (a <= 0) continue;
      alpha[i] = a;
      if (a > 0.35) {
        mask[i] = 1;
        inked++;
      }
    }
  }
  if (inked < 40) return say("No signature showed up in that picture. Sign in dark pen on plain white paper, then photograph it close up in good light.");
  if (inked > N * 0.3) return say("That doesn't look like a signature on plain paper. Photograph just your signature, close up, on white paper.");

  /* Joined-up pieces of ink. Dust and grain are tiny; the dot of an i is not. */
  const label = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  const areas: number[] = [];
  const boxes: [number, number, number, number][] = [];
  for (let s = 0; s < N; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const id = areas.length;
    let top = 0, area = 0;
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    stack[top++] = s;
    label[s] = id;
    while (top) {
      const i = stack[--top];
      area++;
      const x = i % W, y = (i / W) | 0;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx;
          if (mask[j] && label[j] < 0) {
            label[j] = id;
            stack[top++] = j;
          }
        }
      }
    }
    areas.push(area);
    boxes.push([bx0, by0, bx1, by1]);
  }
  const speck = Math.max(8, inked * 0.002);
  const keep = areas.map((a) => a >= speck);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  boxes.forEach((b, id) => {
    if (!keep[id]) return;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  });
  if (x1 < 0) return say("No signature showed up in that picture. Sign in dark pen on plain white paper, then photograph it close up in good light.");

  /* Soft edges belong to the piece they touch; anything near a dropped speck (or no piece at all) goes. */
  const near = (i: number) => {
    const x = i % W, y = (i / W) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        const l = label[yy * W + xx];
        if (l >= 0 && keep[l]) return true;
      }
    }
    return false;
  };

  /* Out: the ink's own colour, as it would be on white, with the paper made transparent. */
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const a = alpha[i];
    const lab = label[i];
    if (a <= 0 || (lab >= 0 ? !keep[lab] : !near(i))) {
      d[p + 3] = 0;
      continue;
    }
    const P = paperAt(i % W, (i / W) | 0);
    for (let c = 0; c < 3; c++) {
      const onWhite = Math.min(255, (d[p + c] * 255) / P);
      d[p + c] = Math.max(0, Math.min(255, (onWhite - 255 * (1 - a)) / a));
    }
    d[p + 3] = Math.round(a * 255);
  }
  wx.putImageData(px, 0, 0);

  /* Cut to the ink with a little room, as the drawn one is. */
  const room = Math.max(6, Math.round((y1 - y0 + 1) * 0.12));
  const cx0 = Math.max(0, x0 - room), cy0 = Math.max(0, y0 - room);
  const cw = Math.min(W, x1 + room + 1) - cx0, ch = Math.min(H, y1 + room + 1) - cy0;

  let scale = Math.min(1, OUT_W / cw, OUT_H / ch);
  if (ch * scale < MIN_H) scale = Math.min(MIN_H / ch, OUT_W / cw);
  for (let tries = 0; tries < 6; tries++) {
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cw * scale));
    out.height = Math.max(1, Math.round(ch * scale));
    const ox = out.getContext("2d");
    if (!ox) break;
    ox.imageSmoothingQuality = "high";
    ox.drawImage(work, cx0, cy0, cw, ch, 0, 0, out.width, out.height);
    const url = out.toDataURL("image/png");
    if (url.length <= MAX_URL) return { ok: true, image: url };
    scale *= 0.8;
  }
  return say("That signature came out too large to use. Crop the picture closer to your signature and try again.");
}
