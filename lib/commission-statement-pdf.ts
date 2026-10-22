import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { StatementLine } from "@/lib/business/payprop-income";
import { dayShort, dayWords, monthWords, type Period } from "@/lib/statement-period";

/**
 * A partner's commission statement as a TLE document (agents' call, 19 Oct
 * 2026: a statement for any period, downloaded when they want it, instead of
 * PayProp's monthly ones that some never receive).
 *
 * The house rules for a branded document: Montserrat for the words (Unitext
 * is not vendored, and Montserrat is its stated fallback), titles in Title
 * Case and never bold, no em dashes, the full logo at the top. Fonts are
 * embedded from lib/fonts so it prints the same anywhere.
 *
 * Only ever drawn from a complete statement: the route refuses before this
 * file is reached if PayProp could not answer for every agency.
 */

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const INK = rgb(0.227, 0.227, 0.235);
const MUTED = rgb(0.42, 0.42, 0.44);
const RED = rgb(0.894, 0.118, 0.216);
const PINK = rgb(0.992, 0.937, 0.925);
const CLAY = rgb(0.812, 0.627, 0.588);
const RULE = rgb(0.9, 0.86, 0.85);

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => GBP.format(n);

export interface StatementPdfInput {
  agentName: string;
  period: Period;
  lines: StatementLine[];
  other: StatementLine[];
  total: number;
  totalNet: number;
  otherTotal: number;
  readAt: string;
}

/** Montserrat carries far more than WinAnsi, but fold the typographer's dashes anyway: house style. */
const clean = (s: string) => s.replace(/[–—−]/g, "-").replace(/[\r\t\n]/g, " ");

class Doc {
  page!: PDFPage;
  y = 0;
  constructor(
    public pdf: PDFDocument,
    public reg: PDFFont,
    public semi: PDFFont,
    private onNewPage: () => void,
  ) {}
  newPage() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
    this.onNewPage();
  }
  need(h: number) {
    if (this.y - h < M + 30) this.newPage();
  }
  width(s: string, size: number, font = this.reg) {
    return font.widthOfTextAtSize(clean(s), size);
  }
  /** Shorten to fit, with an ellipsis, so a long address never runs into the next column. */
  fit(s: string, size: number, max: number, font = this.reg) {
    let t = clean(s);
    if (this.width(t, size, font) <= max) return t;
    while (t.length > 1 && this.width(`${t}...`, size, font) > max) t = t.slice(0, -1);
    return `${t.trimEnd()}...`;
  }
  draw(s: string, x: number, y: number, size: number, o: { font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) {
    const font = o.font ?? this.reg;
    const t = clean(s);
    const at = o.right ? x - font.widthOfTextAtSize(t, size) : x;
    this.page.drawText(t, { x: at, y, size, font, color: o.color ?? INK });
  }
  wrap(s: string, size: number, max: number): string[] {
    const out: string[] = [];
    let line = "";
    for (const word of clean(s).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (this.width(next, size) <= max) line = next;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    return out;
  }
  para(s: string, size = 8.5, color = MUTED, gap = 3) {
    for (const l of this.wrap(s, size, A4.w - M * 2)) {
      this.need(size + gap);
      this.draw(l, M, this.y - size, size, { color });
      this.y -= size + gap;
    }
  }
  rule(color = RULE, thickness = 0.6) {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness, color });
  }
  heading(s: string, room = 70) {
    this.need(room);
    this.y -= 14;
    this.draw(s, M, this.y - 13, 13);
    this.y -= 20;
    this.rule(CLAY, 0.8);
    this.y -= 4;
  }
}

/* Columns of the payment tables: paid on, property, type, amount. */
const COL = { date: M, prop: M + 74, type: M + 292, amount: A4.w - M };
const PROP_W = COL.type - COL.prop - 12;
const TYPE_W = COL.amount - COL.type - 64;

function tableHead(d: Doc) {
  d.need(40);
  d.y -= 6;
  const y = d.y - 8;
  d.draw("Paid on", COL.date, y, 7.5, { color: MUTED });
  d.draw("Property", COL.prop, y, 7.5, { color: MUTED });
  d.draw("Type", COL.type, y, 7.5, { color: MUTED });
  d.draw("Amount", COL.amount, y, 7.5, { color: MUTED, right: true });
  d.y -= 13;
  d.rule();
}

function paymentRows(d: Doc, lines: StatementLine[], byMonth: boolean) {
  tableHead(d);
  let month = "";
  let monthTotal = 0;
  const closeMonth = () => {
    if (!month || !byMonth) return;
    d.need(18);
    d.y -= 13;
    d.draw(`${monthWords(`${month}-01`)} total`, COL.type, d.y, 8.5, { font: d.semi });
    d.draw(money(monthTotal), COL.amount, d.y, 8.5, { font: d.semi, right: true });
    d.y -= 6;
  };
  for (const l of lines) {
    const m = l.paidOn.slice(0, 7);
    if (m !== month) {
      closeMonth();
      month = m;
      monthTotal = 0;
      if (byMonth) {
        d.need(40);
        d.y -= 16;
        d.draw(monthWords(l.paidOn), COL.date, d.y, 9.5, { color: RED });
        d.y -= 4;
      }
    }
    if (d.y - 16 < M + 30) {
      d.newPage();
      tableHead(d);
    }
    d.y -= 13;
    d.draw(dayShort(l.paidOn), COL.date, d.y, 8.5);
    d.draw(d.fit(l.property, 8.5, PROP_W), COL.prop, d.y, 8.5);
    d.draw(d.fit(l.category, 8.5, TYPE_W), COL.type, d.y, 8.5, { color: MUTED });
    d.draw(money(l.amount), COL.amount, d.y, 8.5, { right: true });
    d.y -= 3;
    d.page.drawLine({ start: { x: M, y: d.y }, end: { x: A4.w - M, y: d.y }, thickness: 0.3, color: RULE });
    monthTotal += l.amount;
  }
  closeMonth();
}

export async function commissionStatementPdf(s: StatementPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const title = `Commission Statement - ${s.agentName} - ${s.period.title}`;
  pdf.setTitle(clean(title));
  pdf.setAuthor("The Letting Experts");
  pdf.setProducer("TLE OS");
  pdf.setCreationDate(new Date());

  const fonts = path.join(process.cwd(), "lib", "fonts");
  const reg = await pdf.embedFont(await fs.readFile(path.join(fonts, "montserrat-400.ttf")), { subset: true });
  const semi = await pdf.embedFont(await fs.readFile(path.join(fonts, "montserrat-600.ttf")), { subset: true });
  let logo: PDFImage | null = null;
  try {
    logo = await pdf.embedPng(await fs.readFile(path.join(process.cwd(), "public", "brand", "tle-logo.png")));
  } catch {
    /* A statement without the logo is still a statement. */
  }

  let first = true;
  const d: Doc = new Doc(pdf, reg, semi, () => {
    if (first) return;
    /* Continuation pages carry a small mark of whose statement this is. */
    d.draw(`Commission Statement, ${s.agentName}, ${s.period.title}`, M, d.y - 8, 7.5, { color: MUTED });
    d.y -= 22;
  });
  d.newPage();
  first = false;

  /* ── Masthead ── */
  const logoH = 46;
  if (logo) d.page.drawImage(logo, { x: M, y: d.y - logoH, width: (logo.width / logo.height) * logoH, height: logoH });
  const right = A4.w - M;
  d.draw("Commission Statement", right, d.y - 18, 20, { right: true });
  d.draw(s.agentName, right, d.y - 34, 11, { right: true, font: semi });
  d.draw(`${dayWords(s.period.from)} to ${dayWords(s.period.to)}`, right, d.y - 48, 8.5, { right: true, color: MUTED });
  d.y -= logoH + 22;
  d.page.drawLine({ start: { x: M, y: d.y }, end: { x: M + 36, y: d.y }, thickness: 2, color: RED });
  d.y -= 16;

  const periodLine = s.period.toDate ? `${s.period.title}, so Far` : s.period.title;
  d.draw(periodLine, M, d.y - 11, 11);
  const issued = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  d.draw(`Issued ${issued}`, right, d.y - 11, 8.5, { right: true, color: MUTED });
  d.y -= 24;

  /* ── The figures, on the pink ── */
  const bandH = 66;
  d.page.drawRectangle({ x: M, y: d.y - bandH, width: A4.w - M * 2, height: bandH, color: PINK });
  const homes = new Set(s.lines.map((l) => l.propertyId || l.property)).size;
  const cells: [string, string][] = [
    ["Commission paid", money(s.total)],
    ["Net of VAT", money(s.totalNet)],
    ["Payments", String(s.lines.length)],
    ["Homes", String(homes)],
  ];
  const cellW = (A4.w - M * 2 - 32) / cells.length;
  cells.forEach(([label, value], i) => {
    const x = M + 16 + i * cellW;
    d.draw(label, x, d.y - 22, 8, { color: MUTED });
    d.draw(value, x, d.y - 44, i < 2 ? 17 : 15, { font: i === 0 ? semi : reg });
  });
  d.y -= bandH + 6;

  /* ── How it was worked out: on page one, small, rather than alone on the last page ── */
  const read = new Date(s.readAt);
  const readWords = `${read.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })} at ${read.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`;
  d.y -= 4;
  d.para(
    `Read from PayProp on ${readWords}. Commission is every fee PayProp paid to you: management, first month management, set-up, tenant find, transaction and Rent and Legal Protection fees. Each payment sits on the day PayProp sent it, the month the business counts it in. Amounts are as PayProp paid them; net of VAT takes one sixth off the total, as the accounts do.${s.period.toDate ? " This period has not finished, so the statement runs to the day it was issued." : ""}`,
    7.5,
  );

  if (!s.lines.length) {
    d.y -= 14;
    d.para("No commission was paid to you through PayProp in this period.", 10, INK);
  }

  /* ── By month, when there is more than one ── */
  const months = [...new Set(s.lines.map((l) => l.paidOn.slice(0, 7)))];
  if (months.length > 1) {
    d.heading("By Month", 40 + months.length * 15);
    for (const m of months) {
      const these = s.lines.filter((l) => l.paidOn.startsWith(m));
      const sum = these.reduce((n, l) => n + l.amount, 0);
      d.need(16);
      d.y -= 13;
      d.draw(monthWords(`${m}-01`), M, d.y, 9);
      d.draw(`${these.length} payment${these.length === 1 ? "" : "s"}`, COL.type, d.y, 8.5, { color: MUTED });
      d.draw(money(sum), COL.amount, d.y, 9, { right: true });
      d.y -= 3;
      d.page.drawLine({ start: { x: M, y: d.y }, end: { x: A4.w - M, y: d.y }, thickness: 0.3, color: RULE });
    }
  }

  /* ── By type ── */
  if (s.lines.length) {
    const cats = new Map<string, { n: number; sum: number }>();
    for (const l of s.lines) {
      const c = cats.get(l.category) ?? { n: 0, sum: 0 };
      c.n += 1;
      c.sum += l.amount;
      cats.set(l.category, c);
    }
    const sorted = [...cats.entries()].sort((a, b) => b[1].sum - a[1].sum);
    d.heading("By Type", 40 + sorted.length * 15);
    for (const [cat, c] of sorted) {
      d.need(16);
      d.y -= 13;
      d.draw(cat, M, d.y, 9);
      d.draw(`${c.n} payment${c.n === 1 ? "" : "s"}`, COL.type, d.y, 8.5, { color: MUTED });
      d.draw(money(c.sum), COL.amount, d.y, 9, { right: true });
      d.y -= 3;
      d.page.drawLine({ start: { x: M, y: d.y }, end: { x: A4.w - M, y: d.y }, thickness: 0.3, color: RULE });
    }
    d.need(18);
    d.y -= 15;
    d.draw("Total commission", M, d.y, 9.5, { font: semi });
    d.draw(money(s.total), COL.amount, d.y, 9.5, { font: semi, right: true });
    d.y -= 4;
  }

  /* ── Every payment ── */
  if (s.lines.length) {
    d.heading("Every Payment", 110);
    paymentRows(d, s.lines, months.length > 1);
  }

  /* ── Money through PayProp that is not commission ── */
  if (s.other.length) {
    d.heading("Also Paid to You, Not Commission", 120);
    d.para("Money PayProp passed to you that is not a fee, such as contractor work. Listed so this statement squares with what reached your bank. It is not in the commission total.");
    paymentRows(d, s.other, false);
    d.need(18);
    d.y -= 15;
    d.draw("Total, not commission", COL.type, d.y, 8.5, { font: semi });
    d.draw(money(s.otherTotal), COL.amount, d.y, 8.5, { font: semi, right: true });
    d.y -= 4;
  }

  /* ── Footers ── */
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: A4.w - M, y: 40 }, thickness: 0.4, color: RULE });
    const left = clean(`The Letting Experts  ·  Commission Statement  ·  ${s.agentName}`);
    p.drawText(left, { x: M, y: 28, size: 7.5, font: reg, color: MUTED });
    const pg = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pg, { x: A4.w - M - reg.widthOfTextAtSize(pg, 7.5), y: 28, size: 7.5, font: reg, color: MUTED });
  });

  return pdf.save();
}
