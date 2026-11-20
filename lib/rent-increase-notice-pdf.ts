import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { NOTICE, type Block, type Filled, type Run } from "@/lib/rent-increase-notice-text";

/**
 * THE RENT-INCREASE NOTICE AS THE TENANT RECEIVES IT (Scotland, 20 Nov 2026).
 *
 * The prescribed form, every word from lib/rent-increase-notice-text, laid
 * out as the agents' own notices were: the title and the Act centred, the
 * advice, Part 1 and Part 2a, Part 2b on a page of its own saying the home is
 * not in a Rent Pressure Zone, Part 3 blank for the tenant on its own page,
 * then the official guidance notes for landlords and for tenants. Only the
 * blanks carry our words.
 *
 * pdf-lib with the standard Helvetica, as lib/section-notice-pdf does: it
 * opens anywhere and never fails to draw for want of a font file. Helvetica
 * speaks WinAnsi, which has the form's curly quotes, dashes and bullets; any
 * other character a person types into a blank is folded to its nearest
 * plain letter rather than dropped silently.
 */

const A4 = { w: 595.28, h: 841.89 };
const M = 66;
const W = A4.w - M * 2;
const BODY = 11;
const LEAD = 15;
const INK = rgb(0, 0, 0);

/* Characters Helvetica (WinAnsi) has; anything else is folded. */
function plain(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[‘’‛]/g, (c) => c)
    .replace(/[ \t\r]/g, " ")
    .replace(/[—−]/g, "-")
    .replace(/[^\n\x20-\x7E£©®°·À-ÿ–‘’“”•…]/g, (c) => {
      const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return /^[\x20-\x7E]+$/.test(base) ? base : "";
    });
}

type Fonts = { reg: PDFFont; bold: PDFFont; ital: PDFFont; boldItal: PDFFont };

/* How far the text really advances. pdf-lib's widthOfTextAtSize takes the
   font's kerning pairs off ("PRIVATE" loses the V-A and A-T pairs) but
   drawText does not kern, so measured whole words ran into the next one. */
const wid = (font: PDFFont, text: string, size: number) => {
  let w = 0;
  for (const ch of text) w += font.widthOfTextAtSize(ch, size);
  return w;
};
type Word = { text: string; font: PDFFont; size: number; raise?: number; space: boolean };

class Layout {
  pdf: PDFDocument;
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  /** Footnotes waiting at the foot of the page they were marked on. */
  private feet: { n: number; lines: string[] }[] = [];
  private footH = 0;
  private f: Fonts;
  private filled: Filled;
  constructor(pdf: PDFDocument, f: Fonts, filled: Filled) {
    this.pdf = pdf;
    this.f = f;
    this.filled = filled;
    this.newPage();
  }

  newPage() {
    if (this.page) this.drawFeet();
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M;
    this.feet = [];
    this.footH = 0;
  }
  private bottom() {
    return M + 14 + this.footH;
  }
  need(h: number) {
    if (this.y - h < this.bottom()) this.newPage();
  }

  /* Words from runs, each in its own face. A blank still to fill prints as a line to write on. */
  words(runs: Run[], o: { bold?: boolean; size?: number } = {}): Word[] {
    const size = o.size ?? BODY;
    const out: Word[] = [];
    const push = (text: string, font: PDFFont, raise?: number) => {
      const t = plain(text);
      const parts = t.split(/( +)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^ +$/.test(part)) {
          if (out.length) out[out.length - 1].space = true;
          continue;
        }
        out.push({ text: part, font, size: raise ? size * 0.62 : size, raise, space: false });
      }
    };
    for (const r of runs) {
      if (typeof r === "string") push(r, o.bold ? this.f.bold : this.f.reg);
      else if ("b" in r) push(r.b, this.f.bold);
      else if ("i" in r) push(r.i, o.bold ? this.f.boldItal : this.f.ital);
      else if ("bi" in r) push(r.bi, this.f.boldItal);
      else if ("fn" in r) push(String(r.fn), this.f.reg, size * 0.38);
      else push(this.filled[r.v].join(", ") || "________________", o.bold ? this.f.bold : this.f.reg);
    }
    return out;
  }

  /** Lay words into lines no wider than `width`. */
  lines(words: Word[], width: number): Word[][] {
    const out: Word[][] = [];
    let line: Word[] = [];
    let w = 0;
    for (const word of words) {
      const ww = wid(word.font, word.text, word.size);
      const gap = line.length && line[line.length - 1].space ? line[line.length - 1].font.widthOfTextAtSize(" ", line[line.length - 1].size) : 0;
      if (line.length && w + gap + ww > width) {
        out.push(line);
        line = [word];
        w = ww;
      } else {
        line.push(word);
        w += gap + ww;
      }
    }
    if (line.length) out.push(line);
    return out;
  }

  drawLine(line: Word[], x: number, opts: { centre?: number; size?: number } = {}) {
    const size = opts.size ?? BODY;
    let width = 0;
    line.forEach((w, i) => {
      width += wid(w.font, w.text, w.size) + (w.space && i < line.length - 1 ? w.font.widthOfTextAtSize(" ", w.size) : 0);
    });
    let cx = opts.centre != null ? opts.centre - width / 2 : x;
    for (const [i, w] of line.entries()) {
      this.page.drawText(w.text, { x: cx, y: this.y - size + (w.raise ?? 0), size: w.size, font: w.font, color: INK });
      cx += wid(w.font, w.text, w.size) + (w.space && i < line.length - 1 ? w.font.widthOfTextAtSize(" ", w.size) : 0);
    }
  }

  para(runs: Run[], o: { bold?: boolean; size?: number; x?: number; width?: number; centre?: boolean; after?: number } = {}) {
    const size = o.size ?? BODY;
    const lead = size * (LEAD / BODY);
    const x = o.x ?? M;
    const lines = this.lines(this.words(runs, { bold: o.bold, size }), o.width ?? A4.w - M - x);
    /* Keep a short paragraph together, and never leave a heading alone at a page foot. */
    this.need(Math.min(lines.length, 3) * lead + (o.bold && lines.length < 3 ? 2 * LEAD : 0));
    for (const l of lines) {
      this.need(lead);
      this.drawLine(l, x, { centre: o.centre ? A4.w / 2 : undefined, size });
      this.y -= lead;
    }
    this.y -= o.after ?? 8;
  }

  footnote(n: number, text: string) {
    const size = 8.5;
    const lines = this.lines(this.words([text], { size }), W - 14).map((l) => l.map((w) => w.text).join(" "));
    this.feet.push({ n, lines });
    this.footH += lines.length * (size + 2.5) + 6;
  }
  private drawFeet() {
    if (!this.feet.length) return;
    const size = 8.5;
    let y = M + 4 + this.footH;
    this.page.drawLine({ start: { x: M, y: y + 2 }, end: { x: M + 140, y: y + 2 }, thickness: 0.5, color: INK });
    y -= 4;
    for (const f of this.feet) {
      this.page.drawText(String(f.n), { x: M, y: y - size + 3, size: size * 0.75, font: this.f.reg, color: INK });
      for (const l of f.lines) {
        this.page.drawText(l, { x: M + 10, y: y - size, size, font: this.f.reg, color: INK });
        y -= size + 2.5;
      }
      y -= 6;
    }
  }

  block(b: Block) {
    switch (b.k) {
      case "title":
        this.need(40);
        this.para([b.text], { bold: true, size: 14, centre: true, after: 12 });
        break;
      case "subtitle":
        this.para([b.text], { bold: true, size: 12, centre: true, x: M + 30, width: W - 60, after: 14 });
        break;
      case "p":
        this.para(b.runs, { bold: b.bold, size: b.size === "big" ? 13 : BODY, after: 10 });
        break;
      case "value": {
        const lines = this.filled[b.v];
        for (const l of lines.length ? lines : ["________________________________"]) this.para([l], { after: 0 });
        this.y -= 10;
        break;
      }
      case "bullets":
        for (const item of b.items) {
          const x = M + (b.indent ? 22 : 16);
          const lines = this.lines(this.words(item), A4.w - M - (x + 20));
          this.need(Math.min(lines.length, 2) * LEAD);
          this.page.drawText("•", { x, y: this.y - BODY, size: BODY, font: this.f.reg, color: INK });
          for (const l of lines) {
            this.need(LEAD);
            this.drawLine(l, x + 20);
            this.y -= LEAD;
          }
          this.y -= b.indent ? 1 : 2;
        }
        this.y -= 8;
        break;
      case "numbered":
        for (const item of b.items) {
          const depth = item.n.length - item.n.trimStart().length > 0 ? 1 : 0;
          const x = M + (depth ? 20 : 0);
          const tx = x + 26;
          const lines = this.lines(this.words(item.runs), A4.w - M - tx);
          this.need(Math.min(lines.length, 2) * LEAD);
          this.page.drawText(plain(item.n.trim()), { x, y: this.y - BODY, size: BODY, font: this.f.reg, color: INK });
          for (const l of lines) {
            this.need(LEAD);
            this.drawLine(l, tx);
            this.y -= LEAD;
          }
          this.y -= 8;
        }
        break;
      case "check": {
        const tx = M + 34;
        const lines = this.lines(this.words(b.runs), A4.w - M - tx);
        this.need(Math.min(lines.length, 2) * LEAD + 4);
        const top = this.y - 1;
        this.page.drawRectangle({ x: M + 4, y: top - 12, width: 12, height: 12, borderColor: INK, borderWidth: 1 });
        if (b.ticked) this.page.drawText("X", { x: M + 6.4, y: top - 10.4, size: 10.5, font: this.f.reg, color: INK });
        for (const l of lines) {
          this.need(LEAD);
          this.drawLine(l, tx);
          this.y -= LEAD;
        }
        for (const s of b.sub ?? []) {
          this.y -= 3;
          this.para(s, { x: tx, after: 0 });
        }
        this.y -= 12;
        break;
      }
      case "sign": {
        this.need(LEAD * 2.4);
        this.y -= 8;
        const label = this.words(b.runs);
        let lw = 0;
        label.forEach((w, i) => { lw += wid(w.font, w.text, w.size) + (w.space && i < label.length - 1 ? w.font.widthOfTextAtSize(" ", w.size) : 0); });
        this.drawLine(label, M);
        const start = M + lw + (label[label.length - 1]?.space ? 3 : 2);
        const end = A4.w - M - 20;
        const lineY = this.y - BODY - 2;
        this.page.drawLine({ start: { x: start, y: lineY }, end: { x: end, y: lineY }, thickness: 0.7, color: INK });
        const v = this.filled[b.v].join(", ");
        if (v) {
          const sig = b.v === "signature";
          const size = sig ? 15 : BODY;
          this.page.drawText(plain(v), { x: start + 12, y: lineY + 3, size, font: sig ? this.f.ital : this.f.reg, color: INK });
        }
        this.y -= LEAD + 14;
        break;
      }
      case "rule":
        this.need(16);
        this.page.drawLine({ start: { x: M, y: this.y - 4 }, end: { x: A4.w - M, y: this.y - 4 }, thickness: 0.6, color: INK });
        this.y -= 16;
        break;
      case "page":
        this.newPage();
        break;
      case "footnote":
        this.footnote(b.n, b.text);
        break;
    }
  }

  finish() {
    this.drawFeet();
    for (const [i, p] of this.pages.entries()) {
      const label = String(i + 1);
      p.drawText(label, { x: A4.w - M - this.f.reg.widthOfTextAtSize(label, 10), y: M - 30, size: 10, font: this.f.reg, color: INK });
    }
  }
}

/** The notice, filled, as PDF bytes. */
export async function rentIncreaseNoticePdf(filled: Filled, meta: { title: string; author: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(plain(meta.title));
  pdf.setAuthor(plain(meta.author));
  pdf.setSubject("Landlord's rent-increase notice to tenant(s) under section 22(1) of the Private Housing (Tenancies) (Scotland) Act 2016");
  pdf.setCreator("TLE OS");
  const fonts: Fonts = {
    reg: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    ital: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItal: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const out = new Layout(pdf, fonts, filled);
  for (const section of NOTICE) for (const b of section.blocks) out.block(b);
  out.finish();
  return pdf.save();
}
