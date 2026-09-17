import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { bookFor } from "@/lib/listings-cache";
import { findListing, liveBook, similarHomes } from "@/lib/tenant-matching";
import { hiddenLeadIds } from "@/lib/hidden-leads";
import { renderHomesThatFit, sendHomesThatFit, type FitHome } from "@/lib/homes-that-fit";
import { addTouch } from "@/lib/lead-touches";
import { publicOrigin } from "@/lib/origin";
import { record } from "@/lib/audit";
import { isOwner } from "@/lib/agent-words";
import type { OsListing } from "@/lib/rex-listings";

/**
 * MAIL THE DATABASE, for real (17 Sep 2026).
 *
 *   GET  ?id=843312                        who this home suits, and why
 *   POST { id, emails, preview? }          Homes That Fit to each of them
 *
 * The button used to list the demo book (olivia.clark@btinternet.com and
 * friends) and say "Sent to 3 applicants" with nothing sent. Now the people
 * are the lead ledger's tenant enquiries, and the match is the one the
 * automatic tenant emails already use (lib/tenant-matching): somebody who
 * asked about a home in the same postcode district or town, at a rent within
 * a fifth of this one. The OS holds no budgets, so the home they asked about
 * is the honest stand-in for what they want.
 *
 * ── What keeps it from becoming a blast ────────────────────────────────────
 *
 * Enquiries from the last 90 days only, one row per email address, nobody
 * hidden from the board, nobody who already enquired about this home or was
 * already sent it. The POST works the match out again and writes only to
 * addresses that are in it, so the button cannot be pointed at anyone else.
 * At most 50 a press. Every send goes through sendAsAgent, so the customer
 * email switch decides whether anything leaves at all.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const DAYS = 90;
const SHOW = 200;
const PER_PRESS = 50;

type LeadRow = { id: string; name: string; email: string; listing_id: string; received_at: Date | null };

type EmailOutPerson = {
  email: string;
  name: string;
  leadId: string;
  askedAbout: string;
  askedRent: number | null;
  askedPer: string;
  askedAt: string | null;
  why: string[];
};

const per = (l: Pick<OsListing, "rentPeriod">) => (l.rentPeriod === "week" ? "per week" : "pcm");
const town = (l: OsListing) => (l.locality ?? "").split(",")[0].replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, "").trim().toLowerCase();
const district = (p: string | null) => (p ?? "").toUpperCase().replace(/\s+/g, "").slice(0, -3);

async function matchFor(id: string): Promise<{ home: OsListing | null; people: EmailOutPerson[]; alreadySent: number }> {
  const live = await liveBook();
  const home = findListing(live, id);
  if (!home || !hasDb()) return { home, people: [], alreadySent: 0 };

  /* The whole current book for the homes they asked about: most enquiries
     are on homes that have since gone let agreed. */
  const book = (await bookFor(null).catch(() => null))?.listings ?? live;
  const [leads, hidden, sent] = await Promise.all([
    q<LeadRow>(
      `SELECT id, name, email, listing_id, received_at FROM os_leads
        WHERE enquiry = 'Letting' AND email IS NOT NULL AND email <> '' AND listing_id IS NOT NULL
          AND stage NOT IN ('Not proceeding', 'Closed')
          AND received_at > NOW() - make_interval(days => $1)
        ORDER BY received_at DESC NULLS LAST`,
      [DAYS]
    ),
    hiddenLeadIds(),
    q<{ sent_to: string }>(
      `SELECT DISTINCT lower(sent_to) AS sent_to FROM os_tenant_email_log
        WHERE email_id = 'tenant-matches' AND outcome = 'sent' AND meta->'homes' @> $1::jsonb`,
      [JSON.stringify([{ id: String(home.id) }])]
    ).catch(() => []),
  ]);
  const sentTo = new Set(sent.map((s) => s.sent_to));
  /* Anyone who asked about THIS home knows about it already. */
  const askedHere = new Set(leads.filter((l) => l.listing_id === String(home.id)).map((l) => l.email.trim().toLowerCase()));

  const seen = new Set<string>();
  const people: EmailOutPerson[] = [];
  let alreadySent = 0;
  for (const l of leads) {
    const email = l.email.trim().toLowerCase();
    if (seen.has(email) || hidden.has(l.id) || askedHere.has(email)) continue;
    const asked = findListing(book, l.listing_id);
    /* No rent on the home they asked about, no way to say it is similar. */
    if (!asked || !(asked.rentMonthly && asked.rentMonthly > 0)) continue;
    if (!similarHomes([home], [asked], { limit: 1 }).length) continue;
    seen.add(email);
    if (sentTo.has(email)) {
      alreadySent++;
      continue;
    }
    const why = [
      asked.postcode && home.postcode && district(asked.postcode) === district(home.postcode) ? "Same postcode area" : town(asked) === town(home) ? "Same town" : "Nearby",
      "Similar rent",
    ];
    people.push({
      email,
      name: l.name,
      leadId: l.id,
      askedAbout: asked.name,
      askedRent: asked.rent,
      askedPer: per(asked),
      askedAt: l.received_at ? new Date(l.received_at).toISOString() : null,
      why,
    });
  }
  return { home, people, alreadySent };
}

function refuseViewingAs(req: NextRequest): NextResponse | null {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
    return null;
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, said: e.message }, { status: 423 });
    throw e;
  }
}

const homeFor = (h: OsListing): FitHome => ({ id: String(h.id), name: h.name, locality: h.locality, rent: h.rent, rentPeriod: h.rentPeriod });

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, said: "Which listing?" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: false, said: "The lead book is not on this environment, so there is nobody to match." }, { status: 503 });

  try {
    const { home, people, alreadySent } = await matchFor(id);
    if (!home) {
      return NextResponse.json({ ok: false, notLive: true, said: "Put it live on the portals first. Only a home people can apply for is sent out." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, days: DAYS, alreadySent, total: people.length, people: people.slice(0, SHOW), perPress: PER_PRESS });
  } catch {
    return NextResponse.json({ ok: false, said: "The matches did not load. Try again in a minute." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const refused = refuseViewingAs(req);
  if (refused) return refused;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; emails?: unknown; preview?: unknown };
  const id = typeof b.id === "string" || typeof b.id === "number" ? String(b.id) : "";
  const wanted = new Set((Array.isArray(b.emails) ? b.emails : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean));
  if (!id || !wanted.size) return NextResponse.json({ ok: false, said: "Pick at least one person." }, { status: 400 });

  const { home, people } = await matchFor(id);
  if (!home) return NextResponse.json({ ok: false, said: "Put it live on the portals first. Only a home people can apply for is sent out." }, { status: 409 });
  const to = people.filter((p) => wanted.has(p.email));

  if (b.preview === true) {
    const { subject, html } = await renderHomesThatFit({
      name: to[0]?.name ?? "",
      homes: [homeFor(home)],
      agentName: actor.name || "The Letting Experts",
      link: `${publicOrigin(req)}/tenant/welcome`,
    });
    return NextResponse.json({ ok: true, subject, html });
  }

  if (!to.length) return NextResponse.json({ ok: false, said: "None of those people match this home any more, so nothing was sent." }, { status: 409 });
  if (to.length > PER_PRESS) {
    return NextResponse.json({ ok: false, said: `That is ${to.length} people. Send ${PER_PRESS} at most at a time.` }, { status: 400 });
  }

  let sent = 0;
  let lastRefusal = "";
  const failed: string[] = [];
  for (const p of to) {
    const r = await sendHomesThatFit({ me: actor, name: p.name, to: p.email, homes: [homeFor(home)], origin: publicOrigin(req) });
    if (r.sent) {
      sent++;
      await addTouch({
        leadId: p.leadId,
        kind: "email",
        outcome: "sent",
        body: `Sent ${home.name} from Mail the database.`,
        byId: actor.id,
        byName: actor.name,
      }).catch(() => null);
    } else {
      failed.push(p.email);
      lastRefusal = r.reason === "switched_off" && !isOwner(actor) ? "Emailing tenants is not switched on yet." : r.detail;
      /* Switched off is switched off for everybody: stop, don't try 49 more. */
      if (r.reason === "switched_off") break;
    }
  }

  await record({
    kind: "listing_edited",
    actorId: actor.id,
    actorEmail: actor.email,
    detail: `mail the database: ${home.name} (${home.id}) sent to ${sent} of ${to.length}`,
  }).catch(() => null);

  const said =
    sent === to.length
      ? `Sent to ${sent} ${sent === 1 ? "person" : "people"}, each on their own, and logged on their lead.`
      : sent
        ? `Sent to ${sent} of ${to.length}. The rest did not go: ${lastRefusal}`
        : `Nothing was sent. ${lastRefusal}`;
  return NextResponse.json({ ok: sent > 0, sent, failed, said }, { status: sent > 0 ? 200 : 502 });
}
