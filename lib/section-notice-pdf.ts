import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Notice } from "@/lib/section-notices";
import {
  DECISION_LABEL, HEADER, NO_RISKS, SPECS, STATUS_LABEL, dayLabel, increaseOf, money, pounds,
  type CheckLine, type FieldLine,
} from "@/lib/section-notices-spec";

/**
 * A notice as Michael's own document, filled in (7 Oct 2026).
 *
 * James to Michael: "I can make that downloadable. You can download it onto
 * your desktop, and then you can just pull it up side by side" while he
 * serves it through PayProp, or files it in Proclaim. So this is his Word
 * document's layout - the header, the numbered sections, the declaration,
 * Compliance use only, the decision - with the boxes ticked as they were
 * ticked, the values as they were typed, and the files listed against the
 * line each one proves.
 *
 * Helvetica rather than an embedded face: this is a working copy for the
 * office, it must open anywhere, and it should never fail to draw because a
 * font file did not load. Text is folded to what Helvetica can print.
 */

const A4 = { w: 595.28, h: 841.89 };
const M = 50;
const INK = rgb(0.063, 0.063, 0.078);
const MUTED = rgb(0.42, 0.42, 0.44);
const ACCENT = rgb(0.659, 0.353, 0.318);
const LINE = rgb(0.79, 0.79, 0.79);

/** What WinAnsi Helvetica can draw; everything else folded or dropped. */
function plain(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\r\t\xA0]/g, " ")
    .replace(/[^\n\x20-\x7E£©®°·À-ÿ]/g, "");
}

class Writer {
  pdf: PDFDocument;
  page!: PDFPage;
  y = 0;
  constructor(pdf: PDFDocument, private reg: PDFFont, private bold: PDFFont, private ref: string) {
    this.pdf = pdf;
    this.newPage();
  }
  newPage() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
  }
  need(h: number) {
    if (this.y - h < M + 20) this.newPage();
  }
  wrap(text: string, size: number, width: number, font = this.reg): string[] {
    const out: string[] = [];
    for (const para of plain(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) line = next;
        else {
          if (line) out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  }
  text(s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.bold ? this.bold : this.reg;
    const x = o.x ?? M;
    const lines = this.wrap(s, size, o.width ?? A4.w - M - x, font);
    for (const l of lines) {
      this.need(size + 4);
      this.page.drawText(l, { x, y: this.y - size, size, font, color: o.color ?? INK });
      this.y -= size + 4;
    }
    this.y -= o.gap ?? 0;
  }
  heading(s: string) {
    /* Room for the heading and its first lines, so it never sits alone at a page foot. */
    this.need(80);
    this.y -= 10;
    this.text(s, { size: 13, bold: true, gap: 2 });
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 8;
  }
  box(ticked: boolean, label: string, extra?: string) {
    const size = 10;
    const lines = this.wrap(label, size, A4.w - M * 2 - 22);
    this.need(lines.length * (size + 4) + (extra ? 14 : 0) + 4);
    const top = this.y;
    this.page.drawRectangle({ x: M, y: top - 11, width: 10, height: 10, borderColor: ticked ? ACCENT : MUTED, borderWidth: 0.9, color: ticked ? rgb(1, 0.894, 0.875) : undefined });
    if (ticked) {
      this.page.drawLine({ start: { x: M + 2, y: top - 6 }, end: { x: M + 4.3, y: top - 9 }, thickness: 1.4, color: ACCENT });
      this.page.drawLine({ start: { x: M + 4.3, y: top - 9 }, end: { x: M + 8.6, y: top - 2.6 }, thickness: 1.4, color: ACCENT });
    }
    for (const l of lines) {
      this.page.drawText(l, { x: M + 18, y: this.y - size, size, font: this.reg, color: ticked ? INK : MUTED });
      this.y -= size + 4;
    }
    if (extra) this.text(extra, { size: 8.5, color: MUTED, x: M + 18 });
    this.y -= 2;
  }
  field(label: string, value: string, note?: string) {
    const size = 10;
    const labelW = 190;
    const vLines = this.wrap(value || "-", size, A4.w - M * 2 - labelW);
    this.need(vLines.length * (size + 4) + 6);
    this.page.drawText(plain(label), { x: M, y: this.y - size, size, font: this.reg, color: MUTED });
    for (const l of vLines) {
      this.page.drawText(l, { x: M + labelW, y: this.y - size, size, font: this.bold, color: value ? INK : MUTED });
      this.y -= size + 4;
    }
    if (note) this.text(note, { size: 8, color: MUTED, x: M + labelW });
    this.y -= 3;
  }
  footers() {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => {
      p.drawText(plain(`The Letting Experts · ${this.ref} · Page ${i + 1} of ${pages.length}`), { x: M, y: 28, size: 8, font: this.reg, color: MUTED });
    });
  }
}

export async function noticePdf(n: Notice): Promise<Uint8Array> {
  const spec = SPECS[n.kind];
  const a = n.answers;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${spec.title} - ${n.propertyLabel}`);
  pdf.setProducer("The Letting Experts");
  pdf.setCreationDate(new Date());
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, reg, bold, `Ref ${n.id.slice(0, 8).toUpperCase()}`);

  const filesOn = (line: string, side: "agent" | "compliance" = "agent") => n.files.filter((f) => f.lineId === line && f.side === side).map((f) => f.name);
  const typed = (id: string) => !a.auto.includes(id);

  w.text("THE LETTING EXPERTS", { size: 9, bold: true, color: ACCENT, gap: 6 });
  w.text(spec.title, { size: 18, bold: true, gap: 6 });
  w.text(spec.intro, { size: 9.5, color: MUTED, gap: 4 });
  w.text(`Status: ${STATUS_LABEL[n.status]}${n.test ? " (test home)" : ""}`, { size: 9.5, bold: true, color: ACCENT, gap: 8 });

  for (const h of HEADER) {
    const v = h.input === "date" ? dayLabel(a.fields[h.id]) : a.fields[h.id] ?? "";
    w.field(h.label, v, a.fields[h.id] && typed(h.id) ? "Entered by the agent, not from the record" : undefined);
  }

  const fieldValue = (l: FieldLine) => {
    if (l.computed && l.id === "increase") {
      const inc = increaseOf(a);
      return inc == null ? "" : pounds(inc);
    }
    const v = a.fields[l.id] ?? "";
    if (!v) return "";
    if (l.input === "date") return dayLabel(v);
    if (l.input === "money") { const m = money(v); return m == null ? v : pounds(m); }
    return v;
  };

  let num = 0;
  for (const sec of spec.sections) {
    num += 1;
    w.heading(`${num}  ${sec.title}`);
    if (sec.note) w.text(sec.note, { size: 9, color: MUTED, gap: 4 });
    if (sec.risk) {
      const ticked = sec.lines.filter((l) => l.type === "check" && a.checks[l.id]);
      w.box(Boolean(a.checks[NO_RISKS]) && !ticked.length, "None of these apply");
    }
    for (const l of sec.lines) {
      if (l.type === "field") {
        if (l.input === "longtext") {
          w.text(l.label, { size: 9.5, color: MUTED });
          w.text(a.fields[l.id] || "-", { size: 10, bold: Boolean(a.fields[l.id]), gap: 6 });
        } else w.field(l.label.replace(/ £$/, ""), fieldValue(l));
        continue;
      }
      const files = filesOn(l.id);
      w.box(Boolean(a.checks[l.id]), l.label, files.length ? `Attached: ${files.join(", ")}` : undefined);
    }
  }
  const other = filesOn("other");
  if (other.length) {
    w.heading("Other Supporting Documents");
    for (const name of other) w.text(name, { size: 10 });
  }

  w.heading("Agent Declaration");
  for (const l of spec.declaration) w.box(Boolean(a.checks[l.id]), l.label);
  w.y -= 4;
  w.field("Agent name", n.agentName);
  w.field("Signature", a.signature, a.signature ? "Typed by the agent as their signature" : undefined);
  w.field("Date", n.submittedAt ? dayLabel(n.submittedAt.slice(0, 10)) : "");

  w.heading("Compliance Use Only");
  for (const l of spec.compliance) w.box(Boolean(n.review.checks[l.id]), l.label);

  w.heading("Decision");
  for (const d of spec.decisions) w.box(n.review.decision === d, DECISION_LABEL[d].toUpperCase());
  w.y -= 4;
  w.text("Comments and requirements", { size: 9.5, color: MUTED });
  w.text(n.review.comments || "-", { size: 10, bold: Boolean(n.review.comments), gap: 6 });
  w.field("Compliance approved by", n.review.decision === "approved" ? n.decidedBy : n.review.decision ? `${n.decidedBy} (${DECISION_LABEL[n.review.decision].toLowerCase()})` : "");
  w.field("Date", n.decidedAt ? dayLabel(n.decidedAt.slice(0, 10)) : "");

  if (spec.postService.length || n.status === "served") {
    w.heading("Post Service");
    for (const l of spec.postService as CheckLine[]) {
      const files = filesOn(l.id, "compliance");
      w.box(Boolean(n.postService.checks[l.id]), l.label, files.length ? `Attached: ${files.join(", ")}` : undefined);
    }
    w.field("Date served", dayLabel(n.postService.servedOn));
    w.field("Method of service", n.postService.method);
    const served = filesOn("final_notice", "compliance");
    if (served.length) w.field("Served notice", served.join(", "));
  }

  w.y -= 8;
  for (const line of spec.footer) w.text(line, { size: 8.5, color: MUTED, gap: 3 });

  if (n.history.length) {
    w.heading("History");
    for (const h of n.history) {
      const when = new Date(h.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
      w.text(`${when}  ${h.what}, ${h.by}${h.note ? `: ${h.note}` : ""}`, { size: 8.5, color: MUTED });
    }
  }

  w.footers();
  return pdf.save();
}
