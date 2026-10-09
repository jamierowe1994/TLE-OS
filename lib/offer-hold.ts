import { hasDb, q } from "@/lib/db";
import type { Application } from "@/lib/applications";
import type { BusinessDeal } from "@/lib/business/propoly-deals";
import { decisionsFor, recordDecision, type DecisionRef } from "@/lib/offer-decisions";
import { createUpdate, type CustomerUpdate, type UpdateRecipient } from "@/lib/customer-updates";
import { homesListHtml, liveBook, similarHomes } from "@/lib/tenant-matching";
import { firstName, validEmail } from "@/lib/tenant-email-send";

/**
 * The other offers, held until the holding fee is paid (9 Oct 2026).
 *
 * James: "we don't want to decline that offer until the holding deposit is
 * paid. If they don't end up paying ... we've got no one, or we have to go
 * grovelling back to the other tenants." So once one offer on a home is
 * accepted, the rest stay open - HELD - and the home keeps taking viewings.
 * When Propoly shows the accepted tenant's holding fee paid, the agent is
 * asked whether to let the others know. Nothing is declined or sent by
 * itself: the agent presses the button, then reads and sends each "not this
 * one" from the customer update it makes.
 */

/** Whether the accepted tenant's holding fee is settled, from their Propoly deal. */
export function feeOf(deal: BusinessDeal | null): { settled: boolean; paidAt: string | null; words: string } {
  const h = deal?.app.propoly?.holdingPaid ?? null;
  if (h?.status === "paid") return { settled: true, paidAt: h.paidAt, words: "Holding fee paid" };
  if (h?.status === "not_required") return { settled: true, paidAt: null, words: "No holding fee on this deal" };
  return { settled: false, paidAt: null, words: deal ? "Holding fee not paid yet" : "Not in Propoly yet, so no holding fee taken" };
}

/** One offer still open on the home, and who would be told. */
export interface HeldOffer {
  ref: DecisionRef;
  name: string;
  amount: number | null;
  people: { name: string; email: string | null; contactId: string | null }[];
}

type OsRow = { id: string; name: string; email: string; payload: { amount?: number } | null };

/**
 * Every offer on the listing still open: no decision here, not accepted or
 * unsuccessful in REX, not closed. The accepted one is left out.
 *
 * `apps` is the REX book the caller already holds (all of it, or the
 * agent's own) and `closed` its closedReasons - read once by the caller.
 */
export async function otherOpenOffers(
  listingId: string,
  exceptRef: string,
  apps: Application[],
  closed: Map<string, string>
): Promise<HeldOffer[]> {
  const rex = apps.filter(
    (a) => String(a.listingId ?? "") === listingId && (a.status === "received" || a.status === "communicated") && !closed.get(a.id)
  );
  const os = hasDb()
    ? await q<OsRow>(
        `SELECT id, name, email, payload FROM os_tenant_viewing_responses WHERE listing_id = $1 AND kind = 'offer' ORDER BY created_at DESC LIMIT 50`,
        [listingId]
      ).catch(() => [] as OsRow[])
    : [];
  const refs = [...rex.map((a) => `rex:${a.id}`), ...os.map((r) => `os:${r.id}`)];
  const decided = await decisionsFor(refs).catch(() => new Map());
  const out: HeldOffer[] = [];
  for (const a of rex) {
    const ref = `rex:${a.id}` as DecisionRef;
    if (ref === exceptRef || decided.has(ref)) continue;
    out.push({
      ref,
      name: a.applicants.map((p) => p.name).filter(Boolean).join(" & ") || "Applicant not named",
      amount: a.offerAmount ?? null,
      people: a.applicants.map((p) => ({ name: p.name, email: p.email ?? null, contactId: p.contactId ?? null })),
    });
  }
  for (const r of os) {
    const ref = `os:${r.id}` as DecisionRef;
    if (ref === exceptRef || decided.has(ref)) continue;
    out.push({
      ref,
      name: r.name || r.email,
      amount: typeof r.payload?.amount === "number" ? r.payload.amount : null,
      people: [{ name: r.name || r.email, email: r.email || null, contactId: null }],
    });
  }
  return out;
}

/**
 * Let the others know: each chosen offer is declined here, and one customer
 * update is put with the agent holding a "not this one" for every person on
 * those offers. It sits on the accepted application's file to read and send,
 * or ring instead. Idempotent per offer: a second press makes nothing new.
 */
export async function releaseOthers(p: {
  accepted: Application;
  listingId: string;
  offers: HeldOffer[];
  by: { name: string; email: string };
  paidAt: string | null;
}): Promise<{ declined: number; update: CustomerUpdate | null }> {
  const address = [p.accepted.property, p.accepted.locality].filter(Boolean).join(", ");
  const lead = p.accepted.applicants.find((a) => a.isPrimary)?.name ?? p.accepted.applicants[0]?.name ?? "The tenant";
  const book = await liveBook().catch(() => []);
  const homes = similarHomes(book, [{ locality: p.accepted.locality, rentMonthly: p.accepted.offerAmount }], { exclude: [p.listingId] });
  const homesList = homes.length
    ? homesListHtml(homes)
    : "Nothing close is on with us today, but new homes come on every week and I'll send you anything that fits.";

  const recipients: Omit<UpdateRecipient, "state">[] = [];
  for (const o of p.offers) {
    await recordDecision({
      ref: o.ref,
      listingId: p.listingId,
      decision: "declined",
      note: `Held until ${lead}'s holding fee was paid, then let go.`,
      by: p.by,
    });
    for (const person of o.people) {
      const email = (person.email ?? "").trim();
      recipients.push({
        role: "tenant",
        name: person.name,
        email: validEmail(email) ? email : null,
        contactId: person.contactId,
        emailId: "application-declined",
        vars: { firstName: firstName(person.name), address, reasonLine: "", homesList, agentName: p.by.name || "The Letting Experts" },
      });
    }
  }
  const update = recipients.length
    ? await createUpdate(
        {
          key: `released:${p.accepted.id}:${p.offers.map((o) => o.ref).sort().join(",")}`,
          applicationId: p.accepted.id,
          property: address,
          agentEmail: p.by.email,
          agentName: p.by.name,
          kind: "application_declined",
          headline: `Let the other applicants know it's gone`,
          why: `${lead} has paid the holding fee${p.paidAt ? ` (${new Date(p.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })})` : ""}, so the other offers on ${p.accepted.property} were let go.`,
          recipients,
        },
        { tellAgent: false }
      ).catch(() => null)
    : null;
  return { declined: p.offers.length, update };
}
