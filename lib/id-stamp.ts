import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { hasDb, q } from "@/lib/db";
import { ID_DECLARATION, isSignatureDataUrl, ukLongDate } from "@/lib/id-declaration";

/**
 * A TENANT'S ID, SIGNED BY THE AGENT WHO SAW IT (Sean McMahon, ticket
 * 88c98681). Behind the "idstamp" switch; off, the phone's ID check stores the
 * photos exactly as before (lib/doc-pages).
 *
 * Every page is the photograph at its own size with a band added BELOW it:
 * the declaration word for word, the agent's drawn signature, their name and
 * the date. Below, never over - writing across the photo would hide the very
 * thing it vouches for.
 *
 * Always a PDF, even for one photo, because the words have to travel with the
 * picture: a copy printed or sent to a referencing firm shows who saw it.
 *
 * The signature is drawn once on the phone and kept against the agent in
 * os_user_prefs (key "id-signature"), then reused on every ID they send.
 */

const SIG_KEY = "id-signature";
const STAMPABLE = ["image/jpeg", "image/png"];

/** Only JPEG and PNG can be drawn into a PDF; the phone's camera gives JPEG. */
export function canStamp(files: File[]): boolean {
  return files.length > 0 && files.every((f) => STAMPABLE.includes(f.type));
}

export async function signatureFor(userId: string): Promise<{ png: string; at: string } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: { png?: unknown; at?: string } }>(
    `SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`,
    [userId, SIG_KEY]
  );
  const v = rows[0]?.value;
  return v && isSignatureDataUrl(v.png) ? { png: v.png, at: v.at ?? "" } : null;
}

export async function saveSignature(userId: string, png: string): Promise<void> {
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, SIG_KEY, JSON.stringify({ png, at: new Date().toISOString() })]
  );
}

let fonts: { reg: Uint8Array; semi: Uint8Array } | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const root = process.cwd();
  const [reg, semi] = await Promise.all([
    fs.readFile(path.join(root, "lib/fonts/montserrat-400.ttf")),
    fs.readFile(path.join(root, "lib/fonts/montserrat-600.ttf")),
  ]);
  fonts = { reg, semi };
  return fonts;
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && font.widthOfTextAtSize(next, size) > max) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** Cut to fit, with a full stop where it was cut. */
function fit(t: string, font: PDFFont, size: number, max: number): string {
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  let out = t;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}.`, size) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}.`;
}

const INK = rgb(0.17, 0.13, 0.11);
const MUTED = rgb(0.42, 0.37, 0.34);
const BAND = rgb(0.965, 0.95, 0.93);
const RULE = rgb(0.8, 0.76, 0.72);

/** The photos as one PDF, each page signed underneath. */
export async function stampIdPages(
  files: File[],
  name: string,
  who: { agent: string; signaturePng: string; day: string }
): Promise<File> {
  const f = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(name);
  pdf.setProducer("The Letting Experts");
  pdf.setCreationDate(new Date());
  const reg = await pdf.embedFont(f.reg, { subset: true });
  const semi = await pdf.embedFont(f.semi, { subset: true });
  const sig = await pdf.embedPng(Buffer.from(who.signaturePng.slice(who.signaturePng.indexOf(",") + 1), "base64"));
  const date = ukLongDate(who.day);
  const agent = who.agent.trim() || "The agent";

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const img = file.type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const W = img.width;
    /* Laid out for a 600-point-wide page and scaled to the photo, so the band
       reads the same on a 1200px snap as on a 4000px one. */
    const s = W / 600;
    const pad = 20 * s;
    const textSize = 10.5 * s;
    const lead = 14.5 * s;
    const labelSize = 7 * s;
    const valueSize = 10.5 * s;
    const sigH = 44 * s;
    const sigBox = 200 * s;
    const sigW = Math.min((sig.width / sig.height) * sigH, sigBox);
    const lines = wrap(ID_DECLARATION, reg, textSize, W - pad * 2);
    const band = pad + lines.length * lead + 14 * s + labelSize + 6 * s + sigH + 4 * s + pad;

    const page = pdf.addPage([W, img.height + band]);
    page.drawImage(img, { x: 0, y: band, width: W, height: img.height });
    page.drawRectangle({ x: 0, y: 0, width: W, height: band, color: BAND });
    page.drawLine({ start: { x: 0, y: band }, end: { x: W, y: band }, thickness: 1.2 * s, color: RULE });

    let y = band - pad;
    lines.forEach((l, i) => page.drawText(l, { x: pad, y: y - textSize - i * lead + 2 * s, size: textSize, font: reg, color: INK }));
    y -= lines.length * lead + 14 * s;

    /* Signature, agent, date: three columns under the words. */
    const dateW = semi.widthOfTextAtSize(date, valueSize);
    const colDate = W - pad - Math.max(dateW, 60 * s);
    const colName = pad + sigBox + 24 * s;
    const label = (t: string, x: number) => page.drawText(t.toUpperCase(), { x, y: y - labelSize, size: labelSize, font: semi, color: MUTED });
    label("Signature", pad);
    label("Agent", colName);
    label("Date", colDate);
    y -= labelSize + 6 * s;

    page.drawImage(sig, { x: pad, y: y - sigH, width: sigW, height: sigH });
    const base = y - sigH;
    page.drawLine({ start: { x: pad, y: base - 2 * s }, end: { x: pad + sigBox, y: base - 2 * s }, thickness: 0.8 * s, color: RULE });
    page.drawText(fit(agent, semi, valueSize, colDate - colName - 14 * s), { x: colName, y: base + 4 * s, size: valueSize, font: semi, color: INK });
    page.drawText(date, { x: colDate, y: base + 4 * s, size: valueSize, font: semi, color: INK });
  }

  const out = await pdf.save();
  const body = new Uint8Array(out).slice().buffer as ArrayBuffer;
  return new File([body], name.endsWith(".pdf") ? name : `${name}.pdf`, { type: "application/pdf" });
}
