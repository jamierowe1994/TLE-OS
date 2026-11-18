import "server-only";
import { demoWorld, isoDay } from "./world";

/**
 * THE DEMO'S RENTS (lib/demo/mode).
 *
 * On live the rent on each home, who has paid and who is behind come from the
 * client-money system, read twice a day into a "rent book" (lib/rent-status).
 * The demo has no such system, so lib/rent-status asks here, and this lays a
 * rent book over the invented world: every let home bills its listing's rent,
 * most tenants paid on their day, and a few are behind so the arrears
 * screens have something to show.
 *
 * Month-scoped from today: this month and the two before it, worked out when
 * asked, never written down.
 */

type Row = Record<string, unknown>;
const DAY = 86_400_000;

export function demoRentBook() {
  const w = demoWorld();
  const now = w.at;
  const lets = w.rows.listings.filter((l) => l.system_listing_state === "leased");
  const properties: Row[] = [];
  const balances: Row[] = [];
  const rentNow: Record<string, { monthly: number; filedAs: string | null }> = {};
  const rentByTenant: Record<string, number> = {};
  const months = [0, 1, 2].map((back) => {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - back);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const rents = months.map((month) => ({ month, byProperty: {} as Record<string, { in: string; amount: number; paidOut: boolean }> }));
  const dayOfMonth = new Date(now).getUTCDate();

  for (const [n, l] of lets.entries()) {
    const p = l.property as Row;
    const account = /^(EH|G)\d/.test(String(p.adr_postcode)) ? "scotland" : "uk";
    const id = `pp-${p.id}`;
    const key = `${account}|${id}`;
    const rent = Number(l.price_rent);
    const line = [p.adr_unit_number, `${p.adr_street_number} ${p.adr_street_name}`].filter(Boolean).join(", ");
    const service = String((l.lettings_service_type as Row).text);
    const pct = service === "Let Only" ? 0 : service === "Rent Collect" ? 8 : 12;
    properties.push({
      account, id, name: line, firstLine: line, postcode: String(p.adr_postcode), mpr: rent,
      commission: { amount: Math.round((rent * pct) / 100), percentage: pct }, agent: String((l.listing_agent_1 as Row).name),
    });
    rentNow[key] = { monthly: rent, filedAs: null };

    const tenants = (((l.related as Row).contact_reln_listing as Row[]) ?? []).filter((r) => (r.reln_type as Row).id === "purchtenant").map((r) => r.contact as Row);
    const paymentDay = 1 + (n % 27);
    /* One home in nine is behind: part of this month, or all of it. */
    const behind = n % 9 === 4 ? rent : n % 9 === 7 ? Math.round(rent / 2) : 0;
    const share = tenants.length ? Math.round(rent / tenants.length) : rent;
    for (const [t, c] of tenants.entries()) {
      const tenantId = `ppt-${c.id}`;
      rentByTenant[`${key}|${tenantId}`] = share;
      const lastPaid = now - ((dayOfMonth >= paymentDay ? dayOfMonth - paymentDay : dayOfMonth + 30 - paymentDay) + (behind && t === 0 ? 30 : 0)) * DAY;
      balances.push({
        account, propertyId: id, tenant: String(c.name), tenantId, owed: t === 0 ? behind : 0, balanceOwed: t === 0 ? behind : 0,
        lastPayment: isoDay(lastPaid), rent: share, lastInvoice: isoDay(now - (dayOfMonth >= paymentDay ? dayOfMonth - paymentDay : dayOfMonth + 30 - paymentDay) * DAY),
        paymentDay, tenancyStart: (l.state_date as string) ?? null, tenancyEnd: null,
      });
    }
    for (const [back, m] of rents.entries()) {
      /* This month: in if their day has come and they are not behind. Earlier months: in, and paid out. */
      if (back === 0 && (dayOfMonth < paymentDay || behind === rent)) continue;
      m.byProperty[key] = { in: `${m.month}-${String(paymentDay).padStart(2, "0")}`, amount: back === 0 ? rent - behind : rent, paidOut: back > 0 || dayOfMonth - paymentDay > 3 };
    }
  }
  return { at: Date.now(), balances, properties, unreachable: [], rents, tags: {}, tagsUnread: [], rentNow, rentByTenant, rentNext: {} };
}
