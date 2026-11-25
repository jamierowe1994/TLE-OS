import "server-only";
import { MAKER_NAMES, type MakerKey, type MerchArtwork, type MerchDelivery } from "@/lib/merch-catalogue";

/**
 * The maker the merch shop orders from: Gelato (James, 25 Nov 2026, "switch
 * it"), for the clothing and the mugs alike. Docs: dashboard.gelato.com/docs
 * (they open in a browser; plain fetches are refused).
 *
 *   POST /v4/orders        one order, our reference on it
 *   GET  /v4/orders/{id}   where it has got to, the courier and tracking link
 *
 * Gelato also calls us when an order moves (/api/merch/makers/gelato). That
 * call only says "look again": we always ask Gelato itself, since its calls
 * carry no signature. The daily check is the backstop.
 *
 * Nothing reaches Gelato until an owner presses Send to Maker on an order.
 *
 * Safety: until MERCH_LIVE=1 is set on the server, every order goes to Gelato
 * as a draft, which Gelato never makes, ships or charges for (it can be looked
 * at, and deleted, in Gelato's dashboard). MERCH_MAKERS=standin (local only)
 * swaps Gelato for a pretend maker so the whole flow can be driven with
 * nothing sent at all.
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
  /** When the maker expects it to arrive. */
  dispatchBy: string | null;
  issues: string[];
  photos: string[];
}

export class MakerError extends Error {}

const live = () => process.env.MERCH_LIVE === "1";
const standin = () => process.env.MERCH_MAKERS === "standin";

export function makerMode(key: MakerKey): MakerMode | null {
  if (standin()) return "standin";
  if (key === "gelato") return process.env.GELATO_API_KEY ? (live() ? "live" : "test") : null;
  return null;
}

/** Why a maker can't be sent to, in words for the Orders page; null when it can. */
export function makerBlocked(key: MakerKey): string | null {
  if (makerMode(key)) return null;
  return `${MAKER_NAMES[key]} is not connected yet.`;
}

/* ----------------------------------------------------------------------- Gelato */

const GELATO = "https://order.gelatoapis.com/v4/orders";

type GelatoOrder = {
  id?: string;
  orderType?: string;
  fulfillmentStatus?: string;
  connectedOrderIds?: string[];
  items?: { fulfillmentStatus?: string; previews?: { url?: string }[] }[];
  shipment?: {
    shipmentMethodName?: string;
    maxDeliveryDate?: string;
    packages?: { trackingUrl?: string | null; trackingCode?: string | null }[];
  } | null;
  receipts?: { currency?: string; totalInclVat?: number | string }[];
};

async function gelato(path: string, init: RequestInit = {}): Promise<GelatoOrder> {
  const headers: Record<string, string> = { "X-API-KEY": process.env.GELATO_API_KEY ?? "", accept: "application/json" };
  if (init.body) headers["content-type"] = "application/json";
  const r = await fetch(`${GELATO}${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => ({}))) as GelatoOrder & { message?: string; code?: string; details?: { message?: string }[] };
  if (!r.ok) {
    if (r.status === 401) throw new MakerError("Gelato did not accept the API key. Check GELATO_API_KEY on the server.");
    const why = [j.message, ...(Array.isArray(j.details) ? j.details.map((d) => d?.message) : [])].filter(Boolean).join(" ");
    throw new MakerError(`Gelato said: ${why || (r.status === 401 ? "the API key was not accepted." : `HTTP ${r.status}`)}`);
  }
  return j;
}

/* Gelato's statuses, from "How orders work". */
function gelatoStage(s: string): MakerStage {
  switch (s) {
    case "in_production":
    case "printed":
      return "making";
    case "on_hold":
    case "not_connected":
    case "pending_personalization":
    case "returned":
      return "on_hold";
    case "shipped":
    case "in_transit":
      return "dispatched";
    case "delivered":
      return "delivered";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      /* created, uploading, passed, draft, pending_approval, digitizing */
      return "sent";
  }
}

const STAGE_ORDER: MakerStage[] = ["failed", "on_hold", "sent", "making", "dispatched", "delivered", "cancelled"];

function cost(o: GelatoOrder): string | null {
  const r = o.receipts?.find((x) => x.totalInclVat != null);
  if (!r) return null;
  const n = Number(r.totalInclVat);
  /* A draft carries a receipt of 0: no cost yet, not a free order. */
  if (!Number.isFinite(n) || n <= 0) return null;
  return r.currency === "GBP" || !r.currency ? `£${n.toFixed(2)}` : `${n.toFixed(2)} ${r.currency}`;
}

/* Gelato fetches the artwork itself, so it needs an address it can reach. A
   laptop can't be reached: MERCH_FILE_ORIGIN (local testing only) points it at
   the live OS's copy of the same files instead. */
const fileOrigin = (origin: string) => (process.env.MERCH_FILE_ORIGIN || origin).replace(/\/+$/, "");

/** Gelato's names are 25 characters at most and address lines 35. */
function names(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : parts[0];
  return { firstName: parts.join(" ").slice(0, 25), lastName: last.slice(0, 25) };
}

async function gelatoSend(o: MakerOrderIn, test: boolean): Promise<MakerSent> {
  const d = o.delivery;
  const order = await gelato("", {
    method: "POST",
    body: JSON.stringify({
      /* A draft is never made, shipped or charged until it is turned into an order. */
      orderType: test ? "draft" : "order",
      orderReferenceId: o.ref,
      customerReferenceId: o.email || o.ref,
      currency: "GBP",
      items: o.items.map((i, n) => ({
        itemReferenceId: `${o.ref}-${n + 1}`,
        productUid: i.sku,
        quantity: i.qty,
        adjustProductUidByFileTypes: i.artwork.some((a) => a.type === "embroidery") || undefined,
        files: i.artwork.map((a) => ({ type: a.place, url: new URL(a.file, fileOrigin(o.origin)).toString(), threadColors: a.threads })),
      })),
      shipmentMethodUid: "standard",
      shippingAddress: {
        ...names(d.name),
        companyName: "The Letting Experts",
        addressLine1: d.line1.slice(0, 35),
        addressLine2: d.line2.slice(0, 35) || undefined,
        city: d.town,
        postCode: d.postcode,
        country: "GB",
        email: o.email,
        phone: d.phone || undefined,
      },
      returnAddress: { companyName: "The Letting Experts" },
      metadata: o.notes ? [{ key: "note", value: o.notes.slice(0, 100) }] : undefined,
    }),
  });
  if (!order.id) throw new MakerError("Gelato took the order but gave no order number back. Check Gelato's dashboard before sending again.");
  /* Gelato may split an order across its hubs; each part has its own number and our reference. */
  const ids = [order.id, ...(order.connectedOrderIds ?? []).filter((x) => x && x !== order.id)];
  return {
    makerRef: ids.join(","),
    stage: gelatoStage(order.fulfillmentStatus ?? ""),
    cost: cost(order),
    message: test ? "Sent as a draft: Gelato will not make it." : "",
  };
}

async function gelatoCheck(makerRef: string): Promise<MakerCheck> {
  const ids = makerRef.split(",").filter(Boolean);
  const orders = await Promise.all(ids.map((id) => gelato(`/${encodeURIComponent(id)}`)));
  const stages = orders.map((x) => gelatoStage(x.fulfillmentStatus ?? ""));
  const stage = stages.reduce((a, b) => (STAGE_ORDER.indexOf(b) < STAGE_ORDER.indexOf(a) ? b : a), stages[0] ?? "sent");
  const pkgs = orders.flatMap((x) => x.shipment?.packages ?? []);
  const shipped = orders.find((x) => (x.shipment?.packages ?? []).some((p) => p.trackingUrl)) ?? orders[0];
  const costs = orders.map(cost).filter(Boolean);
  const said = [...new Set(orders.map((x) => (x.orderType === "draft" ? "draft" : x.fulfillmentStatus ?? "")))].join(", ");
  return {
    stage,
    said: said.replace(/_/g, " "),
    carrier: shipped?.shipment?.shipmentMethodName ?? null,
    tracking: pkgs.find((p) => p.trackingUrl)?.trackingUrl ?? null,
    cost: costs.length === 1 ? costs[0] : costs.length ? costs.join(" + ") : null,
    dispatchBy: orders.map((x) => x.shipment?.maxDeliveryDate).filter(Boolean).sort().pop() ?? null,
    issues: stage === "on_hold" || stage === "failed" ? [`Gelato has it as ${said.replace(/_/g, " ")}. Open the order in Gelato's dashboard to see why.`] : [],
    photos: orders.flatMap((x) => (x.items ?? []).flatMap((i) => (i.previews ?? []).map((p) => p.url ?? ""))).filter(Boolean),
  };
}

/* ---------------------------------------------------------------- the stand-in */

/* Local only. Making for a minute after it is sent, then on its way. */
function standinCheck(sentAt: string): MakerCheck {
  const mins = (Date.now() - new Date(sentAt).getTime()) / 60_000;
  const gone = mins >= 1;
  return {
    stage: gone ? "dispatched" : "making",
    said: gone ? "shipped (stand-in)" : "in production (stand-in)",
    carrier: gone ? "Royal Mail Tracked 48" : null,
    tracking: gone ? "https://www.royalmail.com/track-your-item" : null,
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
  const out = await gelatoSend(o, mode !== "live");
  return { ...out, mode };
}

export async function checkMaker(key: MakerKey, job: { ref: string; makerRef: string; mode: MakerMode; sentAt: string }): Promise<MakerCheck> {
  if (job.mode === "standin") return standinCheck(job.sentAt);
  if (!makerMode(key)) throw new MakerError(makerBlocked(key) ?? "Not connected.");
  return gelatoCheck(job.makerRef);
}

/** A maker's part is finished with once it has gone out (or never will): no more asking. */
export const stageDone = (s: MakerStage) => s === "dispatched" || s === "delivered" || s === "cancelled" || s === "failed";
