import "server-only";
import { hasDb, q } from "@/lib/db";
import { leadsForListing } from "@/lib/lead-ledger";
import { fetchViewingsFor } from "@/lib/rex-viewings";
import { getApplications } from "@/lib/applications";
import { isInternalAddress } from "@/lib/email-policy";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { payloadSignatureOk, signPayload } from "@/lib/auth";
import { addTouch } from "@/lib/lead-touches";
import type { OsUser } from "@/lib/users";

/**
 * "It's been let" to everyone else who asked about a home (Sean McMahon and
 * Dan Richards, 20 Oct 2026: when the advert comes down, let the other
 * enquirers and viewers know). Part of Take It Offline, and only when the
 * agent ticks it: James, "I don't want to be sending out hundreds of emails
 * at a time".
 *
 * Who is in: anyone who enquired on the listing, and anyone who has already
 * viewed it, with an email. Who is never in: anybody on an application or
 * offer for the home (the accepted one is the new tenant; the others get
 * their own "not this one"), anybody with a viewing still to come (that is
 * called off with its own email), our own people, and anybody already told.
 * The list is worked out here, on the server, both times: the screen only
 * says which of these people to leave out.
 *
 * NOTIFY ENQUIRIES (James, 22 Oct 2026): the same send, from its own button
 * on the listing's Enquiries tab once the home is let. The email carries
 * Show Me Other Homes - a link of their own (moreHomesLink) that opens the
 * homes near them with no account needed, and the first press is a line on
 * their lead and in the sending agent's bell (recordAsked).
 */

export type LetNoticePerson = { email: string; name: string; why: "enquired" | "viewed" | "both"; leadId: string | null };

/** Somebody already told about this home, and whether they asked for more. */
export type LetNoticeTold = { email: string; name: string; at: string; by: string; askedAt: string | null };

/** At most this many in one press. */
export const LET_NOTICE_CAP = 60;

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
/** "Eliza  TONGE" and "eliza tonge" are one person; a lone first name is too thin to match on. */
const personName = (n: string | null | undefined) => {
  const t = (n ?? "").toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
  return t.includes(" ") ? t : "";
};
/** The last ten digits, so 07700 900123 and +44 7700 900123 match. */
const phoneKey = (p: string | null | undefined) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

export async function letNoticeCandidates(listingId: string, propertyId: string | null): Promise<LetNoticePerson[]> {
  const [leads, viewings, apps, told, osOffers] = await Promise.all([
    leadsForListing(listingId, 300).catch(() => []),
    fetchViewingsFor(listingId, propertyId).catch(() => []),
    getApplications(300).catch(() => []),
    hasDb() ? q<{ email: string }>(`SELECT email FROM os_let_notices WHERE listing_id = $1`, [listingId]).catch(() => []) : Promise.resolve([]),
    /* Offers made in the OS (the offer link, Make New Offer) are not REX
       applications: whoever made one hears from their own offer, not this. */
    hasDb()
      ? q<{ email: string; name: string }>(`SELECT email, name FROM os_tenant_viewing_responses WHERE listing_id = $1 AND kind = 'offer'`, [listingId]).catch(() => [])
      : Promise.resolve([]),
  ]);
  const never = new Set<string>(told.map((r) => norm(r.email)));
  /* The same person often enquires from one address and offers from another
     (Eliza Tonge at 23 Carlton Street, 22 Oct 2026), so anybody on an offer
     is matched on their name and phone as well. */
  const offerNames = new Set<string>();
  const offerPhones = new Set<string>();
  for (const a of apps.filter((x) => String(x.listingId ?? "") === listingId)) {
    for (const p of a.applicants ?? []) {
      if (p.email) never.add(norm(p.email));
      if (personName(p.name)) offerNames.add(personName(p.name));
      if (phoneKey(p.phone)) offerPhones.add(phoneKey(p.phone));
    }
  }
  for (const o of osOffers) {
    if (o.email) never.add(norm(o.email));
    if (personName(o.name)) offerNames.add(personName(o.name));
  }
  const onAnOffer = (name: string, phone: string | null | undefined) =>
    (personName(name) !== "" && offerNames.has(personName(name))) || (phoneKey(phone) !== "" && offerPhones.has(phoneKey(phone)));
  const now = Date.now();
  for (const v of viewings) if (!v.cancelled && new Date(v.startsAt).getTime() >= now) for (const c of v.contacts) if (c.email) never.add(norm(c.email));

  const out = new Map<string, LetNoticePerson>();
  const add = (email: string | null | undefined, name: string, why: "enquired" | "viewed", leadId: string | null, phone?: string | null) => {
    const e = norm(email);
    if (!e.includes("@") || never.has(e) || isInternalAddress(e) || onAnOffer(name, phone)) return;
    const had = out.get(e);
    if (had) { if (had.why !== why) had.why = "both"; had.leadId ??= leadId; return; }
    out.set(e, { email: e, name: name.trim() || "there", why, leadId });
  };
  for (const l of leads) add(l.email, l.name, "enquired", l.id || null, l.phone);
  for (const v of viewings) if (!v.cancelled && new Date(v.startsAt).getTime() < now) for (const c of v.contacts) add(c.email, c.name, "viewed", null, c.phone);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Send to the chosen ones, from the agent. One sentence back for the screen. */
export async function sendLetNotices(p: { me: OsUser; listingId: string; propertyId: string | null; address: string; emails: string[] }): Promise<{ sent: number; failed: number; said: string }> {
  const want = new Set(p.emails.map(norm));
  const people = (await letNoticeCandidates(p.listingId, p.propertyId)).filter((x) => want.has(x.email)).slice(0, LET_NOTICE_CAP);
  if (!people.length) return { sent: 0, failed: 0, said: "Nobody to tell." };
  let sent = 0;
  let failed = 0;
  let why = "";
  for (const person of people) {
    try {
      const mail = await letNoticeEmail({ me: p.me, listingId: p.listingId, address: p.address, person });
      const r = await sendAsAgent({ me: p.me, to: person.email, toName: person.name, subject: mail.subject, html: mail.html });
      if (r.sent) {
        sent++;
        await q(
          `INSERT INTO os_let_notices (listing_id, email, by_name, by_email, name, lead_id, address) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [p.listingId, person.email, p.me.name, p.me.email, person.name, person.leadId, p.address]
        ).catch(() => null);
      } else {
        failed++;
        why ||= r.detail;
      }
    } catch (e) {
      failed++;
      why ||= e instanceof Error ? e.message : "it failed";
    }
  }
  const said = sent && !failed ? `${sent} ${sent === 1 ? "person" : "people"} told it's been let.` : sent ? `${sent} told, ${failed} not: ${why}` : `Nobody was emailed: ${why}`;
  return { sent, failed, said };
}

/** The email one person gets, as they will get it: the screen's preview and the send. */
export async function letNoticeEmail(p: { me: OsUser; listingId: string; address: string; person: Pick<LetNoticePerson, "email" | "name"> }): Promise<{ subject: string; html: string }> {
  return renderTleEmailLive("listing-let-notice", {
    firstName: p.person.name.split(/\s+/)[0] || "there",
    address: p.address,
    agentName: p.me.name || "The Letting Experts",
    homesUrl: moreHomesLink(p.listingId, p.person.email),
  });
}

/** Everyone already told about this home, newest first. */
export async function letNoticesTold(listingId: string): Promise<LetNoticeTold[]> {
  if (!hasDb()) return [];
  const rows = await q<{ email: string; name: string | null; at: Date; by_name: string; asked_at: Date | null }>(
    `SELECT email, name, at, by_name, asked_at FROM os_let_notices WHERE listing_id = $1 ORDER BY at DESC LIMIT 300`,
    [listingId]
  ).catch(() => []);
  return rows.map((r) => ({
    email: r.email,
    name: r.name || r.email,
    at: new Date(r.at).toISOString(),
    by: r.by_name,
    askedAt: r.asked_at ? new Date(r.asked_at).toISOString() : null,
  }));
}

/* ── Show Me Other Homes ──────────────────────────────────────────────────── */

const ORIGIN = () => (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

/**
 * Their own link: the listing and their email, signed, so the page knows who
 * pressed it without asking them to sign up or sign in. It opens homes and
 * nothing else - no passport, no account, nothing of theirs to read.
 */
export function moreHomesLink(listingId: string, email: string): string {
  const data = Buffer.from(`${listingId}|${norm(email)}`).toString("base64url");
  return `${ORIGIN()}/tenant/more-homes/${data}.${signPayload(`more-homes.${data}`)}`;
}

export function readMoreHomesToken(token: string): { listingId: string; email: string } | null {
  const [data, sig] = decodeURIComponent(token).split(".");
  if (!data || !payloadSignatureOk(`more-homes.${data}`, sig)) return null;
  const [listingId, email] = Buffer.from(data, "base64url").toString("utf8").split("|");
  return listingId && email?.includes("@") ? { listingId, email } : null;
}

/** What the page needs about the person and the home they were told about. */
export async function letNoticeFor(listingId: string, email: string): Promise<{ name: string; address: string; byName: string } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ name: string | null; address: string | null; by_name: string }>(
    `SELECT name, address, by_name FROM os_let_notices WHERE listing_id = $1 AND email = $2`,
    [listingId, norm(email)]
  ).catch(() => []);
  const r = rows[0];
  return r ? { name: r.name || "", address: r.address || "", byName: r.by_name } : null;
}

/**
 * They pressed Show Me Other Homes. Every press is counted; the first one is
 * a note on their lead (when they came in as an enquiry) and a line in the
 * sending agent's bell (lib/notifications reads asked_at) - somebody still
 * looking is worth a call.
 */
export async function recordAsked(listingId: string, email: string): Promise<void> {
  if (!hasDb()) return;
  const rows = await q<{ first: boolean; lead_id: string | null; address: string | null; name: string | null }>(
    `UPDATE os_let_notices n SET asked_n = n.asked_n + 1, asked_at = COALESCE(n.asked_at, NOW())
      FROM (SELECT asked_at FROM os_let_notices WHERE listing_id = $1 AND email = $2) was
     WHERE n.listing_id = $1 AND n.email = $2
     RETURNING was.asked_at IS NULL AS first, n.lead_id, n.address, n.name`,
    [listingId, norm(email)]
  ).catch(() => []);
  const r = rows[0];
  if (!r?.first || !r.lead_id) return;
  await addTouch({
    leadId: r.lead_id,
    kind: "note",
    outcome: null,
    body: `Pressed Show Me Other Homes in the email saying ${r.address || "the home"} is let. Still looking.`,
    byId: null,
    byName: r.name || "The tenant",
  }).catch(() => null);
}
