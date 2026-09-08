import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  CARD, colourFor, illustrationFor, withExample,
  type FontKey, type Layer, type PostcardDesign, type Side,
} from "@/lib/postcard-design";

/**
 * The artwork a printer gets.
 *
 * ── Why a PDF and not a picture ───────────────────────────────────────────
 *
 * Stannp will take a JPG, a PNG or a PDF for each side. A PDF is the right
 * answer: the type stays type rather than pixels, so it prints at whatever
 * resolution the press runs at instead of whatever we happened to rasterise
 * at. The illustration is the only bitmap on the card, and it goes in at its
 * full two megabytes rather than the light copy the studio draws.
 *
 * ── Why the fonts are in the repo ─────────────────────────────────────────
 *
 * A PDF has to carry its faces or the printer substitutes something else, so
 * the five brand faces are vendored under lib/fonts as TTF. All are open
 * licensed. Fetching them at send time would mean a mailing that fails when
 * Google has a bad morning.
 *
 * ── Coordinates ───────────────────────────────────────────────────────────
 *
 * The design speaks millimetres from the TOP left; PDF speaks points from the
 * BOTTOM left. One conversion, in one place, so nothing else has to think
 * about it.
 */

const MM = 72 / 25.4;
const mm = (v: number) => v * MM;

/** Bleed: printers trim into the artwork, so it runs 3mm past on every side. */
export const BLEED = 3;

const FONT_FILES: Record<FontKey, { normal: string; bold?: string; italic?: string; boldItalic?: string }> = {
  playfair: { normal: "playfair-600.ttf", bold: "playfair-600.ttf", italic: "playfair-600i.ttf", boldItalic: "playfair-600i.ttf" },
  montserrat: { normal: "montserrat-400.ttf", bold: "montserrat-600.ttf" },
  lora: { normal: "lora-400.ttf" },
  shantell: { normal: "shantell-500.ttf" },
  script: { normal: "msmadi-400.ttf" },
};

type Faces = Map<string, PDFFont>;

async function loadFaces(doc: PDFDocument): Promise<Faces> {
  const dir = path.join(process.cwd(), "lib", "fonts");
  const faces: Faces = new Map();
  const files = new Set<string>();
  for (const set of Object.values(FONT_FILES)) for (const f of Object.values(set)) if (f) files.add(f);
  for (const file of files) {
    const bytes = await fs.readFile(path.join(dir, file));
    faces.set(file, await doc.embedFont(bytes, { subset: true }));
  }
  return faces;
}

function faceFor(faces: Faces, key: FontKey | undefined, bold?: boolean, italic?: boolean): PDFFont {
  const set = FONT_FILES[key ?? "montserrat"] ?? FONT_FILES.montserrat;
  const want = bold && italic ? set.boldItalic : italic ? set.italic : bold ? set.bold : set.normal;
  return faces.get(want ?? set.normal)!;
}

const hex = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Greedy wrap, measured against the real face rather than guessed. */
function wrap(text: string, font: PDFFont, size: number, widthPt: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of para.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= widthPt || !line) line = next;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

async function pngFor(url: string): Promise<Buffer | null> {
  if (url.startsWith("data:")) return Buffer.from(url.split(",")[1] ?? "", "base64");
  const file = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  return fs.readFile(file).catch(() => null);
}

/** One side of one card, as a page. */
async function drawSide(doc: PDFDocument, design: PostcardDesign, side: Side, faces: Faces, example: boolean) {
  const page = doc.addPage([mm(CARD.w + BLEED * 2), mm(CARD.h + BLEED * 2)]);
  /* Everything is placed as though the card started at 0,0; the bleed is an
     offset applied once, here. */
  const ox = mm(BLEED);
  const oy = mm(BLEED);
  const top = (yMm: number) => mm(CARD.h) - mm(yMm) + oy;

  page.drawRectangle({
    x: 0, y: 0,
    width: mm(CARD.w + BLEED * 2), height: mm(CARD.h + BLEED * 2),
    color: hex(side === "front" ? design.paper : "#ffffff"),
  });

  const say = (t: string) => (example ? withExample(t) : t);

  for (const l of design.layers.filter((x) => x.side === side)) {
    if (l.kind === "image") {
      const art = illustrationFor(l.src);
      const bytes = await pngFor(art.print);
      if (!bytes) continue;
      let img: PDFImage;
      try { img = await doc.embedPng(bytes); } catch { continue; }
      const w = mm(l.w);
      const h = (img.height / img.width) * w;
      page.drawImage(img, { x: ox + mm(l.x), y: top(l.y) - h, width: w, height: h });
      continue;
    }

    if (l.kind === "rule") {
      /* The same curve the screen draws, in points. */
      const w = mm(l.w);
      const y = top(l.y);
      page.drawSvgPath(`M 0 0 C ${w * 0.23} ${-w * 0.042} ${w * 0.6} ${-w * 0.047} ${w} ${-w * 0.021}`, {
        x: ox + mm(l.x), y,
        borderColor: hex(colourFor(l.colour).hex),
        borderWidth: mm(l.w / 33) * 1.1,
        borderLineCap: 1,
      });
      continue;
    }

    if (l.kind === "wordmark") {
      const bold = faceFor(faces, "montserrat", true);
      const reg = faceFor(faces, "montserrat", false);
      page.drawText("THE", { x: ox + mm(l.x), y: top(l.y) - mm(2.6), size: mm(2.6), font: bold, color: hex("#101014") });
      page.drawText("LETTING", { x: ox + mm(l.x), y: top(l.y) - mm(9.6), size: mm(6.6), font: reg, color: hex("#101014") });
      page.drawText("EXPERTS", { x: ox + mm(l.x), y: top(l.y) - mm(13.4), size: mm(3), font: reg, color: hex("#101014") });
      continue;
    }

    if (l.kind === "qr") {
      if (!l.url?.trim()) continue;
      const data = await QRCode.toDataURL(l.url.trim(), { errorCorrectionLevel: "H", margin: 0, scale: 12, color: { dark: "#101014", light: "#ffffff" } });
      const img = await doc.embedPng(Buffer.from(data.split(",")[1], "base64"));
      page.drawImage(img, { x: ox + mm(l.x), y: top(l.y) - mm(l.w), width: mm(l.w), height: mm(l.w) });
      continue;
    }

    /* text */
    const font = faceFor(faces, l.font, l.bold, l.italic);
    const size = mm(l.size ?? 3);
    const lead = size * (l.lineHeight ?? 1.4);
    const lines = wrap(say(l.text ?? ""), font, size, mm(l.w));
    let y = top(l.y) - size;
    for (const line of lines) {
      if (line === "") { y -= lead * 0.6; continue; }
      const wide = font.widthOfTextAtSize(line, size);
      const x =
        l.align === "center" ? ox + mm(l.x) + (mm(l.w) - wide) / 2
        : l.align === "right" ? ox + mm(l.x) + mm(l.w) - wide
        : ox + mm(l.x);
      page.drawText(line, { x, y, size, font, color: hex(colourFor(l.colour).hex) });
      y -= lead;
    }
  }

  if (side === "back") {
    /* Royal Mail's block and the opt-out, drawn by the card on both surfaces
       so the print matches the screen exactly. */
    const reg = faceFor(faces, "montserrat", false);
    const bold = faceFor(faces, "montserrat", true);
    const lines = example
      ? ["Margaret Hollis", "18 Wellfield Terrace", "Bristol", "BS7 8HP"]
      : ["{firstname} {lastname}", "{address1}", "{city}", "{postcode}"];
    let y = top(14) - mm(3.3);
    for (const [i, line] of lines.entries()) {
      page.drawText(line, { x: ox + mm(CARD.w - 7 - 60), y, size: mm(3.3), font: i === 0 ? bold : reg, color: hex(i === 0 ? "#101014" : "#3f3d3a") });
      y -= mm(3.3 * 1.55);
    }
    page.drawText(withExample("Not for you? Call {phone} or write to us and we will not contact you again."), {
      x: ox + mm(7), y: oy + mm(3.4), size: mm(2.2), font: reg, color: hex("#8b8781"),
    });
  }
}

/**
 * The whole card as one PDF: page one the front, page two the back.
 *
 * `example` fills the merge fields in, which is what a proof wants. The real
 * send passes false, so the braces survive for Stannp to fill per landlord.
 */
export async function postcardPdf(design: PostcardDesign, opts: { example?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(design.name);
  doc.setProducer("TLE OS");
  const faces = await loadFaces(doc);
  await drawSide(doc, design, "front", faces, opts.example ?? true);
  await drawSide(doc, design, "back", faces, opts.example ?? true);
  return doc.save();
}
