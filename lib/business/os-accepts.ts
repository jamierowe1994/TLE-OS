import "server-only";
import { hasDb, q } from "@/lib/db";
import { internalDomains } from "@/lib/email-policy";
import { allCancellations } from "@/lib/let-cancel";
import { shapeApplication } from "@/lib/applications";

/**
 * OFFERS ACCEPTED IN THE OS, FOR A MONTH'S "APPLICATIONS" FIGURE.
 *
 * Susan Liles, 20 Nov 2026 (ticket 17836026): "Applications for November say
 * 1?". The Overview's Applications tile counted only REX applications with a
 * date_accepted in the month. Since 7 Oct 2026 an agent's Accept is kept in
 * the OS only (lib/offer-decisions) and REX is marked by hand, if at all, and
 * offers made through the OS are never in REX. So from mid-October nearly
 * every accepted application fell out of the count.
 *
 * The same rule the dashboard's lets-agreed already uses (lib/front-dash-reads
 * letBook): REX's accepted rows, plus
 *   - a REX application accepted in the OS this month that REX has not
 *     marked accepted in this month, and
 *   - an OS offer accepted this month, unless REX already has the same
 *     applicant on the same listing accepted (the keyed-in twin steps aside).
 * Lets since cancelled, internal and test addresses are left out.
 *
 * null when the decisions can't be read: a REX-only figure would be the
 * undercount this was written to stop, so the tile shows a dash instead.
 */
export async function osAcceptedExtra(
  month: string,
  rexAcceptedRows: Array<Record<string, unknown>>
): Promise<number | null> {
  if (!hasDb()) return 0;
  const start = `${month}-01`;
  try {
    const [rexDecided, offers, cancelled] = await Promise.all([
      q<{ ref: string }>(
        `SELECT ref FROM os_offer_decisions
          WHERE decision = 'accepted' AND ref LIKE 'rex:%'
            AND decided_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/London'
            AND decided_at <  (($1::date + INTERVAL '1 month'))::timestamp AT TIME ZONE 'Europe/London'`,
        [start]
      ),
      q<{ id: string; email: string; listing_id: string }>(
        `SELECT r.id, LOWER(TRIM(r.email)) AS email, r.listing_id
           FROM os_offer_decisions d JOIN os_tenant_viewing_responses r ON d.ref = 'os:' || r.id
          WHERE d.decision = 'accepted' AND r.listing_id IS NOT NULL
            AND d.decided_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/London'
            AND d.decided_at <  (($1::date + INTERVAL '1 month'))::timestamp AT TIME ZONE 'Europe/London'
            AND split_part(LOWER(TRIM(r.email)), '@', 2) <> ALL($2::text[])
            AND NOT EXISTS (SELECT 1 FROM os_contacts c WHERE c.is_test AND LOWER(c.email) = LOWER(r.email))`,
        [start, internalDomains()]
      ),
      allCancellations().then((all) => new Set(all.flatMap((c) => [c.ref, c.dealId ?? ""]).filter(Boolean))),
    ]);

    const rex = rexAcceptedRows.map(shapeApplication);
    const rexIds = new Set(rex.map((a) => String(a.id)));
    let extra = 0;
    for (const { ref } of rexDecided) {
      const id = ref.slice(4);
      if (rexIds.has(id) || cancelled.has(id) || cancelled.has(ref)) continue;
      extra++;
    }
    for (const o of offers) {
      if (cancelled.has(`os:${o.id}`)) continue;
      const twin = rex.some(
        (a) => String(a.listingId ?? "") === String(o.listing_id) && a.applicants.some((p) => (p.email ?? "").toLowerCase() === o.email)
      );
      if (!twin) extra++;
    }
    return extra;
  } catch {
    return null;
  }
}
