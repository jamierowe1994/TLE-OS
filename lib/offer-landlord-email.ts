import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { escapeHtml, renderTleEmail } from "@/lib/email/tle-emails";
import { sendAsAgent, type AgentSendResult } from "@/lib/send-as-agent";
import { getApplicationById } from "@/lib/applications";
import { homeOnMarket } from "@/lib/tenant-homes";
import { landlordForListing } from "@/lib/rex-landlord";
import { isTestId, testListing, testOffersForListing } from "@/lib/test-overlay";
import { testLandlord } from "@/lib/test-listing-answers";

/**
 * SEND THE OFFER TO THE LANDLORD (Howard, 8 Oct 2026, ticket 0268fdcc: "as
 * the agent or landlord, i received no email that an offer had been
 * received").
 *
 * James's rule since 2 Oct 2026 stands: nothing on a let writes to a landlord
 * or tenant by itself. So the landlord hears when the agent presses Send to
 * the landlord on the offer: the screen shows this email first (preview), the
 * agent adds a line of their own, and only Send sends it - from the agent's
 * own Outlook where connected, through sendAsAgent, so the "Email to
 * landlords and tenants" switch decides as it does for every other one-to-one
 * customer email. Each press is kept (os_offer_landlord_sends) and written on
 * the listing's notes.
 *
 * What goes: the home, the rent offered against the asking rent, the move-in
 * day and who would live there. Never income, work or contact details - the
 * landlord sees those on the application once they say yes.
 */

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const longDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export type OfferForLandlord = {
  ref: string;
  listingId: string;
  home: string;
  name: string;
  people: string[];
  amount: number | null;
  asking: number | null;
  moveIn: string | null;
  adults: number | null;
  children: number | null;
  pets: boolean | null;
  petsNote: string | null;
  test: boolean;
};

export type LandlordTo = { name: string; email: string | null; problem: string | null };

export class OfferEmailRefused extends Error {}

/** The offer, read from where it lives - never from the page. */
export async function offerForLandlord(ref: string, listingId: string): Promise<OfferForLandlord> {
  if (isTestId(listingId)) {
    const t = await testListing(listingId).catch(() => null);
    if (!t) throw new OfferEmailRefused("That test listing isn't there any more.");
    const o = (await testOffersForListing(Number(listingId))).find((x) => `test:${x.appId}` === ref);
    if (!o) throw new OfferEmailRefused("That offer isn't on this listing.");
    return {
      ref, listingId, home: t.name, name: o.applicantName, people: [o.applicantName], amount: o.amount, asking: t.rent || null,
      moveIn: o.moveIn || null, adults: o.adults ?? null, children: o.children ?? null, pets: o.pets ?? null, petsNote: null, test: true,
    };
  }
  const home = await homeOnMarket(listingId).catch(() => null);
  const asking = home ? (home.rentPeriod === "month" ? home.rent : home.rentPcm) || null : null;
  if (ref.startsWith("os:")) {
    const rows = await q<{ name: string; email: string; address: string | null; listing_id: string | null; payload: Record<string, unknown> }>(
      `SELECT name, email, address, listing_id, payload FROM os_tenant_viewing_responses WHERE id = $1 AND kind = 'offer'`,
      [ref.slice(3)]
    );
    const r = rows[0];
    if (!r || String(r.listing_id ?? "") !== listingId) throw new OfferEmailRefused("That offer isn't on this listing.");
    const p = (r.payload ?? {}) as { amount?: number; asking?: number; moveIn?: string; movingIn?: string[]; adults?: number; children?: number; pets?: boolean; petsNote?: string };
    const name = r.name || r.email;
    return {
      ref, listingId, home: home?.name || r.address || "your home", name,
      people: p.movingIn?.length ? p.movingIn : [name],
      amount: typeof p.amount === "number" ? p.amount : null,
      asking: asking ?? (typeof p.asking === "number" ? p.asking : null),
      moveIn: p.moveIn ?? null,
      adults: typeof p.adults === "number" ? p.adults : null,
      children: typeof p.children === "number" ? p.children : null,
      pets: typeof p.pets === "boolean" ? p.pets : null,
      petsNote: p.petsNote?.trim() || null,
      test: false,
    };
  }
  if (ref.startsWith("rex:")) {
    const a = await getApplicationById(ref.slice(4)).catch(() => null);
    if (!a || String(a.listingId ?? "") !== listingId) throw new OfferEmailRefused("That offer isn't on this listing.");
    const people = a.applicants.map((x) => x.name).filter(Boolean);
    return {
      ref, listingId, home: home?.name || a.property || "your home", name: people.join(" & ") || "The applicant",
      people, amount: a.offerAmount, asking, moveIn: a.startDate,
      adults: a.occupants != null && a.dependents != null ? Math.max(0, a.occupants - a.dependents) : people.length || null,
      children: a.dependents, pets: a.hasPets, petsNote: null, test: false,
    };
  }
  throw new OfferEmailRefused("Which offer?");
}

/** Who the email goes to: the listing's landlord, or why there is nobody. */
export async function landlordTo(listingId: string): Promise<LandlordTo> {
  if (isTestId(listingId)) {
    const t = await testLandlord(Number(listingId)).catch(() => null);
    const l = t?.landlord;
    return l?.email ? { name: l.name, email: l.email, problem: null } : { name: l?.name ?? "", email: null, problem: "This test file's landlord has no email address." };
  }
  const a = await landlordForListing(listingId).catch(() => null);
  if (!a || !a.ok) return { name: "", email: null, problem: "We couldn't look the landlord up just now. Try again in a minute, or ring them." };
  if (!a.landlord) return { name: "", email: null, problem: "There is no landlord on this home's record, so there is nobody to email. Ring them instead." };
  if (a.landlord.from === "record" || !a.landlord.email) return { name: a.landlord.name, email: null, problem: `There is no email address for ${a.landlord.name || "the landlord"}. Add one on their contact, or ring them.` };
  return { name: a.landlord.name, email: a.landlord.email, problem: null };
}

/** The household in a line: names, then how many, then pets. */
function whoLine(o: OfferForLandlord): string {
  const count = [
    o.adults != null ? `${o.adults} adult${o.adults === 1 ? "" : "s"}` : null,
    o.children ? `${o.children} child${o.children === 1 ? "" : "ren"}` : null,
  ].filter(Boolean).join(", ");
  const pets = o.pets === true ? (o.petsNote ? `with ${o.petsNote.charAt(0).toLowerCase()}${o.petsNote.slice(1)}` : "with pets") : o.pets === false ? "no pets" : null;
  const names = o.people.length ? o.people.join(" and ") : o.name;
  return [names, count, pets].filter(Boolean).join(", ");
}

/** The email as it will go, with the agent's own line in it. */
export function landlordOfferEmail(o: OfferForLandlord, to: LandlordTo, me: Pick<OsUser, "name" | "email">, line: string): { subject: string; html: string } {
  const agentName = me.name || "Your agent";
  const rent =
    o.amount != null
      ? `${gbp(o.amount)} a month${o.asking ? (o.amount >= o.asking ? ", the asking rent" : `, against the asking rent of ${gbp(o.asking)}`) : ""}`
      : "not given";
  const summary = [
    `<strong>Rent offered:</strong> ${escapeHtml(rent)}`,
    `<strong>Moving in:</strong> ${o.moveIn ? escapeHtml(longDay(o.moveIn)) : "to be agreed"}`,
    `<strong>Who would live there:</strong> ${escapeHtml(whoLine(o))}`,
  ].join("<br>");
  /* Typed by the agent, so escaped here (agentLine is an ...Line var, filled raw). */
  const agentLine = escapeHtml(line.trim()).replace(/\r?\n/g, "<br>");
  return renderTleEmail("landlord-offer", {
    firstName: to.name.trim().split(/\s+/)[0] || "there",
    address: o.home,
    agentName,
    amountWords: o.amount != null ? gbp(o.amount) : "An offer",
    moveInWords: o.moveIn ? new Date(`${o.moveIn.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" }) : "on a day to agree",
    summaryList: summary,
    agentLine,
  });
}

export type LandlordSend = { at: string; by: string; sent: boolean; to: string };

/** The sends so far, newest first, per offer ref. */
export async function landlordSends(refs: string[]): Promise<Map<string, LandlordSend>> {
  const out = new Map<string, LandlordSend>();
  if (!hasDb() || !refs.length) return out;
  const rows = await q<{ ref: string; to_email: string; by_name: string; sent: boolean; sent_at: Date }>(
    `SELECT DISTINCT ON (ref) ref, to_email, by_name, sent, sent_at FROM os_offer_landlord_sends
      WHERE ref = ANY($1::text[]) AND sent ORDER BY ref, sent_at DESC`,
    [refs]
  ).catch(() => []);
  for (const r of rows) out.set(r.ref, { at: new Date(r.sent_at).toISOString(), by: r.by_name, sent: r.sent, to: r.to_email });
  return out;
}

/** Send it, keep it, and say so on the listing. */
export async function sendLandlordOffer(me: OsUser, o: OfferForLandlord, to: LandlordTo, line: string): Promise<AgentSendResult> {
  if (!to.email) throw new OfferEmailRefused(to.problem ?? "There is no email address for the landlord.");
  const { subject, html } = landlordOfferEmail(o, to, me, line);
  const r = await sendAsAgent({ me, to: to.email, toName: to.name, subject, html });
  const at = new Date().toISOString();
  await q(
    `INSERT INTO os_offer_landlord_sends (id, ref, listing_id, to_email, subject, by_name, by_email, outcome, sent, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [randomUUID(), o.ref, o.listingId, to.email, subject, me.name || me.email, me.email, r.detail.slice(0, 300), r.sent, at]
  ).catch(() => null);
  const amount = o.amount != null ? ` (${gbp(o.amount)} a month)` : "";
  const note = r.sent
    ? `Sent ${o.name}'s offer${amount} to the landlord, ${to.name || to.email}, by email.${line.trim() ? `\n\nWith the line: ${line.trim()}` : ""}`
    : `Tried to send ${o.name}'s offer${amount} to the landlord, ${to.name || to.email}: ${r.detail}`;
  await q(
    `INSERT INTO os_notes (id, record_type, record_id, body, author_id, author_name, created_at) VALUES ($1, 'listing', $2, $3, $4, $5, $6)`,
    [randomUUID(), o.listingId, note.slice(0, 5000), me.id, me.name || me.email, at]
  ).catch(() => null);
  return r;
}
