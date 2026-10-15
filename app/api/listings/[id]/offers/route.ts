import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { mayOfferOn, NOT_YOURS } from "@/lib/offer-access";
import { assembled } from "@/lib/applications-board";
import { rexConfigured } from "@/lib/rex";
import { isTestId, testOffersForListing } from "@/lib/test-overlay";
import { decisionsFor, decisionsForListing } from "@/lib/offer-decisions";
import { offerPeople, toOfferParts, type OfferPerson } from "@/lib/offer-people";
import type { OfferPart } from "@/lib/offer-people-shape";
import { landlordSends, type LandlordSend } from "@/lib/offer-landlord-email";

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
  /** What the offer says, for opening it on the listing (12 Oct 2026). */
  detail: OfferDetail;
  /** When the agent last sent it to the landlord (ticket 0268fdcc, 15 Oct 2026). */
  landlordSent?: LandlordSend | null;
};

export type OfferDetail = {
  /** The other adults moving in, each with their own part (14 Oct 2026). */
  parts?: OfferPart[];
  email: string | null;
  phone: string | null;
  /** Everyone named on it, the lead first. */
  people: string[];
  adults: number | null;
  children: number | null;
  pets: boolean | null;
  petsNote: string | null;
  work: string | null;
  guarantor: boolean | null;
  /** A year, the household's. */
  income: number | null;
  /** REX's affordability, rent against income. */
  affordability: number | null;
  works: string[];
  note: string | null;
};

const NO_DETAIL: OfferDetail = { email: null, phone: null, people: [], adults: null, children: null, pets: null, petsNote: null, work: null, guarantor: null, income: null, affordability: null, works: [], note: null };

type OsRow = {
  id: string;
  name: string;
  email: string;
  payload: {
    amount?: number; moveIn?: string; recordedBy?: { name?: string }; source?: string; via?: string;
    movingIn?: string[]; adults?: number; children?: number; pets?: boolean; petsNote?: string; works?: unknown[]; note?: string; householdIncome?: number;
    passport?: { guarantor?: boolean; applicantType?: string; workHours?: string; phone?: string; mobile?: string };
  };
  created_at: Date;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const newestFirst = (a: ListingOffer, b: ListingOffer) => String(b.at ?? "").localeCompare(String(a.at ?? ""));

/** Each offer with when it last went to the landlord. */
async function withSends(offers: ListingOffer[]): Promise<ListingOffer[]> {
  const sent = await landlordSends(offers.map((o) => o.ref)).catch(() => new Map<string, LandlordSend>());
  return offers.map((o) => ({ ...o, landlordSent: sent.get(o.ref) ?? null }));
}

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
          detail: { ...NO_DETAIL, people: [o.applicantName] },
        });
      }
      return NextResponse.json({ ok: true, offers: (await withSends(offers)).sort(newestFirst) });
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

    /* Every other adult's part, for the offers made in the OS. */
    const partsBy = await offerPeople(osRows.map((r) => r.id)).catch(() => new Map<string, OfferPerson[]>());
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
        detail: {
          parts: toOfferParts(partsBy.get(r.id) ?? [], r.name || ""),
          email: r.email || null,
          phone: p.passport?.mobile || p.passport?.phone || null,
          people: (p.movingIn?.length ? p.movingIn : [r.name || r.email]).filter(Boolean),
          adults: typeof p.adults === "number" ? p.adults : null,
          children: typeof p.children === "number" ? p.children : null,
          pets: typeof p.pets === "boolean" ? p.pets : null,
          petsNote: p.petsNote?.trim() || null,
          work: [p.passport?.applicantType, p.passport?.workHours].filter(Boolean).join(", ") || null,
          guarantor: typeof p.passport?.guarantor === "boolean" ? p.passport.guarantor : null,
          /* The lead plus every part filled in, including one filled in after
             the offer went in (14 Oct 2026); the offer's own figure if larger. */
          income: (() => {
            const kept = typeof p.householdIncome === "number" && p.householdIncome > 0 ? p.householdIncome : 0;
            const lead = Number(String((p.passport as { annualIncome?: string } | undefined)?.annualIncome ?? "").replace(/[£,\s]/g, "")) || 0;
            const parts = (partsBy.get(r.id) ?? []).reduce((t, m) => t + (m.filled ? Number(m.answers.annualIncome) || 0 : 0), 0);
            return Math.max(kept, lead + parts) || null;
          })(),
          affordability: null,
          works: (p.works ?? []).map((w) => (typeof w === "string" ? w : String((w as { text?: string; label?: string })?.text ?? (w as { label?: string })?.label ?? ""))).filter(Boolean),
          note: p.note?.trim() || null,
        },
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
        detail: {
          email: a.applicants.find((x) => x.isPrimary)?.email ?? a.applicants[0]?.email ?? null,
          phone: a.applicants.find((x) => x.isPrimary)?.phone ?? a.applicants[0]?.phone ?? null,
          people: a.applicants.map((x) => x.name).filter(Boolean),
          adults: a.occupants != null && a.dependents != null ? Math.max(0, a.occupants - a.dependents) : a.applicants.length || null,
          children: a.dependents,
          pets: a.hasPets,
          petsNote: null,
          work: a.applicants.find((x) => x.isPrimary)?.employmentRex ?? null,
          guarantor: a.applicants.some((x) => x.guarantorCount > 0) ? true : null,
          income: a.totalIncome,
          affordability: a.affordabilityPct,
          works: [],
          note: a.conditions,
        },
      });
    }

    return NextResponse.json({ ok: true, offers: (await withSends(offers)).sort(newestFirst) });
  } catch (e) {
    console.error("listing offers failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't read the offers.", offers: [] }, { status: 500 });
  }
}
