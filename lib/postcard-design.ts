/**
 * Postcard designs: layers on a card, and the few rules that stay ours.
 *
 * ── What changed, 8 Sep 2026 ──────────────────────────────────────────────
 *
 * This began as a fixed layout with editable words. James asked for more:
 * "allow me to move these things around, adjust it, use the brand fonts...
 * almost like a mini Canva". So a design is now a list of LAYERS, each with
 * a position in millimetres, a size, a font and a colour, and the studio
 * lets you drag them.
 *
 * ── What is still not on offer, and why ───────────────────────────────────
 *
 * Three things stay locked, because they are not taste:
 *
 *   1. THE TRIM. Nothing readable may sit within 5mm of an edge. Print cuts
 *      within a millimetre or two of where it says, and type on the crop
 *      line is four hundred ruined cards.
 *   2. THE ADDRESS ZONE. Royal Mail reads the lower right of the back. The
 *      address block lives there, is drawn by the card, and nothing else may
 *      be dropped on top of it.
 *   3. THE OPT-OUT. Unsolicited mail carries a way out. It is drawn by the
 *      card, not typed by whoever is in a hurry.
 *
 * Everything else - where the headline sits, how big, which of the brand
 * faces, what colour - is theirs.
 */

export const CARD = { w: 148, h: 105, safe: 5 } as const;

/** Royal Mail's half of the back, in mm. Nothing of ours goes here. */
export const ADDRESS_ZONE = { x: 76, y: 28, w: 66, h: 44 } as const;

/* ── the brand's faces ──────────────────────────────────────────────────── */

export type FontKey = "playfair" | "lora" | "shantell" | "script" | "montserrat";

export const FONTS: { key: FontKey; name: string; css: string; note: string }[] = [
  { key: "playfair", name: "Playfair", css: "var(--font-postcard), Georgia, serif", note: "The high-contrast serif from the mock-up" },
  { key: "lora", name: "Lora", css: "var(--font-display), Georgia, serif", note: "The brand's supporting serif" },
  { key: "shantell", name: "Shantell", css: "var(--font-shantell), cursive", note: "The OS hand, used for our own headings" },
  { key: "script", name: "Ms Madi", css: "var(--font-script), cursive", note: "The flourish. A word or two, never a sentence" },
  { key: "montserrat", name: "Montserrat", css: "var(--font-montserrat), system-ui, sans-serif", note: "Body copy" },
];

export type ColourKey = "ink" | "muted" | "clay" | "sage" | "paper";

export const COLOURS: { key: ColourKey; name: string; hex: string }[] = [
  { key: "ink", name: "Ink", hex: "#101014" },
  { key: "muted", name: "Muted", hex: "#6b6b70" },
  { key: "clay", name: "Clay", hex: "#c76f4f" },
  { key: "sage", name: "Sage", hex: "#7d9075" },
  { key: "paper", name: "Paper", hex: "#fbfaf7" },
];

export type IllustrationKey = "landlord-street" | "landlord-feet-up" | "settled-tenant";

/**
 * Two copies of every picture: a light one the studio draws, and the
 * full-resolution original the printer gets. The screen copies are WebP at
 * 900px and about 100KB; the originals are two megabytes of PNG, which is
 * right for print and wrong for a page that shows two of them.
 */
export const ILLUSTRATIONS: { key: IllustrationKey; name: string; src: string; print: string }[] = [
  { key: "landlord-street", name: "Landlord on the street", src: "/brand/postcard/landlord-street.webp", print: "/brand/postcard/print/landlord-street.png" },
  { key: "landlord-feet-up", name: "Landlord, feet up", src: "/brand/postcard/landlord-feet-up.webp", print: "/brand/postcard/print/landlord-feet-up.png" },
  { key: "settled-tenant", name: "Tenant, settled in", src: "/brand/sitting-chair.png", print: "/brand/sitting-chair.png" },
];

/* ── layers ─────────────────────────────────────────────────────────────── */

export type LayerKind = "text" | "wordmark" | "image" | "rule" | "qr";
export type Side = "front" | "back";

export interface Layer {
  id: string;
  kind: LayerKind;
  side: Side;
  /** Millimetres from the top left of the card. */
  x: number;
  y: number;
  /** Millimetres. Text wraps at this width; an image is drawn at it. */
  w: number;
  text?: string;
  font?: FontKey;
  /** Millimetres. The same unit as everything else on the card. */
  size?: number;
  italic?: boolean;
  bold?: boolean;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  colour?: ColourKey;
  src?: IllustrationKey;
  url?: string;
  /** May this one run off the card? Pictures yes, words no. */
  bleeds?: boolean;
}

export interface PostcardDesign {
  id: string;
  name: string;
  /** The card's ground. */
  paper: string;
  layers: Layer[];
}

/**
 * What Bond fills in per landlord. The names match what the send passes to
 * Stannp as recipient[*], so a field here is a field there.
 */
export const MERGE_FIELDS: { key: string; label: string; example: string }[] = [
  { key: "firstname", label: "Their first name", example: "Margaret" },
  { key: "lastname", label: "Their surname", example: "Hollis" },
  { key: "property", label: "The property we are writing about", example: "18 Wellfield Terrace" },
  { key: "anniversary", label: "When the tenancy comes round", example: "March" },
  { key: "agent", label: "Who is writing", example: "Robyn Ashworth" },
  { key: "phone", label: "Their number", example: "0117 496 0142" },
];

export function withExample(text: string): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => MERGE_FIELDS.find((f) => f.key === key)?.example ?? whole);
}

/* ── the stock cards ────────────────────────────────────────────────────── */

const L = (l: Layer): Layer => l;

const backOf = (accent: ColourKey, title: string, body: string, cta: string, qrLabel: string): Layer[] => [
  L({ id: "b-title", kind: "text", side: "back", x: 7, y: 24, w: 64, text: title, font: "playfair", size: 4.6, bold: true, colour: "ink", lineHeight: 1.15 }),
  L({ id: "b-rule", kind: "rule", side: "back", x: 7, y: 32, w: 14, colour: accent }),
  L({ id: "b-body", kind: "text", side: "back", x: 7, y: 37, w: 64, text: body, font: "montserrat", size: 3.05, colour: "muted", lineHeight: 1.52 }),
  L({ id: "b-cta", kind: "text", side: "back", x: 7, y: 79, w: 64, text: cta, font: "montserrat", size: 3.05, bold: true, colour: "ink", lineHeight: 1.35 }),
  L({ id: "b-sign", kind: "text", side: "back", x: 7, y: 84, w: 64, text: "{agent}, The Letting Experts", font: "montserrat", size: 2.7, colour: "muted", lineHeight: 1.35 }),
  L({ id: "b-qr", kind: "qr", side: "back", x: 124, y: 78, w: 17, url: "https://thelettingexperts.co.uk" }),
  L({ id: "b-qrlabel", kind: "text", side: "back", x: 86, y: 81, w: 35, text: qrLabel, font: "montserrat", size: 2.5, colour: "muted", align: "right", lineHeight: 1.3 }),
];

export const STOCK_DESIGNS: PostcardDesign[] = [
  {
    id: "could-do-more",
    name: "Your property could do more",
    paper: "#fbfaf7",
    layers: [
      L({ id: "art", kind: "image", side: "front", x: 56, y: 26, w: 122, src: "landlord-street", bleeds: true }),
      L({ id: "mark", kind: "wordmark", side: "front", x: 9, y: 8, w: 40 }),
      L({ id: "h1", kind: "text", side: "front", x: 9, y: 42, w: 70, text: "Your property", font: "playfair", size: 10, bold: true, colour: "ink", lineHeight: 1.08 }),
      L({ id: "h2", kind: "text", side: "front", x: 9, y: 53, w: 70, text: "could do more.", font: "playfair", size: 10, bold: true, italic: true, colour: "ink", lineHeight: 1.08 }),
      L({ id: "swoosh", kind: "rule", side: "front", x: 9, y: 65, w: 33, colour: "clay" }),
      ...backOf(
        "clay",
        "Your property could do more.",
        "Hello {firstname},\n\nWe look after homes on your street, and we think {property} could be working harder than it is.\n\nA ten-minute call will tell you where the rent should sit. No charge, and nothing to sign.",
        "Call {phone} for a free rent check",
        "Scan to book a free rent check"
      ),
    ],
  },
  {
    id: "renewal-coming",
    name: "The anniversary card",
    paper: "#fbfaf7",
    layers: [
      L({ id: "art", kind: "image", side: "front", x: 66, y: 22, w: 96, src: "settled-tenant", bleeds: true }),
      L({ id: "mark", kind: "wordmark", side: "front", x: 9, y: 8, w: 40 }),
      L({ id: "h1", kind: "text", side: "front", x: 9, y: 44, w: 66, text: "Your tenancy", font: "playfair", size: 9.4, bold: true, colour: "ink", lineHeight: 1.08 }),
      L({ id: "h2", kind: "text", side: "front", x: 9, y: 54, w: 66, text: "comes up soon.", font: "playfair", size: 9.4, bold: true, italic: true, colour: "ink", lineHeight: 1.08 }),
      L({ id: "swoosh", kind: "rule", side: "front", x: 9, y: 65, w: 33, colour: "sage" }),
      ...backOf(
        "sage",
        "Your tenancy comes up soon.",
        "Hello {firstname},\n\nThe tenancy at {property} reaches its anniversary around {anniversary}.\n\nThat is when most landlords look again at the rent, and at the service they are getting.",
        "Call {phone} for a second opinion",
        "Scan to book a call"
      ),
    ],
  },
];

/* ── the rules that stay ours ───────────────────────────────────────────── */

export interface DesignFault {
  layerId: string | null;
  says: string;
}

const overlaps = (l: Layer, z: { x: number; y: number; w: number; h: number }, hMm: number) =>
  l.x < z.x + z.w && l.x + l.w > z.x && l.y < z.y + z.h && l.y + hMm > z.y;

/** Roughly how tall a layer runs. Wrap is estimated, which is enough to catch a card running off the edge. */
export function heightOf(l: Layer): number {
  if (l.kind === "qr") return l.w;
  if (l.kind === "rule") return 1;
  if (l.kind === "wordmark") return 13;
  const size = l.size ?? 3;
  const perLine = Math.max(1, Math.floor(l.w / (size * 0.52)));
  const lines = (l.text ?? "").split("\n").reduce((a, para) => a + Math.max(1, Math.ceil(para.length / perLine)), 0);
  return lines * size * (l.lineHeight ?? 1.4);
}

export function nameOf(l: Layer): string {
  if (l.kind === "wordmark") return "The wordmark";
  if (l.kind === "image") return "The picture";
  if (l.kind === "rule") return "The stroke";
  if (l.kind === "qr") return "The QR code";
  const t = (l.text ?? "").replace(/\s+/g, " ").trim();
  return t.length > 24 ? `"${t.slice(0, 24)}…"` : `"${t}"`;
}

export function faultsIn(d: PostcardDesign): DesignFault[] {
  const out: DesignFault[] = [];
  for (const l of d.layers) {
    if (l.kind === "text" && !(l.text ?? "").trim()) {
      out.push({ layerId: l.id, says: "An empty text box. Give it words or take it off." });
      continue;
    }
    if (l.bleeds) continue;
    const h = heightOf(l);
    if (l.x < CARD.safe || l.y < CARD.safe || l.x + l.w > CARD.w - CARD.safe || l.y + h > CARD.h - CARD.safe) {
      out.push({ layerId: l.id, says: `${nameOf(l)} is too close to the edge. Nothing readable within ${CARD.safe}mm of the trim.` });
    }
    if (l.side === "back" && overlaps(l, ADDRESS_ZONE, h)) {
      out.push({ layerId: l.id, says: `${nameOf(l)} is over the address block. That part of the back belongs to the sorting machine.` });
    }
  }
  return out;
}

export const isSendable = (d: PostcardDesign) => faultsIn(d).length === 0;

export const fontFor = (k: FontKey | undefined) => FONTS.find((f) => f.key === k) ?? FONTS[0];
export const colourFor = (k: ColourKey | undefined) => COLOURS.find((c) => c.key === k) ?? COLOURS[0];
export const illustrationFor = (k: IllustrationKey | undefined) => ILLUSTRATIONS.find((i) => i.key === k) ?? ILLUSTRATIONS[0];

/* ── reading what is already stored ─────────────────────────────────────── */

/** A design in whatever shape it was saved, brought up to the current one. */
export function normalise(raw: unknown): PostcardDesign | null {
  const d = raw as Partial<PostcardDesign> & { id?: string };
  if (!d?.id) return null;
  if (Array.isArray(d.layers) && d.layers.length) {
    return { id: d.id, name: d.name ?? "Untitled", paper: d.paper ?? "#fbfaf7", layers: d.layers };
  }
  /* The first shape: fixed slots. Rebuilt as the stock layout carrying its
     own words, so nothing anybody wrote is lost when the model grows. */
  const stock = STOCK_DESIGNS.find((s) => s.id === d.id) ?? STOCK_DESIGNS[0];
  const old = raw as { headline?: string[]; body?: string; cta?: string; signoff?: string; qrUrl?: string; qrLabel?: string; name?: string };
  const put = (id: string, text: string | undefined) => (l: Layer) => (l.id === id && text ? { ...l, text } : l);
  let layers = stock.layers.map((l) => ({ ...l }));
  layers = layers.map(put("h1", old.headline?.[0]));
  layers = layers.map(put("h2", old.headline?.[1]));
  layers = layers.map(put("b-title", old.headline?.filter(Boolean).join(" ")));
  layers = layers.map(put("b-body", old.body));
  layers = layers.map(put("b-cta", old.cta));
  layers = layers.map(put("b-sign", old.signoff));
  layers = layers.map(put("b-qrlabel", old.qrLabel));
  layers = layers.map((l) => (l.id === "b-qr" && old.qrUrl != null ? { ...l, url: old.qrUrl } : l));
  return { id: d.id, name: old.name ?? stock.name, paper: "#fbfaf7", layers };
}
