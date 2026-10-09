import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { mayOfferOn, NOT_YOURS } from "@/lib/offer-access";
import { assembled } from "@/lib/applications-board";
import { rexConfigured } from "@/lib/rex";
import { isTestId, testOffersForListing } from "@/lib/test-overlay";
import { decisionsFor, decisionsForListing } from "@/lib/offer-decisions";

/**
 * ONE LISTING'S OFFERS (7 Oct 2026).
 *
 * James: an offer is not an application until it is accepted - the home is
 * still taking viewings until then - so every offer on a home lives here, on
 * its listing, with the agent's Accept and Decline. Three places they come
 * from, one list:
 *
 *   os    saved in the OS: put forward by an agent, made on the offer link
 *         or the application form, or from the tenant's own area
 *   rex   a TenancyApplication in REX (an offer, in REX's words), from the
 *         same board read the Applications page uses, in the same scope
 *   test  a test file's offer, on a test listing
 *
 * Status: open, accepted or declined. REX's own accepted or unsuccessful wins
 * over the OS decision; a REX application the board calls closed (moved in,
 * home let, listing withdrawn) is shown as such. Newest first. Read only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type ListingOffer = {
  ref: string;
  kind: "os" | "rex" | "test";
  /** The application id, for a REX or test offer: what the drawer and its buttons act on. */
  appId: string | null;
  name: string;
  amount: number | null;
  moveIn: string | null;
  at: string | null;
  /** How it came in, in words. */
  via: string;
  status: "open" | "accepted" | "declined";
  /** Who decided and when, or REX's word for it. */
  decided: string | null;
  /** Decided in the OS, so Undo can open it again. */
  undoable: boolean;
  /** Where it opens. */
  href: string;
};

type OsRow = {
  id: string;
  name: string;
  email: string;
  payload: { amount?: number; moveIn?: string; recordedBy?: { name?: string }; source?: string; via?: string };
  created_at: Date;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const newestFirst = (a: ListingOffer, b: ListingOffer) => String(b.at ?? "").localeCompare(String(a.at ?? ""));

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!/^-?\d+$/.test(listingId)) return NextResponse.json({ ok: false, error: "Which listing?", offers: [] }, { status: 400 });

  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first.", offers: [] }, { status: 401 });
  /* The office on any listing, an agent on their own (lib/offer-access). */
  if (!(await mayOfferOn(req, who, listingId))) return NextResponse.json({ ok: false, error: NOT_YOURS, offers: [] }, { status: 403 });

  try {
    const offers: ListingOffer[] = [];

    /* A test listing has only its test file's offers. */
    if (isTestId(listingId)) {
      for (const o of await testOffersForListing(Number(listingId))) {
        offers.push({
          ref: `test:${o.appId}`,
          kind: "test",
          appId: o.appId,
          name: o.applicantName,
          amount: o.amount,
          moveIn: o.moveIn || null,
          at: o.received,
          via: "Test offer",
          status: o.status === "accepted" ? "accepted" : o.status === "unsuccessful" ? "declined" : "open",
          decided: o.status === "accepted" ? `Accepted${o.accepted ? ` ${day(o.accepted)}` : ""}` : o.status === "unsuccessful" ? "Declined" : null,
          undoable: false,
          href: `/applications?open=${encodeURIComponent(o.appId)}`,
        });
      }
      return NextResponse.json({ ok: true, offers: offers.sort(newestFirst) });
    }

    const [osRows, decided, rex] = await Promise.all([
      q<OsRow>(
        `SELECT id, name, email, payload, created_at FROM os_tenant_viewing_responses
          WHERE listing_id = $1 AND kind = 'offer' ORDER BY created_at DESC LIMIT 50`,
        [listingId]
      ),
      decisionsForListing(listingId),
      (async () => {
        if (!rexConfigured()) return [];
        const scope = await scopeForWho(req, who);
        if (scope.unlinked) return [];
        const { held } = await assembled(scope.rexUserId);
        const { applications, closed } = held.value;
        return applications
          .filter((a) => String(a.listingId ?? "") === listingId)
          .map((a) => ({ ...a, closed: closed.get(a.id) ?? null }));
      })().catch(() => []),
    ]);

    for (const r of osRows) {
      const d = decided.get(`os:${r.id}`) ?? null;
      const p = r.payload ?? {};
      offers.push({
        ref: `os:${r.id}`,
        kind: "os",
        appId: null,
        name: r.name || r.email,
        amount: typeof p.amount === "number" ? p.amount : null,
        moveIn: p.moveIn ?? null,
        at: new Date(r.created_at).toISOString(),
        via: p.recordedBy?.name
          ? `Put forward by ${p.recordedBy.name}`
          : p.via === "Offer link"
            ? "From the offer link"
            : p.source === "application-form"
              ? "From the application form"
              : p.source === "viewing-feedback"
                ? "From their viewing feedback"
                : "From their tenant area",
        status: d ? d.decision : "open",
        decided: d ? `${d.decision === "accepted" ? "Accepted" : "Declined"} by ${d.by} ${day(d.at)}` : null,
        undoable: Boolean(d),
        href: `/offers/${encodeURIComponent(r.id)}`,
      });
    }

    /* REX's own decision first; the OS's where REX has none yet. */
    const rexDecided = await decisionsFor(rex.map((a) => `rex:${a.id}`));
    for (const a of rex) {
      const d = rexDecided.get(`rex:${a.id}`) ?? null;
      const status: ListingOffer["status"] =
        a.status === "accepted" ? "accepted" : a.status === "unsuccessful" || a.closed ? "declined" : d ? d.decision : "open";
      offers.push({
        ref: `rex:${a.id}`,
        kind: "rex",
        appId: a.id,
        name: a.applicants.map((p) => p.name).filter(Boolean).join(" & ") || "Applicant not named",
        amount: a.offerAmount,
        moveIn: a.startDate,
        at: a.dateReceived,
        via: "In REX",
        status,
        decided:
          a.status === "accepted"
            ? `Accepted in REX${a.dateAccepted ? ` ${day(a.dateAccepted)}` : ""}`
            : a.status === "unsuccessful"
              ? "Unsuccessful in REX"
              : a.closed
                ? a.closed
                : d
                  ? `${d.decision === "accepted" ? "Accepted" : "Declined"} by ${d.by} ${day(d.at)} - REX not updated yet`
                  : null,
        undoable: Boolean(d) && a.status !== "accepted" && a.status !== "unsuccessful" && !a.closed,
        href: `/applications?open=${encodeURIComponent(a.id)}`,
      });
    }

    return NextResponse.json({ ok: true, offers: offers.sort(newestFirst) });
  } catch (e) {
    console.error("listing offers failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't read the offers.", offers: [] }, { status: 500 });
  }
}
