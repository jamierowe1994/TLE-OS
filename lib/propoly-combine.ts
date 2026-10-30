import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * SEVERAL FILES, ONE PROPOLY SLOT (30 Oct 2026).
 *
 * Propoly holds one document per type on a deal and answers a second with
 * 409 "A document of this type already exists for this deal" (its API spec,
 * POST /api/v1/documents). The pack's push therefore sent the first file of
 * each slot and skipped the rest: on the 14 packs pushed by 30 Oct, 44 files
 * were skipped that way, nearly all a second tenant's right to rent or
 * reference (18 Frome Valley Road, 4 Bushy Close, 5 Canter Close...). Sean
 * and Liana saw it as "the second tenant's documents never got there".
 *
 * So every file bound for the same slot goes as one PDF: a contents page
 * naming each file and whose it is, then each file in turn. PDFs keep their
 * own pages; photos are laid on an A4 page each.
 */

/** Propoly refuses anything over 8.5MB; this leaves room for the PDF's own overhead. */
const LIMIT = 8_200_000;

export type SlotPart = { name: string; bytes: Uint8Array; mime: string; who: string[] };

/** `label` is the slot in words ("Right to Rent"); the title counts what actually went in. */
export async function combineForSlot(label: string, parts: SlotPart[]): Promise<{ bytes: Uint8Array; title: string; included: SlotPart[]; left: { part: SlotPart; why: string }[] }> {
  const doc = await PDFDocument.create();
  doc.setAuthor("The Letting Experts");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  /* Helvetica in pdf-lib is WinAnsi: anything outside it would throw. */
  const safe = (s: string) => s.replace(/[‐-―−]/g, "-").normalize("NFKD").replace(/[^\x20-\x7E£]/g, "");

  const cover = doc.addPage([W, H]);
  const included: SlotPart[] = [];
  const left: { part: SlotPart; why: string }[] = [];
  let size = 0;
  for (const p of parts) {
    if (size + p.bytes.byteLength > LIMIT) {
      left.push({ part: p, why: "it would take the combined file over Propoly's 8.5MB limit - add it to the deal in Propoly by hand" });
      continue;
    }
    try {
      if (p.mime === "application/pdf" || /\.pdf$/i.test(p.name)) {
        const src = await PDFDocument.load(p.bytes, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((pg) => doc.addPage(pg));
      } else if (/^image\/(jpe?g|png)$/.test(p.mime) || /\.(jpe?g|png)$/i.test(p.name)) {
        const png = p.mime === "image/png" || /\.png$/i.test(p.name);
        const img = png ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes);
        const scale = Math.min((W - 72) / img.width, (H - 72) / img.height, 1);
        const page = doc.addPage([W, H]);
        page.drawImage(img, { x: (W - img.width * scale) / 2, y: (H - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
      } else {
        left.push({ part: p, why: "only a PDF, JPG or PNG can be put in Propoly" });
        continue;
      }
      included.push(p);
      size += p.bytes.byteLength;
    } catch {
      left.push({ part: p, why: "it couldn't be opened to add to the combined file - add it to the deal in Propoly by hand" });
    }
  }

  const title = `${label} - ${included.length} file${included.length === 1 ? "" : "s"}`;
  doc.setTitle(title);
  let y = H - 64;
  cover.drawText(safe(title), { x: 56, y, size: 20, font: bold, color: rgb(0.12, 0.12, 0.14), maxWidth: W - 112 });
  y -= 30;
  cover.drawText(safe(`${included.length} file${included.length === 1 ? "" : "s"} in this document, in this order:`), { x: 56, y, size: 11, font, color: rgb(0.42, 0.42, 0.46) });
  y -= 26;
  included.forEach((p, i) => {
    if (y < 72) return;
    cover.drawText(safe(`${i + 1}. ${p.name}`), { x: 56, y, size: 11, font: bold, color: rgb(0.12, 0.12, 0.14), maxWidth: W - 112 });
    y -= 16;
    if (p.who.length) {
      cover.drawText(safe(p.who.join(", ")), { x: 72, y, size: 10, font, color: rgb(0.42, 0.42, 0.46), maxWidth: W - 128 });
      y -= 16;
    }
    y -= 6;
  });
  cover.drawText("Put together by TLE OS: Propoly takes one document of each type on a deal.", { x: 56, y: 48, size: 9, font, color: rgb(0.42, 0.42, 0.46) });
  return { bytes: await doc.save(), title, included, left };
}
