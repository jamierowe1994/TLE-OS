import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { q } from "@/lib/db";
import { addFileDoc } from "@/lib/file-documents";
import { isTestFile } from "@/lib/test-guard";
import { openAccount } from "@/lib/bank-vault";
import { readHome } from "@/lib/home-answers";
import { signaturesFor } from "@/lib/terms/signatures";
import { edition } from "@/lib/terms/catalogue";
import { askedOf, detailText } from "@/lib/terms/detail-text";
import { PROPERTY_QUESTIONS, SECRET_KEYS, asked, cardAsked, cardKey, type Answers } from "@/lib/property-questions";
import type { TermsRow } from "@/lib/terms/store";

/**
 * THE LANDLORD'S ANSWERS, KEPT AS A DOCUMENT (James, 5 Nov 2026).
 *
 * "Save the questions they answered into a form that goes into the documents
 * and add timestamps and signature + contract just in case we ever need to
 * refer to it again."
 *
 * When the last person signs (lib/terms/flow completeIfAll), one PDF is filed
 * on the home's Documents beside the signed contract, "Landlord answers and
 * declarations":
 *
 *   1. who signed, when each was sent, opened and signed, and from where
 *   2. each landlord's declarations as the contract prints them
 *   3. every answer about the home, by subject, with who gave it and when
 *   4. the bank account by its last four (the whole number is on the contract)
 *   5. each signature as it was drawn, and the start-now choice
 *   6. the signed contract itself, appended page for page
 *
 * Codes (alarm, gate) are never printed: "given, kept locked away".
 */

const A4: [number, number] = [595.28, 841.89];
const M = 50;
const INK = rgb(0.08, 0.08, 0.07);
const MUTED = rgb(0.39, 0.38, 0.36);
const CLAY = rgb(0.67, 0.29, 0.17);

/* The built-in Helvetica writes only WinAnsi: anything else is put plainly. */
const plain = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/•/g, "*")
    .replace(/[^\x20-\x7E£ -ÿ]/g, "");

const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })
    : "-";

class Writer {
  page: PDFPage;
  y = 0;
  constructor(private pdf: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.page = this.newPage();
  }
  newPage() {
    this.page = this.pdf.addPage(A4);
    this.y = A4[1] - M;
    return this.page;
  }
  need(h: number) {
    if (this.y - h < M) this.newPage();
  }
  lines(text: string, size: number, width: number, font = this.font): string[] {
    const out: string[] = [];
    for (const para of plain(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }
  text(t: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.bold ? this.bold : this.font;
    const x = o.x ?? M;
    const ls = this.lines(t, size, o.width ?? A4[0] - M - x, font);
    for (const l of ls) {
      this.need(size + 4);
      this.page.drawText(l, { x, y: this.y - size, size, font, color: o.color ?? INK });
      this.y -= size + 4;
    }
    this.y -= o.gap ?? 2;
  }
  heading(t: string) {
    this.need(40);
    this.y -= 10;
    this.text(t, { size: 13, color: CLAY, gap: 6 });
  }
  row(label: string, value: string, note?: string) {
    const lw = 170;
    const vl = this.lines(value || "-", 10, A4[0] - M * 2 - lw);
    const nl = note ? this.lines(note, 8, A4[0] - M * 2 - lw) : [];
    const ll = this.lines(label, 9, lw - 14);
    this.need(Math.max(ll.length * 12, vl.length * 14 + nl.length * 11) + 8);
    const top = this.y;
    ll.forEach((l, k) => this.page.drawText(l, { x: M, y: top - 10 - k * 12, size: 9, font: this.font, color: MUTED }));
    let y = top;
    for (const l of vl) {
      this.page.drawText(l, { x: M + lw, y: y - 10, size: 10, font: this.font, color: INK });
      y -= 14;
    }
    for (const l of nl) {
      this.page.drawText(l, { x: M + lw, y: y - 8, size: 8, font: this.font, color: MUTED });
      y -= 11;
    }
    this.y = Math.min(y, top - ll.length * 12) - 4;
    this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: A4[0] - M, y: this.y + 2 }, thickness: 0.4, color: rgb(0.9, 0.9, 0.89) });
    this.y -= 4;
  }
}

/** Who gave an answer, said plainly. */
function giver(by: string | undefined, t: TermsRow): string {
  if (!by) return "Given before this contract";
  if (by.startsWith("landlord:")) {
    const email = by.slice("landlord:".length);
    const p = t.parties.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return `Landlord ${p ? p.name : email}`;
  }
  return by.toLowerCase() === t.agentEmail.toLowerCase() ? `Agent ${t.agentName}` : `Agent ${by}`;
}

export async function answersRecordPdf(t: TermsRow, contract: Uint8Array | null): Promise<Uint8Array> {
  const doc = edition(t.version);
  const pdf = await PDFDocument.create();
  pdf.setTitle(plain(`Landlord answers and declarations - ${t.propertyAddress}`));
  pdf.setAuthor("The Letting Experts");
  const w = new Writer(pdf, await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold));
  const home: { answers: Answers; who: Record<string, { by: string; at: string }> } = await readHome({ appraisalId: t.appraisalId, propertyId: t.propertyId, listingId: t.listingId }).catch(() => ({ answers: {}, who: {} }));
  const sigs = await signaturesFor(t.id).catch(() => ({}) as Awaited<ReturnType<typeof signaturesFor>>);

  w.text("The Letting Experts", { size: 9, color: MUTED });
  w.text("Landlord Answers and Declarations", { size: 20, gap: 4 });
  w.text(t.propertyAddress, { size: 11, gap: 2 });
  w.text(`Terms of Business ${doc ? `${doc.subtitle}, ${doc.edition} edition` : ""} - reference ${t.id}`, { size: 9, color: MUTED });
  w.text(`Made ${when(new Date().toISOString())}. Kept with the signed contract, which follows these pages.`, { size: 9, color: MUTED, gap: 8 });

  w.heading("Who Signed, and When");
  w.row("Sent by", t.agentName, t.agentEmail);
  w.row("Agent signed", when(t.agentSignedAt), sigs.agent?.ip ? `From ${sigs.agent.ip}` : undefined);
  w.row("Sent to the landlords", when(t.sentAt));
  for (const p of t.parties) {
    const s = sigs[p.key];
    w.row(p.name, `Signed ${when(p.signedAt)}`, [`${p.email}`, `Emailed ${when(p.emailedAt)}, first opened ${when(p.openedAt)}`, s?.ip ? `Signed from ${s.ip}` : "", s?.userAgent ? s.userAgent.slice(0, 120) : ""].filter(Boolean).join(". "));
  }
  w.row("Everyone signed", when(t.completedAt));

  if (doc) {
    w.heading("Their Declarations and Details on the Contract");
    t.parties.forEach((p, i) => {
      w.text(t.parties.length > 1 ? `Landlord ${i + 1}: ${p.name}` : p.name, { bold: true, gap: 4 });
      const fields = [...askedOf(doc, i), ...(i === 0 ? doc.details.filter((f) => f.fromAnswer) : [])];
      for (const f of fields) {
        const raw = String(p.details?.[f.key] ?? "");
        const v = f.key === "accountNumber" ? `ending ${openAccount(raw).slice(-4) || "-"} (in full on the contract)` : detailText(f, raw);
        w.row(f.label, v || "Not given", f.ask);
      }
    });
    /* Said, not left out (Flat 6 Grand Banks, 11 Nov 2026): a contract on the October wording has no bank account behind it. */
    if (!doc.details.some((f) => f.key === "accountNumber")) w.row("Bank account", "Not asked", `The ${doc.edition} terms did not take bank details.`);
  }

  w.heading("What They Told Us About the Home");
  let told = 0;
  for (const st of PROPERTY_QUESTIONS) {
    const qs = st.questions.filter((q) => asked(q, home.answers) && String(home.answers[q.id] ?? "").trim());
    if (!qs.length) continue;
    told += qs.length;
    w.need(40);
    w.text(st.title, { bold: true, gap: 4 });
    for (const q of qs) {
      const v = home.answers[q.id];
      let val = SECRET_KEYS.has(q.id) ? "Given, kept locked away" : q.kind === "choice" ? q.options?.find((o) => o.id === v)?.label ?? String(v) : Array.isArray(v) ? v.join(", ") : String(v);
      if (cardAsked(q, home.answers) && home.answers[cardKey(q.id)]) val += home.answers[cardKey(q.id)] === "yes" ? " (card or key meter)" : " (not a card meter)";
      const who = home.who[q.id];
      w.row(q.label, val, who ? `${giver(who.by, t)}, ${when(who.at)}` : "Given before this contract");
    }
  }
  if (!told) {
    w.text(
      doc?.asksFirst
        ? "No answers about the home were on file when this was made."
        : `No answers about the home were on file when this was made. The ${doc?.edition ?? "earlier"} terms did not ask the questions about the home before signing.`,
      { size: 9, color: MUTED }
    );
  }

  w.heading("Signatures");
  const draw = async (label: string, img: string | undefined, sub: string) => {
    w.need(110);
    w.text(label, { bold: true, gap: 2 });
    w.text(sub, { size: 8, color: MUTED, gap: 4 });
    if (img) {
      try {
        const bytes = Buffer.from(img.split(",")[1] ?? "", "base64");
        const pic = img.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const h = 60;
        const wd = Math.min(260, (pic.width / pic.height) * h);
        w.page.drawImage(pic, { x: M, y: w.y - h, width: wd, height: h });
        w.y -= h + 10;
      } catch {
        w.text("(signature image could not be drawn)", { size: 8, color: MUTED });
      }
    }
  };
  await draw(`For The Letting Experts: ${t.agentName}`, sigs.agent?.image, `Signed ${when(sigs.agent?.at ?? t.agentSignedAt)}`);
  for (const p of t.parties) {
    const s = sigs[p.key];
    const start = s?.startNow == null ? "" : s.startNow ? ". Asked us to start straight away" : ". Asked us to wait until the cancellation period is over";
    await draw(p.name, s?.image, `Signed ${when(s?.at ?? p.signedAt)}${start}`);
  }

  /* The signed contract itself, page for page. */
  if (contract?.length) {
    try {
      const src = await PDFDocument.load(contract);
      for (const pg of await pdf.copyPages(src, src.getPageIndices())) pdf.addPage(pg);
    } catch {
      w.text("The signed contract is filed separately on the home's Documents.", { size: 9, color: MUTED });
    }
  } else {
    w.heading("The Contract");
    w.text("The signed contract is filed separately on the home's Documents.", { size: 9, color: MUTED });
  }
  return pdf.save();
}

/** The signed contract as the OS holds it, to put behind the answers. Null when there is none to read. */
export async function signedContractBytes(t: TermsRow): Promise<Uint8Array | null> {
  if (!t.signedR2Key || !r2Configured) return null;
  try {
    const obj = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: t.signedR2Key! })));
    return (await obj.Body?.transformToByteArray()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Made and filed once, when the contract completes. Safe to call twice; never throws.
 *
 * Every wording, not only the ones that ask the questions first (James, 11 Nov
 * 2026: "they should automatically save as a backup onto the file as a separate
 * section, so they can download them anytime"): a contract on the October terms
 * still has who signed, their details and their signatures to keep. `made`: the
 * pages already drawn, when the caller has them (the download on the
 * Questionnaire tab), so one that was signed before this is filed the first
 * time somebody opens it.
 */
export async function fileAnswersRecord(t: TermsRow, contract: Uint8Array | null, made?: Uint8Array): Promise<string | null> {
  try {
    if (!edition(t.version) || !r2Configured) return null;
    const key = `documents/signed/terms-${t.id}/landlord-answers-and-declarations.pdf`;
    const had = await q<{ id: string }>(`SELECT id FROM os_file_documents WHERE r2_key = $1 AND removed_at IS NULL`, [key]).catch(() => []);
    if (had.length) return key;
    const bytes = made ?? (await answersRecordPdf(t, contract));
    await withR2((client) => client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: bytes, ContentType: "application/pdf" })));
    const from = t.appraisalId ? { kind: "appraisal" as const, id: t.appraisalId } : t.listingId ? { kind: "listing" as const, id: t.listingId } : null;
    if (from) {
      await addFileDoc({
        home: { address: t.propertyAddress, propertyId: t.propertyId ?? null },
        from,
        type: "landlord_answers",
        name: "Landlord answers and declarations (with the signed contract)",
        fileName: `Landlord answers - ${t.propertyAddress}.pdf`,
        r2Key: key,
        mime: "application/pdf",
        sizeBytes: bytes.length,
        by: { id: t.agentId, name: t.agentName },
        isTest: await isTestFile({ appraisalId: t.appraisalId, address: t.propertyAddress }).catch(() => false),
      });
    }
    return key;
  } catch (e) {
    console.error("[terms] answers record not filed", t.id, e instanceof Error ? e.message : e);
    return null;
  }
}
