import "server-only";
import { MAKER_NAMES, type MakerKey, type MerchArtwork, type MerchDelivery } from "@/lib/merch-catalogue";

/**
 * The two makers the merch shop orders from (James, 25 Nov 2026: "go with those").
 *
 *   Clothes2Order  clothing, embroidered in Manchester. One POST per order,
 *                  no webhooks: we ask how each order is doing once a day
 *                  (their dispatch is by 8pm), and stop once it is Dispatched.
 *                  Docs: docs.clothes2order.com (a Postman page).
 *   Prodigi        mugs and small things, made in the UK. v5 API; a
 *                  sandbox_ key makes nothing and charges nothing.
 *                  Docs: prodigi.com/print-api/docs (openapi.yml).
 *
 * Nothing reaches a maker until an owner presses Send to Maker on an order.
 *
 * Safety: until MERCH_LIVE=1 is set on the server, Clothes2Order is sent the
 * Test-Mode header and a Prodigi live_ key is refused, so a test can never
 * become a real, charged order. MERCH_MAKERS=standin (local only) swaps both
 * for a pretend maker so the whole flow can be driven with nothing sent.
 */

export type MakerMode = "standin" | "test" | "live";

/** Where a maker's part of an order has got to, in our own words. */
export type MakerStage = "sent" | "making" | "on_hold" | "dispatched" | "delivered" | "cancelled" | "failed";

export interface MakerItem {
  sku: string;
  qty: number;
  artwork: MerchArtwork[];
}

export interface MakerOrderIn {
  /** Our reference, unique per order and maker. */
  ref: string;
  delivery: MerchDelivery;
  email: string;
  notes: string;
  items: MakerItem[];
  /** The OS's own address, so the maker can fetch the artwork files. */
  origin: string;
}

export interface MakerSent {
  makerRef: string;
  stage: MakerStage;
  cost: string | null;
  message: string;
}

export interface MakerCheck {
  stage: MakerStage;
  /** The maker's own word for it, kept for the Orders page. */
  said: string;
  carrier: string | null;
  tracking: string | null;
  cost: string | null;
  dispatchBy: string | null;
  issues: string[];
  photos: string[];
}

export class MakerError extends Error {}

const live = () => process.env.MERCH_LIVE === "1";
const standin = () => process.env.MERCH_MAKERS === "standin";

export function makerMode(key: MakerKey): MakerMode | null {
  if (standin()) return "standin";
  if (key === "c2o") return process.env.C2O_API_KEY ? (live() ? "live" : "test") : null;
  const k = process.env.PRODIGI_API_KEY ?? "";
  if (!k) return null;
  return k.startsWith("live_") ? (live() ? "live" : null) : "test";
}

/** Why a maker can't be sent to, in words for the Orders page; null when it can. */
export function makerBlocked(key: MakerKey): string | null {
  if (makerMode(key)) return null;
  if (key === "prodigi" && (process.env.PRODIGI_API_KEY ?? "").startsWith("live_")) {
    return "Prodigi has a live key but live orders are not switched on yet.";
  }
  return `${MAKER_NAMES[key]} is not connected yet.`;
}

const asList = <T,>(v: T | T[] | null | undefined): T[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

/* ---------------------------------------------------------------- Clothes2Order */

const C2O = "https://order.clothes2order.com/api/v1/orders";

type C2OReply = {
  status?: { code?: string; msg?: string };
  order_details?: {
    order_id?: string;
    c2o_order_id?: string;
    net_order_value?: string;
    est_dispatch_date?: string;
    order_status?: string;
    shipped_by?: string;
    tracking_link?: string;
    progress_images?: { progress_image?: string | string[] };
    order_issues?: { issue?: { reason?: string } | { reason?: string }[] };
  };
  warnings?: { warning?: string | string[] };
};

/* A test order is asked about in test mode too, even after live orders are switched on. */
async function c2oPost(url: string, body: unknown, test: boolean): Promise<C2OReply> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (test) headers["Test-Mode"] = "true";
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => ({}))) as C2OReply;
  if (!r.ok || j.status?.code !== "OK") throw new MakerError(`Clothes2Order said: ${j.status?.msg || `HTTP ${r.status}`}`);
  return j;
}

function c2oStage(s: string): MakerStage {
  const v = s.toLowerCase();
  if (v.includes("dispatch")) return "dispatched";
  if (v.includes("hold")) return "on_hold";
  if (v.includes("cancel")) return "cancelled";
  return "making";
}

async function c2oSend(o: MakerOrderIn, test: boolean): Promise<MakerSent> {
  const d = o.delivery;
  const j = await c2oPost(C2O, {
    api_key: process.env.C2O_API_KEY,
    order: { order_id: o.ref, order_notes: o.notes.slice(0, 500), delivery_method: "standard" },
    customer: { name: d.name, email: o.email, telephone: d.phone },
    address: {
      delivery_name: d.name,
      company_name: "The Letting Experts",
      address_line_1: d.line1,
      address_line_2: d.line2,
      city: d.town,
      postcode: d.postcode,
      country: "United Kingdom",
    },
    products: {
      product: o.items.map((i) => ({
        sku: i.sku,
        quantity: String(i.qty),
        logos: {
          logo: i.artwork.map((a) => ({
            unique_id: a.id,
            file: new URL(a.file, o.origin).toString(),
            position: a.place,
            width: String(a.widthCm ?? 9),
            type: a.type,
          })),
        },
      })),
    },
  }, test);
  const od = j.order_details ?? {};
  const warn = asList(j.warnings?.warning).join(" ");
  return {
    makerRef: String(od.order_id ?? od.c2o_order_id ?? ""),
    stage: "sent",
    cost: od.net_order_value ?? null,
    message: [j.status?.msg, warn].filter(Boolean).join(" "),
  };
}

async function c2oCheck(ref: string, test: boolean): Promise<MakerCheck> {
  const j = await c2oPost(`${C2O}/fetch`, { api_key: process.env.C2O_API_KEY, order: { your_order_id: ref } }, test);
  const od = j.order_details ?? {};
  const said = od.order_status ?? "";
  return {
    stage: c2oStage(said),
    said,
    carrier: od.shipped_by || null,
    tracking: od.tracking_link || null,
    cost: od.net_order_value || null,
    dispatchBy: od.est_dispatch_date || null,
    issues: asList(od.order_issues?.issue).map((i) => i.reason ?? "").filter(Boolean),
    photos: asList(od.progress_images?.progress_image).filter(Boolean),
  };
}

/* ---------------------------------------------------------------------- Prodigi */

const PRODIGI = "https://api.prodigi.com/v5";

type ProdigiOrder = {
  id?: string;
  status?: string;
  totals?: { total?: { amount?: string } };
  shipments?: { carrier?: string; trackingUrl?: string; status?: string }[];
  issues?: { description?: string; errorCode?: string }[];
};

async function prodigi(path: string, init: RequestInit & { idem?: string } = {}): Promise<ProdigiOrder> {
  const headers: Record<string, string> = { "X-API-Key": process.env.PRODIGI_API_KEY ?? "", accept: "application/json" };
  if (init.body) headers["content-type"] = "application/json";
  if (init.idem) headers["Idempotency-Key"] = init.idem;
  const r = await fetch(`${PRODIGI}${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => ({}))) as { data?: ProdigiOrder; message?: string; issues?: { message?: string }[] };
  if (!r.ok) {
    const why = [j.message, ...(j.issues ?? []).map((i) => i.message)].filter(Boolean).join(" ");
    throw new MakerError(`Prodigi said: ${why || `HTTP ${r.status}`}`);
  }
  return j.data ?? {};
}

function prodigiStage(s: string): MakerStage {
  switch (s) {
    case "in_production":
      return "making";
    case "on_hold":
    case "paused":
      return "on_hold";
    case "partially_shipped":
    case "shipped":
      return "dispatched";
    case "completed":
      return "delivered";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return "sent";
  }
}

async function prodigiSend(o: MakerOrderIn): Promise<MakerSent> {
  const d = o.delivery;
  const order = await prodigi("/orders", {
    method: "POST",
    idem: o.ref,
    body: JSON.stringify({
      merchantReference: o.ref,
      shippingMethod: "standard",
      submit: true,
      recipient: {
        name: d.name,
        email: o.email || undefined,
        phoneNumber: d.phone || undefined,
        address: { line1: d.line1, line2: d.line2 || undefined, townOrCity: d.town, postalOrZipCode: d.postcode, countryCode: "GB" },
      },
      items: o.items.map((i) => ({
        sku: i.sku,
        quantity: i.qty,
        assets: i.artwork.map((a) => ({ printArea: a.place, url: new URL(a.file, o.origin).toString() })),
      })),
    }),
  });
  return { makerRef: order.id ?? "", stage: prodigiStage(order.status ?? ""), cost: order.totals?.total?.amount ?? null, message: "" };
}

async function prodigiCheck(makerRef: string): Promise<MakerCheck> {
  const o = await prodigi(`/orders/${encodeURIComponent(makerRef)}`);
  const ship = (o.shipments ?? []).find((s) => s.trackingUrl) ?? o.shipments?.[0];
  return {
    stage: prodigiStage(o.status ?? ""),
    said: o.status ?? "",
    carrier: ship?.carrier ?? null,
    tracking: ship?.trackingUrl ?? null,
    cost: o.totals?.total?.amount ?? null,
    dispatchBy: null,
    issues: (o.issues ?? []).map((i) => i.description || i.errorCode || "").filter(Boolean),
    photos: [],
  };
}

/* ---------------------------------------------------------------- the stand-in */

/* Local only. Making for a minute after it is sent, then on its way. */
function standinCheck(sentAt: string): MakerCheck {
  const mins = (Date.now() - new Date(sentAt).getTime()) / 60_000;
  const gone = mins >= 1;
  return {
    stage: gone ? "dispatched" : "making",
    said: gone ? "Dispatched (stand-in)" : "Processing Order (stand-in)",
    carrier: gone ? "DPD" : null,
    tracking: gone ? "https://track.dpd.co.uk/" : null,
    cost: null,
    dispatchBy: null,
    issues: [],
    photos: [],
  };
}

/* ---------------------------------------------------------------- one door in */

export async function sendToMaker(key: MakerKey, o: MakerOrderIn): Promise<MakerSent & { mode: MakerMode }> {
  const mode = makerMode(key);
  if (!mode) throw new MakerError(makerBlocked(key) ?? "Not connected.");
  if (mode === "standin") return { makerRef: `standin-${o.ref}`, stage: "sent", cost: null, message: "Stand-in: nothing was sent.", mode };
  const out = key === "c2o" ? await c2oSend(o, mode !== "live") : await prodigiSend(o);
  return { ...out, mode };
}

export async function checkMaker(key: MakerKey, job: { ref: string; makerRef: string; mode: MakerMode; sentAt: string }): Promise<MakerCheck> {
  if (job.mode === "standin") return standinCheck(job.sentAt);
  if (!makerMode(key)) throw new MakerError(makerBlocked(key) ?? "Not connected.");
  return key === "c2o" ? c2oCheck(job.ref, job.mode !== "live") : prodigiCheck(job.makerRef);
}

/** A maker's part is finished with once it has gone out (or never will): no more asking. */
export const stageDone = (s: MakerStage) => s === "dispatched" || s === "delivered" || s === "cancelled" || s === "failed";
