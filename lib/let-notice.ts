import "server-only";
import { hasDb, q } from "@/lib/db";
import { leadsForListing } from "@/lib/lead-ledger";
import { fetchViewingsFor } from "@/lib/rex-viewings";
import { getApplications } from "@/lib/applications";
import { isInternalAddress } from "@/lib/email-policy";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
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
 */

export type LetNoticePerson = { email: string; name: string; why: "enquired" | "viewed" | "both" };

/** At most this many in one press. */
export const LET_NOTICE_CAP = 60;

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export async function letNoticeCandidates(listingId: string, propertyId: string | null): Promise<LetNoticePerson[]> {
  const [leads, viewings, apps, told] = await Promise.all([
    leadsForListing(listingId, 300).catch(() => []),
    fetchViewingsFor(listingId, propertyId).catch(() => []),
    getApplications(300).catch(() => []),
    hasDb() ? q<{ email: string }>(`SELECT email FROM os_let_notices WHERE listing_id = $1`, [listingId]).catch(() => []) : Promise.resolve([]),
  ]);
  const never = new Set<string>(told.map((r) => norm(r.email)));
  for (const a of apps.filter((x) => String(x.listingId ?? "") === listingId)) for (const p of a.applicants ?? []) if (p.email) never.add(norm(p.email));
  const now = Date.now();
  for (const v of viewings) if (!v.cancelled && new Date(v.startsAt).getTime() >= now) for (const c of v.contacts) if (c.email) never.add(norm(c.email));

  const out = new Map<string, LetNoticePerson>();
  const add = (email: string | null | undefined, name: string, why: "enquired" | "viewed") => {
    const e = norm(email);
    if (!e.includes("@") || never.has(e) || isInternalAddress(e)) return;
    const had = out.get(e);
    if (had) { if (had.why !== why) had.why = "both"; return; }
    out.set(e, { email: e, name: name.trim() || "there", why });
  };
  for (const l of leads) add(l.email, l.name, "enquired");
  for (const v of viewings) if (!v.cancelled && new Date(v.startsAt).getTime() < now) for (const c of v.contacts) add(c.email, c.name, "viewed");
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
      const mail = await renderTleEmailLive("listing-let-notice", { firstName: person.name.split(/\s+/)[0] || "there", address: p.address, agentName: p.me.name || "The Letting Experts" });
      const r = await sendAsAgent({ me: p.me, to: person.email, toName: person.name, subject: mail.subject, html: mail.html });
      if (r.sent) {
        sent++;
        await q(`INSERT INTO os_let_notices (listing_id, email, by_name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [p.listingId, person.email, p.me.name]).catch(() => null);
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
