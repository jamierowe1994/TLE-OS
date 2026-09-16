import "server-only";
import { PDFDocument } from "pdf-lib";

/**
 * SEVERAL PHOTOGRAPHS OF ONE DOCUMENT, filed as one document.
 *
 * A gas certificate is two sides. An EICR runs to five. Photographed page by
 * page and filed page by page, a landlord's record grows five rows called
 * "Electrical safety report" and whoever opens it has to guess the order - so
 * the pages are bound into a single PDF here, server-side, and the file goes
 * onto the record as one thing.
 *
 * ── Why on the server ──────────────────────────────────────────────────────
 *
 * pdf-lib would run in the browser, and doing it there would save an upload.
 * It would also put about 400KB of library into a page whose whole job is to
 * be opened one-handed in somebody's hallway on 4G, to save work on the one
 * device in the exchange that is slowest and on battery. The pages go up as
 * they are taken and the binding happens where there is a spare core.
 *
 * ── When it does NOT bind ──────────────────────────────────────────────────
 *
 * Only JPEG and PNG can be embedded. A phone set to HEIC, or a PDF chosen from
 * Files, is passed through untouched and filed as its own document: half a
 * feature is better than a route that throws on the one landlord whose phone
 * is set differently. One page is likewise left as a photograph - a JPEG a
 * landlord can open in anything beats a one-page PDF every time.
 */

const BINDABLE = ["image/jpeg", "image/png"];

/** Is this a set we can bind? Two or more, all embeddable images. */
export function canBind(files: File[]): boolean {
  return files.length > 1 && files.every((f) => BINDABLE.includes(f.type));
}

/**
 * The pages, in the order they were taken, one per PDF page at the image's own
 * proportions. No scaling to A4: these are photographs of a page rather than
 * the page itself, and letterboxing them into a paper size adds white margins
 * to something that already has the landlord's carpet round the edges.
 */
export async function bindPages(files: File[], name: string): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(name);
  pdf.setProducer("The Letting Experts");
  pdf.setCreationDate(new Date());

  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const img = f.type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const out = await pdf.save();
  /* A fresh ArrayBuffer rather than the view's own buffer: pdf-lib returns a
     Uint8Array that may be a window onto a larger allocation, and handing that
     straight to File() ships the slack bytes with it. */
  const body = new Uint8Array(out).slice().buffer as ArrayBuffer;
  return new File([body], name.endsWith(".pdf") ? name : `${name}.pdf`, { type: "application/pdf" });
}
