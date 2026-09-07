import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { getOrder, logEvent, pounds } from "@/lib/works-orders";

/**
 * Invoices: the ones The Letting Experts raise, numbered, on a schedule.
 *
 * James, 7 Sep 2026: a quotation gets logged, "it needs to be turned into
 * an invoice and produce invoice numbers. It is a whole invoicing schedule."
 * The invoice is a document they "preview, see all the editable fields,
 * make edits by clicking into the actual document or onto the sidebar,
 * produce it, and then have an option afterwards to send it."
 *
 * ── The life of an invoice ────────────────────────────────────────────────
 *
 *   draft    → being written. No number yet: a number is a promise to the
 *              accounts, and a draft that is thrown away must not leave a
 *              gap in the sequence.
 *   issued   → PRODUCED. It takes the next number, the company details are
 *              frozen onto it as they stood, and the figures stop moving.
 *   sent     → emailed to whoever it is to, with the page they can print.
 *   paid     → settled, with a note of how.
 *   void     → withdrawn. Keeps its number, so the sequence still reads.
 *
 * ── Money ────────────────────────────────────────────────────────────────
 *
 * Pence, integers. Each line carries its own VAT rate, because a landlord
 * invoice mixes a contractor's cost passed through (often no VAT) with our
 * own fee (standard rated). Totals are worked out, never stored, so they
 * can never disagree with the lines.
 *
 * ── Settings ─────────────────────────────────────────────────────────────
 *
 * Who the invoice is from - name, address, VAT and company numbers, bank
 * details, the prefix, the terms - lives in os_settings under "invoicing",
 * edited from the Invoices section. It is COPIED onto the invoice when it
 * is produced, so an old invoice still shows the details it went out with.
 */

export interface InvoiceSettings {
  companyName: string;
  addressLines: string[];
  email: string;
  phone: string;
  vatNumber: string;
  companyNumber: string;
  bankName: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
  prefix: string;
  termsDays: number;
  defaultVatRate: number;
  footer: string;
  /** Where "invoice in" notices go: the accounts inbox, not compliance (Michael, 7 Sep 2026). */
  accountsEmail: string;
}

export const DEFAULT_SETTINGS: InvoiceSettings = {
  companyName: "The Letting Experts",
  addressLines: [],
  email: "",
  phone: "",
  vatNumber: "",
  companyNumber: "",
  bankName: "",
  accountName: "The Letting Experts",
  sortCode: "",
  accountNumber: "",
  prefix: "INV-",
  termsDays: 14,
  defaultVatRate: 20,
  footer: "Please pay by bank transfer quoting the invoice number. Thank you.",
  accountsEmail: "",
};

export interface InvoiceLine {
  id: string;
  description: string;
  qty: number;
  unitPence: number;
  vatRate: number;
}

export type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "void";

export interface Invoice {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  orderId: string | null;
  orderRef: number | null;
  property: string;
  toName: string;
  toAddress: string;
  toEmail: string;
  /** The company details as they stood when produced; the live settings until then. */
  from: InvoiceSettings;
  issueDate: string;
  dueDate: string;
  reference: string;
  lines: InvoiceLine[];
  notes: string;
  token: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  sentAt: string | null;
  sentTo: string;
  paidAt: string | null;
  paidNote: string;
}

export interface Totals {
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
}

export function totalsOf(lines: InvoiceLine[]): Totals {
  let subtotal = 0;
  let vat = 0;
  for (const l of lines) {
    const net = Math.round((Number(l.qty) || 0) * (Number(l.unitPence) || 0));
    subtotal += net;
    vat += Math.round((net * (Number(l.vatRate) || 0)) / 100);
  }
  return { subtotalPence: subtotal, vatPence: vat, totalPence: subtotal + vat };
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const dayOf = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : "");

/* ── settings ───────────────────────────────────────────────────────────── */

export async function invoiceSettings(): Promise<InvoiceSettings> {
  if (!hasDb()) return DEFAULT_SETTINGS;
  const rows = await q<{ value: Partial<InvoiceSettings> }>(`SELECT value FROM os_settings WHERE key = 'invoicing'`).catch(() => []);
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.value ?? {}) };
}

export async function saveInvoiceSettings(patch: Partial<InvoiceSettings>, by: string): Promise<InvoiceSettings> {
  const next = { ...(await invoiceSettings()), ...patch };
  next.termsDays = Math.max(0, Math.round(Number(next.termsDays) || 0));
  next.defaultVatRate = Math.max(0, Number(next.defaultVatRate) || 0);
  next.addressLines = (next.addressLines ?? []).map((l) => String(l).trim()).filter(Boolean);
  await q(
    `INSERT INTO os_settings (key, value, updated_by) VALUES ('invoicing', $1::jsonb, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [JSON.stringify(next), by]
  );
  return next;
}

/* ── reading ────────────────────────────────────────────────────────────── */

function toInvoice(r: Row, live: InvoiceSettings): Invoice {
  const from = r.from_json && typeof r.from_json === "object" && Object.keys(r.from_json as object).length ? { ...DEFAULT_SETTINGS, ...(r.from_json as Partial<InvoiceSettings>) } : live;
  return {
    id: s(r.id),
    number: r.number ? s(r.number) : null,
    status: (s(r.status) as InvoiceStatus) || "draft",
    orderId: r.order_id ? s(r.order_id) : null,
    orderRef: r.order_ref == null ? null : Number(r.order_ref),
    property: s(r.property),
    toName: s(r.to_name),
    toAddress: s(r.to_address),
    toEmail: s(r.to_email),
    from,
    issueDate: dayOf(r.issue_date),
    dueDate: dayOf(r.due_date),
    reference: s(r.reference),
    lines: Array.isArray(r.lines) ? (r.lines as InvoiceLine[]) : [],
    notes: s(r.notes),
    token: s(r.token),
    createdBy: s(r.created_by),
    createdAt: iso(r.created_at) ?? "",
    updatedAt: iso(r.updated_at) ?? "",
    issuedAt: iso(r.issued_at),
    sentAt: iso(r.sent_at),
    sentTo: s(r.sent_to),
    paidAt: iso(r.paid_at),
    paidNote: s(r.paid_note),
  };
}

const COLS = `i.id, i.number, i.status, i.order_id, o.ref AS order_ref, i.property, i.to_name, i.to_address, i.to_email, i.from_json,
  i.issue_date, i.due_date, i.reference, i.lines, i.notes, i.token, i.created_by, i.created_at, i.updated_at, i.issued_at, i.sent_at, i.sent_to, i.paid_at, i.paid_note`;
const FROM = `FROM os_invoices i LEFT JOIN os_works_orders o ON o.id = i.order_id`;

export async function listInvoices(limit = 300): Promise<Invoice[]> {
  if (!hasDb()) return [];
  const live = await invoiceSettings();
  const rows = await q<Row>(`SELECT ${COLS} ${FROM} ORDER BY i.created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => toInvoice(r, live));
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  if (!hasDb()) return null;
  const live = await invoiceSettings();
  const [r] = await q<Row>(`SELECT ${COLS} ${FROM} WHERE i.id = $1`, [id]);
  return r ? toInvoice(r, live) : null;
}

export async function getInvoiceByToken(token: string): Promise<Invoice | null> {
  if (!hasDb() || !token) return null;
  const live = await invoiceSettings();
  const [r] = await q<Row>(`SELECT ${COLS} ${FROM} WHERE i.token = $1`, [token]);
  return r ? toInvoice(r, live) : null;
}

/* ── writing ────────────────────────────────────────────────────────────── */

const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);

/**
 * A new draft: blank, or written from a job. From a job it carries the
 * landlord as bill-to, the job as the reference, and one line for the
 * contractor's cost (the invoice if there is one, else the quote), passed
 * through at no VAT - the agent adds the fee line and changes what they
 * like before producing it.
 */
export async function createInvoice(input: { orderId?: string | null; toName?: string; toAddress?: string; toEmail?: string; property?: string }, by: string): Promise<Invoice> {
  const settings = await invoiceSettings();
  const id = uid();
  const token = randomBytes(18).toString("base64url");
  const today = new Date();
  let orderId: string | null = null;
  let property = (input.property ?? "").trim();
  let toName = (input.toName ?? "").trim();
  let toAddress = (input.toAddress ?? "").trim();
  let toEmail = (input.toEmail ?? "").trim();
  let reference = "";
  const lines: InvoiceLine[] = [];
  if (input.orderId) {
    const found = await getOrder(input.orderId);
    if (!found) throw new Error("No such job.");
    const o = found.order;
    orderId = o.id;
    property = property || [o.propertyName, o.locality].filter(Boolean).join(", ");
    toName = toName || o.landlord;
    toEmail = toEmail || o.landlordEmail;
    reference = `Job #${o.ref}: ${o.title}`;
    const cost = o.invoicePence ?? o.quotePence;
    if (cost != null) lines.push({ id: uid(), description: `${o.title}${o.contractorName ? ` - ${o.contractorName}` : ""}`, qty: 1, unitPence: cost, vatRate: 0 });
  }
  const [r] = await q<Row>(
    `INSERT INTO os_invoices (id, status, order_id, property, to_name, to_address, to_email, from_json, issue_date, due_date, reference, lines, notes, token, created_by)
     VALUES ($1, 'draft', $2, $3, $4, $5, $6, '{}'::jsonb, $7, $8, $9, $10::jsonb, $11, $12, $13)
     RETURNING id`,
    [id, orderId, property, toName, toAddress, toEmail, today.toISOString().slice(0, 10), plusDays(today, settings.termsDays), reference, JSON.stringify(lines), settings.footer, token, by]
  );
  if (orderId) await logEvent(orderId, by, "invoice", `Invoice drafted for ${toName || "the landlord"}.`);
  return (await getInvoice(s(r.id)))!;
}

export type InvoicePatch = Partial<Pick<Invoice, "toName" | "toAddress" | "toEmail" | "property" | "issueDate" | "dueDate" | "reference" | "lines" | "notes">>;

/** Edit the words and the lines. Allowed until it is sent. */
export async function updateInvoice(id: string, patch: InvoicePatch): Promise<Invoice> {
  const cur = await getInvoice(id);
  if (!cur) throw new Error("No such invoice.");
  if (cur.status === "sent" || cur.status === "paid" || cur.status === "void") throw new Error("This invoice has gone out. Void it and raise another to change it.");
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (patch.toName != null) set("to_name", patch.toName.trim());
  if (patch.toAddress != null) set("to_address", patch.toAddress.trim());
  if (patch.toEmail != null) set("to_email", patch.toEmail.trim().toLowerCase());
  if (patch.property != null) set("property", patch.property.trim());
  if (patch.issueDate) set("issue_date", patch.issueDate.slice(0, 10));
  if (patch.dueDate) set("due_date", patch.dueDate.slice(0, 10));
  if (patch.reference != null) set("reference", patch.reference.trim());
  if (patch.notes != null) set("notes", patch.notes);
  if (Array.isArray(patch.lines)) {
    const lines = patch.lines
      .map((l) => ({ id: l.id || uid(), description: String(l.description ?? "").trim(), qty: Number(l.qty) || 0, unitPence: Math.round(Number(l.unitPence) || 0), vatRate: Number(l.vatRate) || 0 }))
      .filter((l) => l.description || l.unitPence);
    set("lines", JSON.stringify(lines));
  }
  if (sets.length) {
    vals.push(id);
    await q(`UPDATE os_invoices SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
  }
  return (await getInvoice(id))!;
}

/** PRODUCE it: the next number, the company details frozen on, the figures fixed. */
export async function issueInvoice(id: string, by: string): Promise<Invoice> {
  const cur = await getInvoice(id);
  if (!cur) throw new Error("No such invoice.");
  if (cur.status !== "draft") return cur;
  if (!cur.toName.trim()) throw new Error("Who is it to?");
  if (!cur.lines.length) throw new Error("An invoice needs at least one line.");
  const settings = await invoiceSettings();
  const [seq] = await q<{ n: string }>(`SELECT nextval('os_invoices_seq')::text AS n`);
  const number = `${settings.prefix}${String(seq.n).padStart(5, "0")}`;
  await q(
    `UPDATE os_invoices SET number = $2, status = 'issued', from_json = $3::jsonb, issued_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id, number, JSON.stringify(settings)]
  );
  if (cur.orderId) await logEvent(cur.orderId, by, "invoice", `Invoice ${number} produced for ${cur.toName}: ${pounds(totalsOf(cur.lines).totalPence)}.`);
  return (await getInvoice(id))!;
}

export async function markInvoice(id: string, action: "sent" | "paid" | "void", by: string, note = "", to = ""): Promise<Invoice> {
  const cur = await getInvoice(id);
  if (!cur) throw new Error("No such invoice.");
  if (action === "sent") await q(`UPDATE os_invoices SET status = 'sent', sent_at = NOW(), sent_to = $2, updated_at = NOW() WHERE id = $1`, [id, to]);
  if (action === "paid") await q(`UPDATE os_invoices SET status = 'paid', paid_at = NOW(), paid_note = $2, updated_at = NOW() WHERE id = $1`, [id, note]);
  if (action === "void") await q(`UPDATE os_invoices SET status = 'void', notes = $2, updated_at = NOW() WHERE id = $1`, [id, note ? `${cur.notes}\n\nVoid: ${note}`.trim() : cur.notes]);
  if (cur.orderId) {
    const line = action === "sent" ? `Invoice ${cur.number} sent to ${to}.` : action === "paid" ? `Invoice ${cur.number} paid.${note ? ` ${note}` : ""}` : `Invoice ${cur.number} voided.${note ? ` ${note}` : ""}`;
    await logEvent(cur.orderId, by, "invoice", line);
  }
  return (await getInvoice(id))!;
}

export const money = pounds;
