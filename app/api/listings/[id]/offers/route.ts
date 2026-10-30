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
import { countersFor, type OfferCounter } from "@/lib/offer-counters";
import { discardsForListing, type Discard } from "@/lib/offer-discards";
import { offerHistory, personKeys, type OfferTry } from "@/lib/offer-repeat";

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
  /** What the tenant first offered, before any counter (16 Oct 2026). */
  offered?: number | null;
  /** The back-and-forth, oldest first (lib/offer-counters). */
  counters?: OfferCounter[];
  /** Every time they sent it, oldest first, where they sent it more than once (lib/offer-repeat, 29 Oct 2026). */
  tries?: OfferTry[];
  /** A second offer from the same person: the one it repeats, which stays. Discard is offered on this one. */
  duplicateOf?: { ref: string; name: string; at: string | null } | null;
  /** They sent it again after it was decided: it stays as decided, and the agent is shown it was tried again. */
  againAfter?: "accepted" | "declined" | null;
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
    amount?: number; offeredAmount?: number; moveIn?: string; recordedBy?: { name?: string }; source?: string; via?: string;
    movingIn?: string[]; adults?: number; children?: number; pets?: boolean; petsNote?: string; works?: unknown[]; note?: string; householdIncome?: number;
    passport?: { guarantor?: boolean; applicantType?: string; workHours?: string; phone?: string; mobile?: string };
    /* The offer link and application form keep each adult's own answers. */
    applicants?: { phone?: string; isPrimary?: boolean }[];
  };
  created_at: Date;
};

/**
 * THE SAME PERSON TWICE (James, 29 Oct 2026). Offers on one home that share
 * an email, a phone number or a full name are one person's. Of each such
 * group the one that stands is the accepted one, else the newest still open,
 * else the newest; the others are marked as its duplicates, and the Offers
 * tab offers Discard on them rather than only Decline, which emails the
 * tenant. An OS offer and the same person's REX application meet here too.
 */
function markDuplicates(offers: ListingOffer[]): ListingOffer[] {
  const keysOf = (o: ListingOffer) => {
    const full = o.name.trim().toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ");
    return [...personKeys(o.detail.email, o.detail.phone), ...(full.split(" ").length >= 2 ? [`n:${full}`] : [])];
  };
  const parent = offers.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map<string, number>();
  offers.forEach((o, i) => {
    if (o.kind === "test") return;
    for (const k of keysOf(o)) {
      const j = seen.get(k);
      if (j == null) seen.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, number[]>();
  offers.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const out = offers.map((o) => ({ ...o, duplicateOf: null as ListingOffer["duplicateOf"] }));
  const rank = (o: ListingOffer) => (o.status === "accepted" ? 2 : o.status === "open" ? 1 : 0);
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const keep = [...members].sort((a, b) => rank(offers[b]) - rank(offers[a]) || String(offers[b].at ?? "").localeCompare(String(offers[a].at ?? "")))[0];
    for (const i of members) if (i !== keep && offers[i].status !== "accepted") out[i].duplicateOf = { ref: offers[keep].ref, name: offers[keep].name, at: offers[keep].at };
  }
  return out;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const newestFirst = (a: ListingOffer, b: ListingOffer) => String(b.at ?? "").localeCompare(String(a.at ?? ""));

/**
 * Each offer with when it last went to the landlord, and its counters
 * (16 Oct 2026). An open offer that has been countered shows the figure on
 * the table; an accepted one already carries the agreed figure.
 */
async function withSends(offers: ListingOffer[]): Promise<ListingOffer[]> {
  const refs = offers.map((o) => o.ref);
  const [sent, counters] = await Promise.all([
    landlordSends(refs).catch(() => new Map<string, LandlordSend>()),
    countersFor(refs).catch(() => new Map<string, OfferCounter[]>()),
  ]);
  return offers.map((o) => {
    const list = counters.get(o.ref) ?? [];
    const last = list[list.length - 1] ?? null;
    const onTable = o.status === "open" && last;
    return {
      ...o,
      landlordSent: sent.get(o.ref) ?? null,
      offered: o.offered ?? o.amount,
      counters: list,
      amount: onTable ? last.amount : o.amount,
      moveIn: onTable && last.moveIn ? last.moveIn : o.moveIn,
    };
  });
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
          offered: (o as { offeredAmount?: number }).offeredAmount ?? o.amount,
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

    const [osRows, decided, rexRead] = await Promise.all([
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
      })().catch(() => null),
    ]);
    /* REX not answering is said, not shown as no offers (22 Oct 2026): during
       the REX outage the tab looked empty and Lorna's applicants seemed lost. */
    /* An OS offer once accepted is on the applications board too, as
       "os:<id>" (lib/applications), and was listed here a second time - the
       "two offers from the same tenant" on 68 Main Street (29 Oct 2026). The
       offer itself is already in the list; its application is not another. */
    const osHere = new Set(osRows.map((r) => `os:${r.id}`));
    const rex = (rexRead ?? []).filter((a) => !osHere.has(String(a.id)));

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
        offered: typeof p.offeredAmount === "number" ? p.offeredAmount : typeof p.amount === "number" ? p.amount : null,
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
        ...(() => {
          const t = offerHistory(new Date(r.created_at).toISOString(), (r.payload ?? {}) as Record<string, unknown>);
          if (t.length < 2) return {};
          /* Sent again after the agent had decided: said, so a declined
             tenant trying again is seen as a repeat (29 Oct 2026). */
          const last = t[t.length - 1].at;
          return { tries: t, againAfter: d && last > d.at ? d.decision : null };
        })(),
        detail: {
          parts: toOfferParts(partsBy.get(r.id) ?? [], r.name || ""),
          email: r.email || null,
          /* An offer link's number is the lead applicant's own (23 Oct 2026). */
          phone: p.passport?.mobile || p.passport?.phone || (p.applicants?.find((x) => x.isPrimary) ?? p.applicants?.[0])?.phone || null,
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

    /* REX's own decision first; the OS's where REX has none yet. An offer
       accepted here stays accepted once the home is let or moved into (22 Oct
       2026): 12b Cliff Road's accepted tenant read "declined - Home let". */
    const rexDecided = await decisionsFor(rex.map((a) => `rex:${a.id}`));
    for (const a of rex) {
      const d = rexDecided.get(`rex:${a.id}`) ?? null;
      const hereAccepted = a.status !== "unsuccessful" && d?.decision === "accepted";
      const status: ListingOffer["status"] =
        a.status === "accepted" || hereAccepted ? "accepted" : a.status === "unsuccessful" || a.closed ? "declined" : d ? d.decision : "open";
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
              : hereAccepted && d
                ? `Accepted by ${d.by} ${day(d.at)} - ${a.closed ? a.closed.toLowerCase() : "REX not updated yet"}`
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

    /* Discarded duplicates leave the list; the listing's Activity still says
       who discarded which and when (lib/offer-discards, 29 Oct 2026). */
    const discarded = await discardsForListing(listingId).catch(() => [] as Discard[]);
    const gone = new Set(discarded.map((d) => d.ref));
    const kept = markDuplicates(offers.filter((o) => !gone.has(o.ref)));
    return NextResponse.json({ ok: true, offers: (await withSends(kept)).sort(newestFirst), discarded, ...(rexRead === null ? { rexUnread: true } : {}) });
  } catch (e) {
    console.error("listing offers failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't read the offers.", offers: [] }, { status: 500 });
  }
}
