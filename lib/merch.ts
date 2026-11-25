import "server-only";
import { q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";
import { emailShell } from "@/lib/email/shell";
import { MAKER_NAMES, MERCH, skuFor, type MakerKey, type MerchDelivery, type MerchLine } from "@/lib/merch-catalogue";
import { checkMaker, makerBlocked, makerMode, MakerError, sendToMaker, stageDone, type MakerMode, type MakerStage } from "@/lib/merch-makers";
import type { OsUser } from "@/lib/users";

/**
 * Merch orders (James, 24 Nov 2026): Tools > Merch, locked behind the "merch"
 * switch until he releases it.
 *
 * An order is a list of lines, a note and where it goes. Nothing is paid on
 * the page and no price is stored (pricing and who pays are James's calls).
 * James is emailed each one. On the Orders page he presses Send to Maker, and
 * each maker gets its own part (lib/merch-makers): Clothes2Order the clothing,
 * Prodigi the mugs. Once a day the OS asks each maker how its part is doing
 * (checkOpenOrders), and the person who ordered sees "On Its Way" and the
 * courier's tracking link under Your Orders.
 */

export const MERCH_ORDERS_TO = "james@therecruitmentexperts.co.uk";
/* ready/collected stay for kit handed out from stock at an office. */
export const ORDER_STATUSES = ["new", "ordered", "dispatched", "delivered", "ready", "collected", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface MakerJob {
  maker: MakerKey;
  /** Our reference, sent to the maker: the order id and the maker. */
  ref: string;
  makerRef: string;
  mode: MakerMode;
  sentAt: string;
  sentBy: string;
  stage: MakerStage;
  said: string;
  carrier: string | null;
  tracking: string | null;
  cost: string | null;
  dispatchBy: string | null;
  issues: string[];
  photos: string[];
  checkedAt: string | null;
  error: string | null;
  /** Which lines (by index in the order) went in this part. */
  lines: number[];
}

export interface MerchOrder {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  lines: MerchLine[];
  notes: string;
  status: OrderStatus;
  delivery: MerchDelivery | null;
  jobs: MakerJob[];
  createdAt: string;
}

type Row = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  lines: MerchLine[];
  notes: string;
  status: string;
  delivery: Partial<MerchDelivery> | null;
  maker_jobs: MakerJob[] | null;
  created_at: Date | string;
};

const toOrder = (r: Row): MerchOrder => ({
  id: r.id,
  userId: r.user_id,
  userName: r.user_name,
  userEmail: r.user_email,
  lines: Array.isArray(r.lines) ? r.lines : [],
  notes: r.notes,
  status: (ORDER_STATUSES as readonly string[]).includes(r.status) ? (r.status as OrderStatus) : "new",
  delivery: r.delivery && r.delivery.line1 ? (r.delivery as MerchDelivery) : null,
  jobs: Array.isArray(r.maker_jobs) ? r.maker_jobs : [],
  createdAt: new Date(r.created_at).toISOString(),
});

/** Only lines for kit we sell, in a colour and size it comes in, 1 to 10 of each. */
export function cleanLines(raw: unknown): MerchLine[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "Pick something first.";
  if (raw.length > 20) return "That is a lot of kit - split it into two orders.";
  const out: MerchLine[] = [];
  for (const l of raw as Record<string, unknown>[]) {
    const p = MERCH.find((m) => m.key === String(l?.product ?? ""));
    if (!p) return "One of those items is not in the shop any more.";
    const colour = String(l.colour ?? "");
    const size = String(l.size ?? "");
    const qty = Math.round(Number(l.qty));
    if (!p.colours.some((c) => c.name === colour)) return `Pick a colour for ${p.name}.`;
    if (!p.sizes.includes(size)) return `Pick a size for ${p.name}.`;
    if (!Number.isFinite(qty) || qty < 1 || qty > 10) return `Between 1 and 10 of ${p.name}.`;
    out.push({ product: p.key, name: p.name, colour, size, qty });
  }
  return out;
}

const POSTCODE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

/** A UK address the makers can deliver to. */
export function cleanDelivery(raw: unknown): MerchDelivery | string {
  const d = (raw ?? {}) as Record<string, unknown>;
  const t = (k: string, max = 100) => String(d[k] ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const out: MerchDelivery = { name: t("name"), line1: t("line1"), line2: t("line2"), town: t("town", 50), postcode: t("postcode", 10).toUpperCase(), phone: t("phone", 20) };
  if (!out.name) return "Who is it for? Add a name for the delivery.";
  if (!out.line1) return "Add the first line of the delivery address.";
  if (!out.town) return "Add the town for the delivery.";
  if (!POSTCODE.test(out.postcode)) return "That postcode doesn't look right.";
  if (out.postcode.length > 4 && !out.postcode.includes(" ")) out.postcode = `${out.postcode.slice(0, -3)} ${out.postcode.slice(-3)}`;
  return out;
}

export async function placeOrder(me: OsUser, lines: MerchLine[], notes: string, delivery: MerchDelivery): Promise<MerchOrder> {
  const id = `mo_${uid()}`;
  const rows = await q<Row>(
    `INSERT INTO os_merch_orders (id, user_id, user_name, user_email, lines, notes, delivery)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb) RETURNING *`,
    [id, me.id, me.name ?? "", me.email, JSON.stringify(lines), notes.slice(0, 600), JSON.stringify(delivery)],
  );
  return toOrder(rows[0]);
}

export async function ordersFor(userId: string | null): Promise<MerchOrder[]> {
  const rows = userId
    ? await q<Row>(`SELECT * FROM os_merch_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId])
    : await q<Row>(`SELECT * FROM os_merch_orders ORDER BY created_at DESC LIMIT 500`);
  return rows.map(toOrder);
}

async function orderById(id: string): Promise<MerchOrder | null> {
  const rows = await q<Row>(`SELECT * FROM os_merch_orders WHERE id = $1`, [id]);
  return rows[0] ? toOrder(rows[0]) : null;
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<boolean> {
  const rows = await q(`UPDATE os_merch_orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id`, [id, status]);
  return rows.length > 0;
}

/* ------------------------------------------------------------ sending to makers */

export interface SendCheck {
  /** Can Send to Maker be pressed. */
  ready: boolean;
  /** Each reason it can't, in words. */
  problems: string[];
  /** Which makers this order goes to, and whether each is a test. */
  makers: { maker: MakerKey; name: string; mode: MakerMode | null }[];
}

/** Can this order go to its makers, and if not, why not. */
export function sendCheck(o: MerchOrder): SendCheck {
  const problems: string[] = [];
  const makers = new Map<MakerKey, MakerMode | null>();
  if (o.status !== "new") problems.push("Already sent.");
  if (!o.delivery) problems.push("No delivery address on the order.");
  for (const l of o.lines) {
    const p = MERCH.find((m) => m.key === l.product);
    if (!p) {
      problems.push(`${l.name} is no longer in the shop.`);
      continue;
    }
    const mode = makerMode(p.maker);
    makers.set(p.maker, mode);
    if (mode !== "standin" && !skuFor(p, l.colour, l.size)) problems.push(`${p.name} in ${l.colour}, ${l.size} isn't linked to ${MAKER_NAMES[p.maker]}'s product list yet.`);
  }
  for (const [k] of makers) {
    const why = makerBlocked(k);
    if (why) problems.push(why);
  }
  return {
    ready: problems.length === 0,
    problems: [...new Set(problems)],
    makers: [...makers].map(([maker, mode]) => ({ maker, name: MAKER_NAMES[maker], mode })),
  };
}

async function saveJobs(id: string, jobs: MakerJob[], status?: OrderStatus): Promise<void> {
  await q(
    `UPDATE os_merch_orders SET maker_jobs = $2::jsonb, status = COALESCE($3, status), updated_at = NOW() WHERE id = $1`,
    [id, JSON.stringify(jobs), status ?? null],
  );
}

/** Where the whole order is, from its makers' parts. */
function statusFromJobs(jobs: MakerJob[]): OrderStatus {
  const live = jobs.filter((j) => !j.error && j.stage !== "cancelled" && j.stage !== "failed");
  if (live.length === 0) return jobs.some((j) => j.makerRef) ? "cancelled" : "new";
  if (live.every((j) => j.stage === "delivered")) return "delivered";
  if (live.every((j) => j.stage === "dispatched" || j.stage === "delivered")) return "dispatched";
  return "ordered";
}

/**
 * Send to Maker. The order is claimed first (new -> ordered) so two presses
 * can't send it twice; if no maker takes it, it goes back to new with the
 * reason on it.
 */
export async function sendOrder(id: string, by: OsUser, origin: string): Promise<{ order: MerchOrder; error: string | null }> {
  const o = await orderById(id);
  if (!o) throw new MakerError("No such order.");
  const check = sendCheck(o);
  if (!check.ready) return { order: o, error: check.problems.join(" ") };
  const claimed = await q(`UPDATE os_merch_orders SET status = 'ordered', updated_at = NOW() WHERE id = $1 AND status = 'new' RETURNING id`, [id]);
  if (claimed.length === 0) return { order: o, error: "Someone has just sent it." };

  const byMaker = new Map<MakerKey, number[]>();
  o.lines.forEach((l, i) => {
    const p = MERCH.find((m) => m.key === l.product)!;
    byMaker.set(p.maker, [...(byMaker.get(p.maker) ?? []), i]);
  });

  const jobs: MakerJob[] = [];
  for (const [maker, idx] of byMaker) {
    const ref = `${o.id}-${maker}`;
    const base: MakerJob = {
      maker, ref, makerRef: "", mode: makerMode(maker) ?? "test", sentAt: new Date().toISOString(), sentBy: by.email,
      stage: "sent", said: "", carrier: null, tracking: null, cost: null, dispatchBy: null, issues: [], photos: [], checkedAt: null, error: null, lines: idx,
    };
    try {
      const items = idx.map((i) => {
        const l = o.lines[i];
        const p = MERCH.find((m) => m.key === l.product)!;
        return { sku: skuFor(p, l.colour, l.size) ?? `STANDIN-${p.key}`, qty: l.qty, artwork: p.artwork };
      });
      const sent = await sendToMaker(maker, { ref, delivery: o.delivery!, email: o.userEmail, notes: o.notes, items, origin });
      jobs.push({ ...base, makerRef: sent.makerRef, mode: sent.mode, stage: sent.stage, said: sent.message, cost: sent.cost });
    } catch (e) {
      jobs.push({ ...base, error: e instanceof MakerError ? e.message : `${MAKER_NAMES[maker]} could not be reached. Try again.` });
    }
  }
  const status = statusFromJobs(jobs);
  await saveJobs(id, jobs, status);
  const failed = jobs.filter((j) => j.error).map((j) => j.error!);
  return { order: (await orderById(id))!, error: failed.length ? failed.join(" ") : null };
}

/** Send again the makers that refused or couldn't be reached last time. */
export async function retryOrder(id: string, by: OsUser, origin: string): Promise<{ order: MerchOrder; error: string | null }> {
  const o = await orderById(id);
  if (!o) throw new MakerError("No such order.");
  if (!o.jobs.some((j) => j.error)) return { order: o, error: null };
  if (o.jobs.every((j) => j.error)) {
    await saveJobs(id, [], "new");
    return sendOrder(id, by, origin);
  }
  const jobs: MakerJob[] = [];
  for (const j of o.jobs) {
    if (!j.error) {
      jobs.push(j);
      continue;
    }
    try {
      const items = j.lines.map((i) => {
        const l = o.lines[i];
        const p = MERCH.find((m) => m.key === l.product)!;
        return { sku: skuFor(p, l.colour, l.size) ?? `STANDIN-${p.key}`, qty: l.qty, artwork: p.artwork };
      });
      const sent = await sendToMaker(j.maker, { ref: j.ref, delivery: o.delivery!, email: o.userEmail, notes: o.notes, items, origin });
      jobs.push({ ...j, makerRef: sent.makerRef, mode: sent.mode, stage: sent.stage, said: sent.message, cost: sent.cost, sentAt: new Date().toISOString(), sentBy: by.email, error: null });
    } catch (e) {
      jobs.push({ ...j, error: e instanceof MakerError ? e.message : `${MAKER_NAMES[j.maker]} could not be reached. Try again.` });
    }
  }
  await saveJobs(id, jobs, statusFromJobs(jobs));
  const failed = jobs.filter((j) => j.error).map((j) => j.error!);
  return { order: (await orderById(id))!, error: failed.length ? failed.join(" ") : null };
}

/* ----------------------------------------------------------- asking how it's going */

async function checkJobs(o: MerchOrder): Promise<{ changed: boolean; errors: string[] }> {
  /* Moved along by hand, never sent to a maker: nothing to ask, and its status stays as set. */
  if (o.jobs.length === 0) return { changed: false, errors: [] };
  let changed = false;
  const errors: string[] = [];
  const jobs: MakerJob[] = [];
  for (const j of o.jobs) {
    if (j.error || !j.makerRef || stageDone(j.stage)) {
      jobs.push(j);
      continue;
    }
    try {
      const c = await checkMaker(j.maker, j);
      const next: MakerJob = { ...j, ...c, cost: c.cost ?? j.cost, checkedAt: new Date().toISOString() };
      if (next.stage !== j.stage || next.tracking !== j.tracking || next.issues.join() !== j.issues.join()) changed = true;
      jobs.push(next);
    } catch (e) {
      errors.push(`${o.id} ${MAKER_NAMES[j.maker]}: ${e instanceof Error ? e.message : "no answer"}`);
      jobs.push(j);
    }
  }
  const status = statusFromJobs(jobs);
  await saveJobs(o.id, jobs, status === o.status ? undefined : status);
  return { changed: changed || status !== o.status, errors };
}

/** Check now, for one order, from the Orders page. */
export async function checkOrder(id: string): Promise<{ order: MerchOrder; errors: string[] }> {
  const o = await orderById(id);
  if (!o) throw new MakerError("No such order.");
  const r = await checkJobs(o);
  return { order: (await orderById(id))!, errors: r.errors };
}

/**
 * The daily run: every order with a maker's part still being made. Clothes2Order
 * asks for once a day after its 8pm dispatch, and not again once dispatched.
 */
export async function checkOpenOrders(): Promise<{ checked: number; changed: number; errors: string[] }> {
  const rows = await q<Row>(`SELECT * FROM os_merch_orders WHERE status = 'ordered' ORDER BY created_at LIMIT 200`);
  let changed = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const out = await checkJobs(toOrder(r));
    if (out.changed) changed++;
    errors.push(...out.errors);
  }
  return { checked: rows.length, changed, errors };
}

/* ------------------------------------------------------------------------ email */

/** James hears about every order. A failed email never loses the order: it is already saved. */
export async function tellJames(o: MerchOrder, origin: string): Promise<void> {
  const who = o.userName || o.userEmail;
  const count = o.lines.reduce((n, l) => n + l.qty, 0);
  const html = emailShell({
    heading: "New Merch Order",
    intro: `${who} has put in an order for ${count} item${count === 1 ? "" : "s"}.`,
    button: "See the Orders",
    link: `${origin}/tools/merch/orders`,
    image: "illustrations/door-open.gif",
    rows: o.lines.map((l) => ({ title: `${l.qty} x ${l.name}`, detail: `${l.colour}, size ${l.size}`, tone: "neutral" as const })),
    footnote: [o.delivery ? `Deliver to ${o.delivery.town} ${o.delivery.postcode}.` : "", o.notes ? `Their note: ${o.notes}` : ""].filter(Boolean).join(" ") || undefined,
  });
  await sendEmail({ to: MERCH_ORDERS_TO, subject: `Merch order from ${who}`, html, replyTo: o.userEmail || undefined }).catch(() => {});
}
