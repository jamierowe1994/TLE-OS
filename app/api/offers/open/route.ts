import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { offerListingIds } from "@/lib/offer-access";
import { hasDb, q } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { assembled } from "@/lib/applications-board";
import { rexConfigured } from "@/lib/rex";
import { testApplicationsFor } from "@/lib/test-overlay";
import { decisionsFor } from "@/lib/offer-decisions";
import { landlordSends, type LandlordSend } from "@/lib/offer-landlord-email";
import { countersFor, type OfferCounter } from "@/lib/offer-counters";

/**
 * GET /api/offers/open -> { byListing: { [listingId]: n }, total, rows }
 *
 * The offers still waiting on a decision, per listing (7 Oct 2026). Offers
 * live on their listing until accepted (James), so the Listings board's
 * "Offers in" tab and the Applications page's "Open offers" count read this.
 *
 * Open = not accepted or declined, here or in REX, and not closed: REX
 * applications in the same scope as the board, offers saved in the OS with
 * no decision, and the tester's own test offers still received. Read only.
 *
 * ONE ROW PER OFFER (Howard, 8 Oct 2026, ticket 84a81dae: "there is no
 * offers tab/screen showing me all the offers i need to handle"). `rows` is
 * every open offer as its own line - the home, who from, the rent, move-in,
 * when it came in, and where it stands (open, held behind an accepted offer,
 * sent to the landlord) - for the Offers in list on Listings. Same scope as
 * the counts: an agent their own listings, the office and owners everything.
 */

export type OpenOfferRow = {
  ref: string;
  kind: "os" | "rex" | "test";
  listingId: string;
  /** The home as the offer holds it; the screen prefers its own book's name. */
  home: string;
  name: string;
  amount: number | null;
  moveIn: string | null;
  at: string | null;
  /** How it came in, in words. */
  via: string;
  /** Another offer on the same home is accepted, so this one waits. */
  held: boolean;
  landlordSent: LandlordSend | null;
  /** The newest counter, when there has been one: amount above is then its figure (16 Oct 2026). */
  countered: { side: "landlord" | "tenant"; offered: number | null } | null;
};

type OsOpen = {
  id: string;
  name: string;
  email: string;
  address: string | null;
  listing_id: string;
  created_at: Date;
  payload: { amount?: number; moveIn?: string; recordedBy?: { name?: string }; source?: string; via?: string };
};

function osVia(p: OsOpen["payload"]): string {
  if (p.recordedBy?.name) return `Put forward by ${p.recordedBy.name}`;
  if (p.via === "Offer link") return "From the offer link";
  if (p.source === "application-form") return "From the application form";
  if (p.source === "viewing-feedback") return "From their viewing feedback";
  return "From their tenant area";
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const byListing: Record<string, number> = {};
  const add = (id: unknown) => {
    const k = String(id ?? "");
    if (k) byListing[k] = (byListing[k] ?? 0) + 1;
  };

  try {
    const [rex, os, tests] = await Promise.all([
      (async () => {
        if (!rexConfigured()) return [];
        const scope = await scopeForWho(req, who);
        if (scope.unlinked) return [];
        const { held } = await assembled(scope.rexUserId);
        const { applications, closed } = held.value;
        return applications.filter((a) => (a.status === "received" || a.status === "communicated" || a.status === "accepted") && !closed.get(a.id));
      })().catch(() => []),
      hasDb()
        ? q<OsOpen>(
            `SELECT r.id, r.name, r.email, r.address, r.listing_id, r.created_at, r.payload FROM os_tenant_viewing_responses r
              WHERE r.kind = 'offer' AND r.listing_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM os_offer_decisions d WHERE d.ref = 'os:' || r.id)`
          ).catch(() => [])
        : Promise.resolve([] as OsOpen[]),
      testApplicationsFor(actor.email).catch(() => []),
    ]);
    /* An agent counts only the offers saved on their own listings; the REX
       half is scoped already, and test offers are their own. */
    const mine = await offerListingIds(req, who);
    const decided = await decisionsFor(rex.map((a) => `rex:${a.id}`));
    const isOpen = (s: string) => s === "received" || s === "communicated";
    const rows: Omit<OpenOfferRow, "held" | "landlordSent" | "countered">[] = [];
    const named = (a: { applicants: { name: string }[] }) => a.applicants.map((p) => p.name).filter(Boolean).join(" & ") || "Applicant not named";
    for (const a of rex) {
      if (!isOpen(a.status) || decided.has(`rex:${a.id}`) || a.listingId == null) continue;
      add(a.listingId);
      rows.push({ ref: `rex:${a.id}`, kind: "rex", listingId: String(a.listingId), home: a.property, name: named(a), amount: a.offerAmount, moveIn: a.startDate, at: a.dateReceived, via: "Application" });
    }
    for (const r of os) {
      if (mine && !mine.has(String(r.listing_id))) continue;
      add(r.listing_id);
      const p = r.payload ?? {};
      rows.push({
        ref: `os:${r.id}`, kind: "os", listingId: String(r.listing_id), home: r.address ?? "", name: r.name || r.email,
        amount: typeof p.amount === "number" ? p.amount : null, moveIn: p.moveIn ?? null, at: new Date(r.created_at).toISOString(), via: osVia(p),
      });
    }
    for (const t of tests) {
      if (!isOpen(t.status) || t.listingId == null) continue;
      add(t.listingId);
      rows.push({ ref: `test:${t.id}`, kind: "test", listingId: String(t.listingId), home: t.property, name: named(t), amount: t.offerAmount, moveIn: t.startDate, at: t.dateReceived, via: "Test offer" });
    }

    /* Held: the home already has an accepted offer, here, in REX or on the test file. */
    const ids = [...new Set(rows.map((r) => r.listingId))];
    const acceptedHere = ids.length
      ? await q<{ listing_id: string }>(`SELECT DISTINCT listing_id FROM os_offer_decisions WHERE decision = 'accepted' AND listing_id = ANY($1::text[])`, [ids]).catch(() => [])
      : [];
    const taken = new Set<string>(acceptedHere.map((r) => String(r.listing_id)));
    for (const a of rex) if (a.status === "accepted" && a.listingId != null) taken.add(String(a.listingId));
    for (const t of tests) if (t.status === "accepted" && t.listingId != null) taken.add(String(t.listingId));
    const [sent, counters] = await Promise.all([
      landlordSends(rows.map((r) => r.ref)).catch(() => new Map<string, LandlordSend>()),
      countersFor(rows.map((r) => r.ref)).catch(() => new Map<string, OfferCounter[]>()),
    ]);
    const out: OpenOfferRow[] = rows
      .map((r) => {
        const list = counters.get(r.ref) ?? [];
        const last = list[list.length - 1] ?? null;
        return {
          ...r,
          held: taken.has(r.listingId),
          landlordSent: sent.get(r.ref) ?? null,
          amount: last ? last.amount : r.amount,
          moveIn: last?.moveIn ?? r.moveIn,
          countered: last ? { side: last.side, offered: r.amount } : null,
        };
      })
      .sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));

    const total = Object.values(byListing).reduce((n, x) => n + x, 0);
    return NextResponse.json({ ok: true, byListing, total, rows: out });
  } catch (e) {
    console.error("open offers failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't count the offers." }, { status: 500 });
  }
}
