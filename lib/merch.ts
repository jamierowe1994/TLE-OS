import "server-only";
import { q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";
import { emailShell } from "@/lib/email/shell";
import { MERCH, type MerchLine } from "@/lib/merch-catalogue";
import type { OsUser } from "@/lib/users";

/**
 * Merch orders (James, 24 Nov 2026): Tools > Merch, locked behind the "merch"
 * switch until he releases it.
 *
 * An order is a list of lines and a note. Nothing is paid on the page and no
 * price is stored: pricing, and who pays, are James's calls, and until he has
 * made them the order is a request he works through by hand. He is emailed
 * each one; the shop's Orders page lists them all for the owners.
 */

export const MERCH_ORDERS_TO = "james@therecruitmentexperts.co.uk";
export const ORDER_STATUSES = ["new", "ordered", "ready", "collected"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface MerchOrder {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  lines: MerchLine[];
  notes: string;
  status: OrderStatus;
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

export async function placeOrder(me: OsUser, lines: MerchLine[], notes: string): Promise<MerchOrder> {
  const id = `mo_${uid()}`;
  const rows = await q<Row>(
    `INSERT INTO os_merch_orders (id, user_id, user_name, user_email, lines, notes)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING *`,
    [id, me.id, me.name ?? "", me.email, JSON.stringify(lines), notes.slice(0, 600)],
  );
  return toOrder(rows[0]);
}

export async function ordersFor(userId: string | null): Promise<MerchOrder[]> {
  const rows = userId
    ? await q<Row>(`SELECT * FROM os_merch_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId])
    : await q<Row>(`SELECT * FROM os_merch_orders ORDER BY created_at DESC LIMIT 500`);
  return rows.map(toOrder);
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<boolean> {
  const rows = await q(`UPDATE os_merch_orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id`, [id, status]);
  return rows.length > 0;
}

/** James hears about every order. A failed email never loses the order: it is already saved. */
export async function tellJames(o: MerchOrder, origin: string): Promise<void> {
  const who = o.userName || o.userEmail;
  const html = emailShell({
    heading: "New Merch Order",
    intro: `${who} has put in an order for ${o.lines.reduce((n, l) => n + l.qty, 0)} item${o.lines.reduce((n, l) => n + l.qty, 0) === 1 ? "" : "s"}.`,
    button: "See the Orders",
    link: `${origin}/tools/merch/orders`,
    image: "illustrations/door-open.gif",
    rows: o.lines.map((l) => ({ title: `${l.qty} x ${l.name}`, detail: `${l.colour}, size ${l.size}`, tone: "neutral" as const })),
    footnote: o.notes ? `Their note: ${o.notes}` : undefined,
  });
  await sendEmail({ to: MERCH_ORDERS_TO, subject: `Merch order from ${who}`, html, replyTo: o.userEmail || undefined }).catch(() => {});
}
