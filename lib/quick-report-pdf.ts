import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { areaWords, type QuickReport } from "@/lib/quick-report";

/**
 * The free landlord report as two landscape pages (lib/quick-report).
 *
 * House rules for a branded document, as lib/commission-statement-pdf: Montserrat
 * for the words (Unitext is not vendored; Montserrat is its fallback), titles in
 * Title Case and never bold, no em dashes, the logo at the top. The final
 * palette (brown, terracotta, olive, linen, clay); nothing red, nothing pink.
 */

const W = 841.89;
const H = 595.28;
const M = 40;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const BROWN = hex("#56423E");
const TERRA = hex("#A85A51");
const OLIVE = hex("#56634A");
const OLIVE_WASH = hex("#F1F4EC");
const CLAY = hex("#C4A092");
const LINEN = hex("#F5EFE6");
const INK = hex("#2E2A28");
const MUTED = hex("#7A706C");
const RULE = hex("#E6DDD3");
const WHITE = rgb(1, 1, 1);

const clean = (s: string) => s.replace(/[–—−]/g, "-").replace(/[\r\t\n]+/g, " ").replace(/\s+/g, " ").trim();
const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const NUM_WORDS = ["", "one", "two", "three", "four", "five"];
const bedWords = (b: number) => (b >= 5 ? "five or more bedroom" : `${NUM_WORDS[b] ?? b} bedroom`);
const dateWords = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

class Page {
  constructor(public p: PDFPage, public reg: PDFFont, public semi: PDFFont) {}
  w(s: string, size: number, font = this.reg) {
    return font.widthOfTextAtSize(clean(s), size);
  }
  text(s: string, x: number, y: number, size: number, o: { font?: PDFFont; color?: RGB; right?: boolean } = {}) {
    const font = o.font ?? this.reg;
    const t = clean(s);
    this.p.drawText(t, { x: o.right ? x - font.widthOfTextAtSize(t, size) : x, y, size, font, color: o.color ?? INK });
  }
  /** Wraps to `max` wide; returns the y under the last line. */
  para(s: string, x: number, y: number, size: number, max: number, o: { font?: PDFFont; color?: RGB; lead?: number; lines?: number } = {}) {
    const font = o.font ?? this.reg;
    const lead = o.lead ?? size * 1.4;
    const words = clean(s).split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > max && cur) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    const shown = o.lines ? lines.slice(0, o.lines) : lines;
    shown.forEach((l, i) => this.p.drawText(l, { x, y: y - i * lead, size, font, color: o.color ?? INK }));
    return y - shown.length * lead;
  }
  rect(x: number, y: number, w: number, h: number, color: RGB) {
    this.p.drawRectangle({ x, y, width: w, height: h, color });
  }
  rule(x1: number, y: number, x2: number, color = RULE) {
    this.p.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.75, color });
  }
  label(s: string, x: number, y: number, color = TERRA) {
    this.text(s.toUpperCase(), x, y, 8.5, { font: this.semi, color });
  }
}

let fontCache: { reg: Uint8Array; semi: Uint8Array; logo: Uint8Array } | null = null;
async function assets() {
  if (fontCache) return fontCache;
  const root = process.cwd();
  const [reg, semi, logo] = await Promise.all([
    fs.readFile(path.join(root, "lib/fonts/montserrat-400.ttf")),
    fs.readFile(path.join(root, "lib/fonts/montserrat-600.ttf")),
    fs.readFile(path.join(root, "public/brand/tle-logo-coral.png")),
  ]);
  fontCache = { reg, semi, logo };
  return fontCache;
}

/** "12 Dover Close, Duston, Northampton NN5 4WJ" -> ["12 Dover Close", "Duston, Northampton NN5 4WJ"]. */
function splitAddress(address: string, postcode: string): [string, string] {
  const parts = clean(address).replace(/,?\s*(UK|United Kingdom)$/i, "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return [postcode, ""];
  const first = parts.shift()!;
  let rest = parts.join(", ");
  if (!rest.toUpperCase().includes(postcode.toUpperCase()) && !first.toUpperCase().includes(postcode.toUpperCase())) rest = rest ? `${rest} ${postcode}` : postcode;
  return [first, rest];
}

export async function quickReportPdf(r: QuickReport): Promise<Uint8Array> {
  const a = await assets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(a.reg, { subset: true });
  const semi = await pdf.embedFont(a.semi, { subset: true });
  const logo: PDFImage = await pdf.embedPng(a.logo);
  const rental = r.ask.kind === "rental";
  const title = rental ? "Rental Report" : "Market Report";
  pdf.setTitle(`${title}, ${r.ask.postcode}`);
  pdf.setAuthor("The Letting Experts");
  pdf.setCreator("TLE OS");

  const s = r.scope;
  const area = areaWords(s);
  const made = dateWords(r.madeAt);

  /* ── Page 1: their home (or their area) at a glance ───────────────────── */
  {
    const pg = new Page(pdf.addPage([W, H]), reg, semi);
    const PANEL = 292;
    pg.rect(0, 0, PANEL, H, LINEN);
    const lw = 104;
    pg.p.drawImage(logo, { x: M, y: H - M - (lw * 465) / 869, width: lw, height: (lw * 465) / 869 });

    pg.label(title, M, H - 170);
    const [line1, line2] = rental ? splitAddress(r.ask.address || r.ask.postcode, r.ask.postcode) : marketTitle(r);
    let y = pg.para(line1, M, H - 200, 24, PANEL - M * 2, { color: BROWN, lead: 29, lines: 3 });
    if (line2) y = pg.para(line2, M, y - 4, 11, PANEL - M * 2, { color: MUTED, lines: 2 });
    if (rental && (r.ask.beds || r.ask.type)) {
      const what = [r.ask.beds ? `${r.ask.beds >= 5 ? "5+" : r.ask.beds} bedroom` : null, r.ask.type].filter(Boolean).join(" ");
      pg.para(what.charAt(0).toUpperCase() + what.slice(1), M, y - 8, 11, PANEL - M * 2, { color: MUTED });
    }

    let fy = M + 46;
    if (r.ask.landlordName) {
      pg.label("Prepared for", M, fy + 30, MUTED);
      pg.text(r.ask.landlordName, M, fy + 14, 11, { color: INK });
      fy -= 6;
    }
    pg.text(`By ${r.agent.name}, ${made}`, M, fy - 10, 9, { color: MUTED });

    const X = PANEL + 44;
    const R = W - M;
    const CW = R - X;

    /* The headline figure. */
    let headLabel: string;
    let headFigure: string;
    let headSub: string;
    if (rental && r.sized) {
      const z = r.sized;
      headLabel = "Homes like yours are advertised for";
      headFigure = `${gbp(z.rent.median)} pcm`;
      headSub =
        `The middle asking rent of the ${z.rent.n} ${bedWords(z.beds)} homes advertised to let in ${areaWords(z.scope)} today` +
        (z.rent.n >= 2 && z.rent.low !== z.rent.high ? `, from ${gbp(z.rent.low)} to ${gbp(z.rent.high)}.` : ".") +
        (z.rent.n < 4 ? ` Only ${z.rent.n} of that size are advertised, so treat it as a rough guide.` : "");
    } else if (rental && r.ask.view) {
      headLabel = "Our early view for your home";
      headFigure = r.ask.view.low === r.ask.view.high ? `${gbp(r.ask.view.low)} pcm` : `${gbp(r.ask.view.low)} to ${gbp(r.ask.view.high)}`;
      headSub = `Before seeing inside. Too few homes of this size are advertised nearby to quote the market's own figure, so this is ours. A free visit lets us firm it up.`;
    } else {
      headLabel = `Typical asking rent in ${s.area}`;
      headFigure = s.rent ? `${gbp(s.rent.median)} pcm` : `${s.advertised} homes`;
      headSub = s.rent
        ? `The middle asking rent of the ${s.rent.n} homes advertised to let in ${area} today, every size together. By size, over the page.`
        : `Advertised to let in ${area} today.`;
    }
    pg.text(headLabel, X, H - 92, 12, { color: MUTED });
    pg.text(headFigure, X - 2, H - 156, 52, { color: BROWN });
    let ry = pg.para(headSub, X, H - 186, 10.5, CW - 40, { color: INK, lead: 15.5 });

    /* The agent's own early view, beside the market's figure. */
    if (rental && r.sized && r.ask.view) {
      const v = r.ask.view;
      const top = ry - 14;
      const bh = 70;
      pg.rect(X, top - bh, CW, bh, OLIVE_WASH);
      pg.label("Our early view", X + 18, top - 22, OLIVE);
      pg.text(v.low === v.high ? `${gbp(v.low)} pcm` : `${gbp(v.low)} to ${gbp(v.high)} pcm`, X + 18, top - 50, 20, { color: OLIVE });
      pg.para("Before seeing inside. A free visit lets us firm this up.", X + 300, top - 30, 9.5, CW - 318, { color: MUTED, lead: 13 });
      ry = top - bh;
    }
    if (r.ask.note) {
      ry = pg.para(r.ask.note, X, ry - 22, 10.5, CW - 40, { color: INK, lead: 15.5, lines: 4 });
    }

    /* Three live facts along the bottom. */
    const ty = M + 26;
    pg.rule(X, ty + 78, R);
    const col = CW / 3;
    const pct = s.advertised ? Math.round((s.letAgreed / s.advertised) * 100) : 0;
    const facts: Array<[string, string]> = [
      [String(s.advertised), `homes advertised to let in ${s.area} now`],
      [`${pct}%`, `already let agreed (${s.letAgreed} of ${s.advertised})`],
      [s.daysAdvertised ? `${s.daysAdvertised.median} days` : "Not known", "typical time advertised so far"],
    ];
    facts.forEach(([n, l], i) => {
      const fx = X + i * col;
      pg.text(n, fx, ty + 38, 24, { color: BROWN });
      pg.para(l, fx, ty + 18, 9, col - 18, { color: MUTED, lead: 12, lines: 2 });
    });
  }

  /* ── Page 2: the local market, and the next step ──────────────────────── */
  {
    const pg = new Page(pdf.addPage([W, H]), reg, semi);
    pg.label("The local market", M, H - M - 8);
    pg.text(`What Is Happening in ${s.area}`, M, H - M - 40, 24, { color: BROWN });

    const BAND = 150;
    const top = H - M - 84;
    const colW = (W - M * 2 - 48) / 2;

    /* Asking rent by size. */
    const LX = M;
    pg.label("Asking rent by size", LX, top, MUTED);
    const beds = s.beds.filter((b) => b.rent);
    const maxRent = Math.max(1, ...beds.map((b) => b.rent!.median));
    const rowH = 42;
    const barX = LX + 64;
    const barMax = colW - 64 - 130;
    if (!beds.length) {
      pg.para("Too few homes with a size and a price are advertised here to compare.", LX, top - 26, 10, colW, { color: MUTED });
    }
    beds.slice(0, 5).forEach((b, i) => {
      const y = top - 30 - i * rowH;
      const mine = rental && r.ask.beds != null && Math.min(r.ask.beds, 5) === b.beds;
      pg.text(b.beds >= 5 ? "5+ bed" : `${b.beds} bed`, LX, y + 6, 11.5, { color: INK, font: mine ? semi : reg });
      const bw = Math.max(4, (b.rent!.median / maxRent) * barMax);
      pg.rect(barX, y, bw, 22, mine ? TERRA : CLAY);
      pg.text(`${gbp(b.rent!.median)}`, barX + bw + 10, y + 6, 11.5, { color: INK, font: mine ? semi : reg });
      pg.text(`${b.n} ${b.n === 1 ? "home" : "homes"}`, barX + bw + 10 + pg.w(gbp(b.rent!.median), 11.5, mine ? semi : reg) + 8, y + 6, 9, { color: MUTED });
    });

    /* How long homes stay advertised. */
    const RX = M + colW + 48;
    pg.label("How long homes have been advertised", RX, top, MUTED);
    const bands: Array<[string, number]> = [
      ["Under 2 weeks", s.bands.newIn14],
      ["2 to 4 weeks", s.bands.days15to28],
      ["1 to 3 months", s.bands.days29to84],
      ["Over 3 months", s.bands.over84],
    ];
    const maxBand = Math.max(1, ...bands.map(([, n]) => n));
    const bx = RX + 104;
    const bMax = colW - 104 - 50;
    bands.forEach(([l, n], i) => {
      const y = top - 30 - i * rowH;
      pg.text(l, RX, y + 6, 11.5, { color: INK });
      const bw = Math.max(n ? 4 : 0, (n / maxBand) * bMax);
      if (bw) pg.rect(bx, y, bw, 22, OLIVE);
      pg.text(String(n), bx + bw + 10, y + 6, 11.5, { color: INK });
    });
    const quick = s.bands.newIn14 + s.bands.days15to28;
    const dated = quick + s.bands.days29to84 + s.bands.over84;
    if (dated) {
      pg.para(
        `${Math.round((quick / dated) * 100)}% of what is advertised went up in the last four weeks. ${s.letAgreed} of the ${s.advertised} are already let agreed.`,
        RX, top - 30 - 4 * rowH + 8, 10, colW, { color: MUTED, lead: 14 }
      );
    }

    pg.para(
      `Read from the homes advertised to let on the property portals in ${area} on ${made}. These are asking rents, not achieved rents, and this is a guide, not a valuation.`,
      M, BAND + 22, 8, W - M * 2, { color: MUTED, lead: 11 }
    );

    /* The next step, on brown. */
    pg.rect(0, 0, W, BAND, BROWN);
    pg.text("Next Step: a Free Market Appraisal", M, BAND - 46, 18, { color: WHITE });
    pg.para(
      "This is a desk guide from what is advertised today. A visit lets us see your home and give you a firm figure, with how we would market and let it.",
      M, BAND - 70, 10.5, 400, { color: LINEN, lead: 15 }
    );
    const ax = W - M - 250;
    pg.text(r.agent.name, ax, BAND - 46, 14, { color: WHITE });
    let ay = BAND - 64;
    if (r.agent.title) { pg.text(r.agent.title, ax, ay, 9.5, { color: LINEN }); ay -= 18; }
    if (r.agent.phone) { pg.text(r.agent.phone, ax, ay, 10.5, { color: WHITE }); ay -= 16; }
    if (r.agent.email) pg.text(r.agent.email, ax, ay, 10.5, { color: WHITE });
  }

  return pdf.save();
}

/** A market report is titled by the place ("Duston, Northampton"), with the postcode area under it. */
function marketTitle(r: QuickReport): [string, string] {
  const s = r.scope;
  const under = s.level === "sector" ? `The ${s.area} postcode area` : `The ${s.area} postcode district`;
  const pc = r.ask.postcode.toUpperCase();
  const place = clean(r.ask.address)
    .replace(/,?\s*(UK|United Kingdom)$/i, "")
    .split(",")
    .slice(1)
    .map((x) => x.replace(new RegExp(pc.replace(" ", "\\s*"), "i"), "").trim())
    .filter(Boolean)
    .join(", ");
  return place ? [place, under] : [s.area, "and the streets around it"];
}

export function quickReportFilename(r: QuickReport): string {
  const kind = r.ask.kind === "rental" ? "Rental Report" : "Market Report";
  const where = (r.ask.kind === "rental" ? splitAddress(r.ask.address || r.ask.postcode, r.ask.postcode)[0] : r.scope.area).replace(/[^\w\s-]/g, "").trim();
  return `${kind} - ${where || r.ask.postcode}.pdf`;
}
