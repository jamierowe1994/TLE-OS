import "server-only";
import { hasDb, q } from "@/lib/db";
import { logEvent, pounds } from "@/lib/works-orders";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import { contractorPayments, type ContractorPayment } from "@/lib/business/payprop-income";

/**
 * PAID, FROM PAYPROP (James, 29 Oct 2026, to Lianna Denholm: "you'll be able
 * to see all of your contractors in here and see what they've been paid
 * because it will cross-reference PayProp ... once it is paid out of the
 * rent, it will then mark as done").
 *
 * Every contractor invoice waiting to be paid (status "invoiced") is looked
 * for among the Contractor payments PayProp has actually paid out. A match
 * marks the job paid, on the day PayProp's batch went, through PayProp, with
 * a line on the timeline saying what PayProp paid and to whom.
 *
 * PayProp is READ-ONLY. Nothing here writes to it. PayProp gives the payment,
 * not a document (James: "All I can get is the confirmation of payment"; 0 of
 * 25 Scottish contractor payments had a file attached, 30 Oct), so the
 * timeline says only what PayProp paid. The invoice logged on the job is the copy.
 *
 * ── What counts as the same payment ────────────────────────────────────────
 *
 * The amount to the penny, always. Then the home: PayProp's property and the
 * job's must be the same front door ("40|marchmont"). Where either side has
 * no house number to go on, the firm's name has to agree instead - "LG
 * Services" is "Lanarkshire Gas Services Ltd" to PayProp, "HCL Glazing" is
 * "Henry Clarke Muir HCM Glazing" - and a trade word ("plumbing", "gas") on
 * its own is not a name. Two different homes never match, whatever the name.
 * The payment has to go out after the invoice came in, give or take the
 * weeks it takes somebody to log an invoice that was already paid.
 *
 * Each PayProp payment pays one invoice. Where two invoices could take the
 * same payment, the closer match wins: same home before same name, then the
 * nearest date.
 *
 * What it can see is what lib/business/payprop-income walks for the income
 * tiles: the last three months and the coming one, worked out from today.
 * An invoice paid before that window is left for the office to mark by hand.
 */

/** How long before the invoice was logged a payment can still be its payment. */
const LOGGED_LATE_DAYS = 45;
/** The walk is shared with the income tiles; past this the page goes on and the walk finishes behind it. */
const WAIT_MS = 20_000;
/** One look a couple of minutes is plenty: PayProp pays in batches, not by the second. */
const AGAIN_MS = 2 * 60_000;

const NOISE = new Set(["ltd", "limited", "llp", "plc", "co", "company", "uk", "the", "and", "of", "services", "service", "group", "solutions", "property", "properties", "care", "maintenance", "t", "a"]);
const TRADES = new Set([
  "plumbing", "plumber", "plumbers", "heating", "gas", "electrical", "electrics", "electric", "electrician", "glazing", "glass",
  "building", "builders", "builder", "roofing", "drainage", "drains", "cleaning", "cleaners", "handyman", "repairs", "repair",
  "appliance", "appliances", "domestic", "boilers", "boiler", "joinery", "joiner", "joiners", "decorating", "decorators", "trades",
  "locksmith", "locksmiths", "pest", "control", "inventories", "inventory", "fire", "safety", "renovations", "construction", "lettings",
]);

function words(name: string): string[] {
  return name.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !NOISE.has(w));
}

/** The same firm, as two people would spell it. A shared trade word is not enough. */
export function sameFirm(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return false;
  if (x.some((w) => w.length >= 4 && !TRADES.has(w) && y.includes(w))) return true;
  /* Initials: "LG" for Lanarkshire Gas, "HCM" for Henry Clarke Muir. */
  const initials = (ws: string[]) => ws.map((w) => w[0]).join("");
  for (const [s, o] of [[x, y], [y, x]] as const) {
    const short = s.find((w) => /^[a-z]{2,4}$/.test(w) && !TRADES.has(w));
    if (short && o.length >= short.length && initials(o).startsWith(short)) return true;
  }
  return false;
}

type Open = { id: string; ref: number; propertyName: string; invoicePence: number; invoicedAt: string; contractorName: string };
type Pair = { job: Open; pay: ContractorPayment; score: number; gap: number };

/** Which waiting invoice each PayProp payment paid. Pure, so it can be tried against the live rows without writing. */
export function matchPayments(jobs: Open[], payments: ContractorPayment[]): Pair[] {
  const pairs: Pair[] = [];
  for (const job of jobs) {
    const home = propertyKey(job.propertyName);
    const loggedOn = job.invoicedAt.slice(0, 10);
    const earliest = new Date(Date.parse(`${loggedOn}T00:00:00Z`) - LOGGED_LATE_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (const pay of payments) {
      if (Math.round(pay.amount * 100) !== job.invoicePence) continue;
      if (pay.paidOn < earliest) continue;
      const bothHomes = Boolean(home && pay.propertyKey);
      if (bothHomes && home !== pay.propertyKey) continue;
      const sameHome = bothHomes && home === pay.propertyKey;
      const firm = Boolean(job.contractorName) && sameFirm(job.contractorName, pay.name);
      if (!sameHome && !firm) continue;
      pairs.push({ job, pay, score: (sameHome ? 2 : 0) + (firm ? 1 : 0), gap: Math.abs(Date.parse(pay.paidOn) - Date.parse(loggedOn)) });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.gap - b.gap);
  const usedJobs = new Set<string>();
  const usedPays = new Set<ContractorPayment>();
  const out: Pair[] = [];
  for (const p of pairs) {
    if (usedJobs.has(p.job.id) || usedPays.has(p.pay)) continue;
    usedJobs.add(p.job.id);
    usedPays.add(p.pay);
    out.push(p);
  }
  return out;
}

export type PaidSweep =
  | { ok: true; readAt: string; waiting: number; marked: { id: string; ref: number; paidOn: string }[] }
  | { ok: false; readAt: string; error: string; pending?: boolean };

const dayLong = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

async function sweep(): Promise<PaidSweep> {
  const readAt = new Date().toISOString();
  if (!hasDb()) return { ok: false, readAt, error: "No database on this environment." };
  const rows = await q<{ id: string; ref: number; property_name: string; invoice_pence: number; invoiced_at: Date | string | null; contractor_name: string | null }>(
    `SELECT id, ref, property_name, invoice_pence, invoiced_at, contractor_name FROM os_works_orders
      WHERE status = 'invoiced' AND NOT rehearsal AND invoice_pence > 0`
  );
  const jobs: Open[] = rows.map((r) => ({
    id: String(r.id),
    ref: Number(r.ref),
    propertyName: String(r.property_name ?? ""),
    invoicePence: Number(r.invoice_pence),
    invoicedAt: r.invoiced_at ? new Date(r.invoiced_at).toISOString() : readAt,
    contractorName: String(r.contractor_name ?? ""),
  }));
  if (!jobs.length) return { ok: true, readAt, waiting: 0, marked: [] };

  let payments: ContractorPayment[] | "slow";
  try {
    payments = await Promise.race([contractorPayments(), new Promise<"slow">((res) => setTimeout(() => res("slow"), WAIT_MS))]);
  } catch (e) {
    console.error("[works-payprop-paid] PayProp could not be read", e instanceof Error ? e.message : e);
    return { ok: false, readAt, error: "PayProp couldn't be read just now, so nothing has been checked off. Try again in a few minutes." };
  }
  if (payments === "slow") return { ok: false, readAt, pending: true, error: "PayProp is still being read. Paid invoices will tick off on the next look." };

  const marked: { id: string; ref: number; paidOn: string }[] = [];
  for (const { job, pay } of matchPayments(jobs, payments)) {
    /* Only if it is still waiting: the office may have marked it by hand meanwhile. */
    const done = await q(
      `UPDATE os_works_orders SET status = 'paid', paid_at = $2::date + TIME '12:00', paid_how = 'payprop', updated_at = NOW()
        WHERE id = $1 AND status = 'invoiced' RETURNING id`,
      [job.id, pay.paidOn]
    );
    if (!done.length) continue;
    await logEvent(
      job.id,
      "TLE OS",
      "paid",
      `Paid in PayProp on ${dayLong(pay.paidOn)}: ${pounds(job.invoicePence)} to ${pay.name || "the contractor"}.`
    );
    marked.push({ id: job.id, ref: job.ref, paidOn: pay.paidOn });
  }
  return { ok: true, readAt, waiting: jobs.length - marked.length, marked };
}

let last: { at: number; result: PaidSweep } | null = null;
let inflight: Promise<PaidSweep> | null = null;

/** Look in PayProp for the invoices waiting to be paid, at most once every couple of minutes. */
export function checkPayPropPaid(): Promise<PaidSweep> {
  if (last && Date.now() - last.at < AGAIN_MS && last.result.ok) return Promise.resolve(last.result);
  if (inflight) return inflight;
  inflight = sweep()
    .then((result) => { last = { at: Date.now(), result }; return result; })
    .finally(() => { inflight = null; });
  return inflight;
}
