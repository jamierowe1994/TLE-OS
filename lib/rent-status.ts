import "server-only";
import { payPropAccounts, payPropCanAuth, payPropGetAll, type PayPropAccountId } from "@/lib/business/payprop";
import { readCache, writeCache } from "@/lib/business/integration-cache";
import { hasDb, q } from "@/lib/db";
import { getRentReceived } from "@/lib/business/payprop-income";
import { rentKey } from "@/lib/business/payprop-portfolio";

/**
 * IS THIS HOME UP TO DATE ON RENT? (James, 8 Oct 2026)
 *
 * "The bottom right-hand side should say whether they're up to date on rent
 * or not ... if they're not, we need to show the amount that they're behind
 * by." Read from PayProp, read only:
 *
 *   report/tenant/balances   each tenant's balance (negative = owed), their
 *                            last payment, the rent invoice and its day
 *   export/properties        PayProp's own property ids and addresses, to
 *                            find THIS home among them
 *   report/all-payments      via getRentReceived: when rent landed, and
 *                            whether the landlord has been paid on
 *
 * Matching is the dangerous part - a wrong match tells an agent a tenant owes
 * who does not. So a home is joined to a PayProp property only when exactly
 * one has its address and postcode (rentKey), with the full first line to
 * tell flats on one street apart. Anything less certain says "not matched",
 * never a figure. An agency PayProp cannot be reached says so too, and no
 * number is shown from before (the live-figures rule).
 *
 * READ ONCE A DAY, AT 10AM (James, 8 Oct 2026): "a poll every day at 10:00
 * ... the last thing that I need is for the guys to be waiting for ages ...
 * We don't want to keep polling PayProp." So PayProp is read by the
 * scheduled-sends cron alone (runDailyRentRead), once each morning at 10:00
 * London - rent due that day has mostly landed by then. Every screen reads
 * that stored copy and opens at once; none of them ever calls PayProp. A read
 * that fails, or leaves an agency out, is tried again every half hour until
 * it works. A copy more than a day and a bit old is not shown at all: the box
 * says when it was last checked instead.
 *
 * AND AGAIN AT 4PM (James, 8 Oct 2026: "add a 4 pm read as well"), so rent
 * paid during the day shows that afternoon, not the next morning.
 */

export type TenantBalance = {
  account: PayPropAccountId;
  propertyId: string;
  tenant: string;
  tenantId: string;
  /** Positive = owed and already due. An invoice PayProp raised ahead of
   *  its date is not counted until that date (see compute). */
  owed: number;
  /** What PayProp's balance says, including any invoice raised ahead. */
  balanceOwed: number;
  lastPayment: string | null;
  rent: number | null;
  lastInvoice: string | null;
  /** Day of the month the rent falls due, from the rent invoice. */
  paymentDay: number | null;
  tenancyStart: string | null;
  /** The rent invoice's end, when the tenancy has one. */
  tenancyEnd: string | null;
};

type PpProperty = { account: PayPropAccountId; id: string; name: string; firstLine: string; postcode: string };

type MonthRents = { month: string; byProperty: Record<string, { in: string; amount: number; paidOut: boolean }> | null };

type Book = { at: number; balances: TenantBalance[]; properties: PpProperty[]; unreachable: PayPropAccountId[]; rents: MonthRents[] };

const KEY = "rent-status:v4";
/** The reads, London time: 10am and 4pm. */
const READ_HOURS = [10, 16];
/** Older than this and the copy is not shown. The longest gap between reads
 *  is 4pm to 10am (18 hours); three more for the half-hourly retries. */
const TOO_OLD_MS = 21 * 3_600_000;
let held: Book | null = null;
let inFlight: Promise<Book | null> | null = null;

const money = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type BalanceRow = {
  balance?: string;
  tenant?: { id?: string; name?: string; is_active?: boolean };
  property?: { id?: string; name?: string };
  last_payment?: { date?: string };
  last_invoice?: { amount?: string; date?: string };
  invoice?: { start_date?: string; end_date?: string | null; payment_day?: number | string; amount?: string };
};
type PropertyRow = { id?: string; property_name?: string; address?: { first_line?: string; postal_code?: string } };

async function compute(): Promise<Book | null> {
  const accounts = payPropAccounts();
  if (!accounts.length) return null;
  const balances: TenantBalance[] = [];
  const properties: PpProperty[] = [];
  const unreachable: PayPropAccountId[] = [];
  for (const account of accounts) {
    if (!(await payPropCanAuth(account).catch(() => false))) {
      unreachable.push(account);
      continue;
    }
    const [b, p] = await Promise.all([
      payPropGetAll<BalanceRow>(account, "report/tenant/balances").catch(() => null),
      payPropGetAll<PropertyRow>(account, "export/properties").catch(() => null),
    ]);
    if (!b || !p) {
      unreachable.push(account);
      continue;
    }
    for (const r of b) {
      const propertyId = text(r.property?.id);
      if (!propertyId || r.tenant?.is_active === false) continue;
      const day = Number(r.invoice?.payment_day);
      /* PayProp raises the next rent invoice before its day - on the 8th a
         balance already holds the rent due on the 14th, so a tenant one month
         behind reads as two. An invoice dated after today is taken back out
         until its day comes. Measured on the Scotland book, 8 Oct 2026. */
      const balanceOwed = Math.round(-money(r.balance) * 100) / 100;
      const invDate = text(r.last_invoice?.date).slice(0, 10);
      const ahead = invDate && invDate > new Date().toISOString().slice(0, 10) ? money(r.last_invoice?.amount) : 0;
      balances.push({
        account,
        propertyId,
        tenant: text(r.tenant?.name) || "Tenant",
        tenantId: text(r.tenant?.id),
        owed: Math.max(0, Math.round((balanceOwed - ahead) * 100) / 100),
        balanceOwed,
        lastPayment: text(r.last_payment?.date) || null,
        rent: money(r.invoice?.amount) || money(r.last_invoice?.amount) || null,
        lastInvoice: text(r.last_invoice?.date) || null,
        paymentDay: Number.isFinite(day) && day >= 1 && day <= 31 ? day : null,
        tenancyStart: text(r.invoice?.start_date) || null,
        tenancyEnd: text(r.invoice?.end_date) || null,
      });
    }
    for (const r of p) {
      const id = text(r.id);
      if (!id) continue;
      properties.push({ account, id, name: text(r.property_name), firstLine: text(r.address?.first_line), postcode: text(r.address?.postal_code) });
    }
  }

  /* The last three months of rent in and out, per PayProp property. */
  const now = new Date();
  const months = [0, 1, 2].map((i) => monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  const rents: MonthRents[] = [];
  for (const month of months) {
    const rr = await getRentReceived(month, { wait: true }).catch(() => null);
    if (!rr) {
      rents.push({ month, byProperty: null });
      continue;
    }
    const byProperty: NonNullable<MonthRents["byProperty"]> = {};
    for (const r of rr.receipts) {
      const cur = byProperty[r.propertyId];
      byProperty[r.propertyId] = {
        in: r.receivedOn,
        amount: Math.round(((cur?.amount ?? 0) + r.amount) * 100) / 100,
        paidOut: (cur?.paidOut ?? true) && r.paidOut,
      };
    }
    rents.push({ month, byProperty });
  }
  return { at: Date.now(), balances, properties, unreachable, rents };
}

/** The stored read, from 10am or 4pm. Never calls PayProp. */
export async function rentBook(): Promise<Book | null> {
  const stored = await readCache<Book>(KEY).catch(() => null);
  if (stored?.data && (!held || stored.data.at > held.at)) held = stored.data;
  return held;
}

/** Read PayProp now and store it. Only the daily run calls this. */
async function refreshRentBook(): Promise<Book | null> {
  if (!inFlight) {
    inFlight = compute()
      .then(async (b) => {
        if (b) {
          held = b;
          await writeCache(KEY, b).catch(() => {});
        }
        return b;
      })
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

function londonStamp(at: number | Date): { day: string; hour: number; stamp: string } {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(new Date(at));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const day = `${g("year")}-${g("month")}-${g("day")}`;
  return { day, hour: Number(g("hour")), stamp: `${day}T${g("hour")}` };
}

let readsReady: Promise<void> | null = null;
async function readsQ<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[]): Promise<T[]> {
  readsReady ??= q(`CREATE TABLE IF NOT EXISTS os_rent_reads (
      day TEXT PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      error TEXT
    )`).then(() => undefined).catch(() => { readsReady = null; });
  await readsReady;
  return q<T>(text, params);
}

/**
 * Called by the scheduled-sends cron every few minutes. Reads PayProp only
 * when the stored copy is from before the latest 10am or 4pm (or there is
 * none at all) - once per read, across every server, claimed in
 * os_rent_reads (its "day" column holds the slot, "2026-10-08T16"). A read
 * that fails or misses an agency is tried again after half an hour. Starts
 * the read and returns; the cron does not wait on PayProp.
 */
export async function runDailyRentRead(now = new Date()): Promise<{ skipped?: string; started?: string }> {
  if (!hasDb()) return { skipped: "no database" };
  const t = londonStamp(now);
  /* The read this copy should be from: the latest 10am or 4pm that has passed,
     or yesterday's 4pm before 10am. */
  const hh = (h: number) => String(h).padStart(2, "0");
  const today = READ_HOURS.filter((h) => h <= t.hour);
  const slot = today.length
    ? `${t.day}T${hh(today[today.length - 1])}`
    : `${londonStamp(now.getTime() - 86_400_000).day}T${hh(READ_HOURS[READ_HOURS.length - 1])}`;
  const book = await rentBook();
  if (book && londonStamp(book.at).stamp >= slot && !book.unreachable.length) return { skipped: "already read" };

  const claimed = await readsQ<{ day: string }>(
    `INSERT INTO os_rent_reads (day) VALUES ($1)
     ON CONFLICT (day) DO UPDATE SET started_at = NOW(), error = NULL
      WHERE os_rent_reads.finished_at IS NULL AND os_rent_reads.started_at < NOW() - INTERVAL '30 minutes'
     RETURNING day`,
    [slot]
  ).catch(() => []);
  if (!claimed.length) return { skipped: "read in hand or tried in the last half hour" };

  void refreshRentBook()
    .then(async (b) => {
      const whole = b && !b.unreachable.length && b.rents.every((m) => m.byProperty);
      await readsQ(
        whole
          ? `UPDATE os_rent_reads SET finished_at = NOW(), error = NULL WHERE day = $1`
          : `UPDATE os_rent_reads SET error = $2 WHERE day = $1`,
        whole ? [slot] : [slot, b ? `Not everything read: ${[...b.unreachable, ...b.rents.filter((m) => !m.byProperty).map((m) => m.month)].join(", ")}` : "PayProp couldn't be read"]
      ).catch(() => {});
    })
    .catch(() => {});
  return { started: slot };
}

/** The one PayProp property that is this home, or why there isn't one. */
export function matchHome(book: Book, home: { name: string; address?: string | null; postcode: string | null }): { id: string; account: PayPropAccountId } | "none" | "unsure" {
  const want = rentKey(home.address || home.name, home.postcode);
  if (!want) return "none";
  const same = book.properties.filter((p) => rentKey(p.name || p.firstLine, p.postcode) === want || rentKey(p.firstLine || p.name, p.postcode) === want);
  const ids = [...new Map(same.map((p) => [`${p.account}|${p.id}`, p])).values()];
  if (ids.length === 1) return { id: ids[0].id, account: ids[0].account };
  if (ids.length > 1) {
    /* Flats on one street: the whole first line has to agree. */
    const line = norm(home.name);
    const exact = ids.filter((p) => norm(p.name) === line || norm(p.firstLine) === line);
    return exact.length === 1 ? { id: exact[0].id, account: exact[0].account } : "unsure";
  }
  return "none";
}

/** The day rent last fell due on or before `now`, for a monthly payment day. */
export function lastDueDate(paymentDay: number, now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const clamp = (yy: number, mm: number) => Math.min(paymentDay, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate());
  const thisMonth = new Date(Date.UTC(y, m, clamp(y, m)));
  if (thisMonth.getTime() <= now.getTime()) return thisMonth.toISOString().slice(0, 10);
  const pm = m === 0 ? 11 : m - 1;
  const py = m === 0 ? y - 1 : y;
  return new Date(Date.UTC(py, pm, clamp(py, pm))).toISOString().slice(0, 10);
}

export type RentStatus =
  | { state: "unreachable"; detail: string }
  | { state: "unmatched"; detail: string }
  | {
      state: "ok";
      checkedAt: string;
      upToDate: boolean;
      owed: number;
      tenants: Array<{ name: string; owed: number; lastPayment: string | null; dueOn: string | null; rent: number | null }>;
      /** The last few rents, newest first: when they landed and whether the landlord has been paid on. */
      history: Array<{ month: string; in: string | null; amountToLandlord: number | null; paidOut: boolean | null }>;
    };

/**
 * A tenant who belongs on this home's rent today. PayProp keeps old tenants
 * on a property - one last paid in 2022, an "Admin Tenant" placeholder - and
 * they are not this tenancy. A tenancy that has ended is out; so is one with
 * nothing owed and no payment in 75 days.
 */
export function current(b: TenantBalance, today = new Date().toISOString().slice(0, 10)): boolean {
  if (b.tenancyEnd && b.tenancyEnd.slice(0, 10) < today) return false;
  if (b.owed >= 1) return true;
  const recent = new Date(Date.now() - 75 * 86_400_000).toISOString().slice(0, 10);
  return Boolean((b.lastPayment && b.lastPayment.slice(0, 10) >= recent) || (b.tenancyStart && b.tenancyStart.slice(0, 10) >= recent));
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export async function rentStatusFor(home: { name: string; address?: string | null; postcode: string | null }): Promise<RentStatus> {
  const book = await rentBook();
  if (!book) return { state: "unreachable", detail: "The rent is checked with PayProp at 10am and 4pm each day, and the first check hasn't finished yet." };
  if (Date.now() - book.at > TOO_OLD_MS) {
    const when = new Date(book.at).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    return { state: "unreachable", detail: `PayProp couldn't be read at the last check, so the rent can't be shown. It was last checked on ${when}.` };
  }
  const hit = matchHome(book, home);
  if (hit === "unsure") return { state: "unmatched", detail: "More than one PayProp property has this address, so we can't say which is this home." };
  if (hit === "none") {
    return book.unreachable.length
      ? { state: "unreachable", detail: `PayProp ${book.unreachable.includes("uk") ? "England and Wales" : "Scotland"} can't be reached just now, so the rent can't be checked.` }
      : { state: "unmatched", detail: "This home isn't in PayProp, so there is no rent to check." };
  }
  const tenants = book.balances.filter((b) => b.account === hit.account && b.propertyId === hit.id && current(b));
  const owed = Math.round(tenants.reduce((s, t) => s + Math.max(0, t.owed), 0) * 100) / 100;

  /* The last three months of rent in and out, from the same read. */
  const history = book.rents.map(({ month, byProperty }) => {
    if (!byProperty) return { month, in: null, amountToLandlord: null, paidOut: null };
    const mine = byProperty[hit.id];
    if (!mine) return { month, in: null, amountToLandlord: 0, paidOut: null };
    return { month, in: mine.in, amountToLandlord: mine.amount, paidOut: mine.paidOut };
  });

  return {
    state: "ok",
    checkedAt: new Date(book.at).toISOString(),
    upToDate: owed < 1,
    owed,
    tenants: tenants.map((t) => ({ name: t.tenant, owed: Math.max(0, t.owed), lastPayment: t.lastPayment, dueOn: t.paymentDay ? lastDueDate(t.paymentDay) : t.lastInvoice, rent: t.rent })),
    history,
  };
}
