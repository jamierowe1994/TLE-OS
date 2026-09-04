import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { presentAgentFor } from "@/lib/rex-agents";
import { createPresentation, presentationsFor } from "@/lib/present-store";
import {
  DECK_KINDS,
  firstNameOf,
  type DeckKind,
  type PresentComparables,
  type PresentDeck,
  type PresentListing,
  type PresentMarket,
  type PresentMaterialRow,
  type PresentTerms,
  type PresentValuation,
} from "@/lib/present";
import { hasDb, q } from "@/lib/db";
import { publicOrigin } from "@/lib/origin";

/**
 * Minting a deck — one of three, chosen by `kind`.
 *
 * The agent's side of this is one button. Everything that makes the deck
 * personal is assembled here, once, and frozen — see lib/present-store.ts for
 * why a snapshot rather than a live query.
 *
 * The property facts are OPTIONAL and passed in by the caller rather than
 * fetched here. The drawer has already run the dossier for this address when
 * the lead was captured; asking Homesearch and RealtyAPI a second time would
 * cost twenty seconds on a button press and could answer differently from
 * what the agent is looking at. If they aren't sent, the deck simply has no
 * property facts, and the design carries that.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Where the landlord's browser should be sent. Set on Railway. */
const origin = publicOrigin;

type Body = {
  ref?: string;
  /** Which of the three decks to mint. Absent means pre-appraisal, so every
   *  caller written before kinds existed keeps working unchanged. */
  kind?: DeckKind;
  /** Straight from the presentation builder: the comparables the agent
   *  actually ticked, and which sections they kept. Both optional — a deck
   *  minted without the wizard still works exactly as it did. */
  comparables?: PresentComparables | null;
  /** What is advertised near them, with photographs, as picked on the wizard's
   *  Available step. See PresentListing for why the gallery travels. */
  listings?: PresentListing[] | null;
  /** The headline material-information rows, for the landlord to correct. */
  material?: PresentMaterialRow[] | null;
  /** The market blocks the agent ticked on the Market step, already reduced to
   *  the figures that were on their screen. Absent means no market slide. */
  market?: PresentMarket | null;
  /** Post-appraisal only — the agreed figure, and the terms to sign. */
  valuation?: PresentValuation | null;
  terms?: PresentTerms | null;
  /** Overrides the agent's profile headshot for this deck only. */
  agentPhoto?: string | null;
  recipientName?: string;
  address?: string;
  postcode?: string;
  whenPretty?: string;
  startsAt?: string | null;
  minutes?: number;
  /** From the dossier the drawer already holds. All optional. */
  property?: {
    image?: string | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    propertyType?: string | null;
    epc?: string | null;
  };
};

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  if (!ref) return NextResponse.json({ ok: false, error: "ref required" }, { status: 400 });
  const rows = await presentationsFor(ref);
  return NextResponse.json({
    ok: true,
    // The deck itself is not returned — the list is for "have they opened it",
    // and shipping the whole snapshot to every drawer render is waste.
    sent: rows.map((r) => ({
      token: r.token,
      /* The kind travels now that there are three decks. Without it the
         appraisal page cannot tell a pre-appraisal from the deck the agent
         took on the day, and would list them as one undifferentiated pile. */
      kind: r.kind,
      url: `${origin(req)}/present/${r.token}`,
      createdAt: r.createdAt,
      authorName: r.authorName,
      opens: r.opens,
      firstOpenedAt: r.firstOpenedAt,
      lastOpenedAt: r.lastOpenedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json(
      { ok: false, error: "No database on this environment — a deck has nowhere to live." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  const address = (body.address ?? "").trim();
  if (!address) {
    return NextResponse.json({ ok: false, error: "The deck needs an address." }, { status: 400 });
  }

  /* Default to pre-appraisal so the two callers written before kinds existed
     keep behaving exactly as they did; refuse anything else we do not know. */
  const kind: DeckKind = body.kind ?? "pre-appraisal";
  if (!DECK_KINDS.some((k) => k.id === kind)) {
    return NextResponse.json(
      { ok: false, error: `"${body.kind}" is not a deck we build.` },
      { status: 400 }
    );
  }

  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) {
    // Not a formality. The deck introduces a named person by photograph; it
    // cannot be minted by "the office".
    return NextResponse.json(
      { ok: false, error: "Sign in to the OS first — a presentation goes out in someone's name." },
      { status: 401 }
    );
  }

  // The biography is the agent's own, written in their profile. REX has a
  // field for it and it is empty for every user on the account (measured), so
  // this is the only place it can come from.
  const profile = await agentProfile(me.id);

  const agent = await presentAgentFor(
    me.email,
    { name: me.name, email: me.email },
    profile.bio,
    /* Whatever the caller sent wins over the profile — that is the "change it
       out" control in the builder, choosing a photo for THIS deck only. */
    body.agentPhoto ?? profile.photo
  ).catch(
    () => ({
      name: me.name,
      firstName: firstNameOf(me.name),
      title: "",
      email: me.email,
      phone: "",
      photo: body.agentPhoto ?? profile.photo,
      bio: profile.bio,
    })
  );

  const deck: PresentDeck = {
    /* VALIDATED, not trusted. `kind` decides which slides a landlord sees, and
       the DB column is free text with no CHECK behind it — an unrecognised
       string would store fine and then render as a pre-appraisal by fallback,
       which is a deck quietly becoming the wrong deck. Anything we do not
       recognise is refused above rather than coerced here. */
    kind,
    recipientName: (body.recipientName ?? "").trim(),
    property: {
      address,
      postcode: (body.postcode ?? "").trim(),
      image: body.property?.image ?? null,
      beds: body.property?.beds ?? null,
      baths: body.property?.baths ?? null,
      sqft: body.property?.sqft ?? null,
      propertyType: body.property?.propertyType ?? null,
      epc: body.property?.epc ?? null,
    },
    whenPretty: (body.whenPretty ?? "").trim(),
    startsAt: body.startsAt ?? null,
    minutes: Number(body.minutes) > 0 ? Number(body.minutes) : 45,
    agent,
    /* SNAPSHOTTED, not looked up. The figure a landlord opens on Sunday must
       be the one the agent approved on Friday — see lib/present. Three
       comparables is the floor; below that slidesFor drops the slide, so a
       thin selection quietly becomes no slide rather than a weak one. */
    comparables:
      body.comparables && body.comparables.rows.length >= 3 ? body.comparables : null,
    /* Snapshotted for the same reason, and only when the agent actually chose
       something: an `area` with every block empty would mint a slide headed
       "Your local market" with nothing on it. slidesFor drops a null. */
    market: body.market && body.market.area ? body.market : null,
    /* WHAT IS ON THE MARKET NEAR THEM, with the photographs, snapshotted for
       the same reason as everything else on this row: a landlord opening the
       link on Sunday must not depend on Homesearch being up, and the row then
       doubles as the record of exactly what we showed them. The image URLs are
       Homesearch's public S3 media, which resolves with no token.

       Empty means no slide rather than an empty one — slidesFor drops it. */
    listings:
      Array.isArray(body.listings) && body.listings.length ? body.listings : null,
    /* What we hold about the property, for the landlord to correct. Same rule:
       a "What we have on record" heading over nothing is worse than no slide,
       because the whole point of it is that there is something to check. */
    material:
      Array.isArray(body.material) && body.material.length ? body.material : null,
    /* Gated on a real rent for the same reason slidesFor is: a valuation
       object with no figure in it would mint an offer slide that makes no
       offer. Terms need the figure too — asking somebody to sign before
       telling them the number is the wrong way round. */
    valuation: body.valuation?.rent ? body.valuation : null,
    terms: body.valuation?.rent && body.terms ? body.terms : null,
    createdAt: new Date().toISOString(),
  };

  const row = await createPresentation({
    ref: (body.ref ?? "").trim(),
    deck,
    authorId: me.id,
    authorName: me.name,
  });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Couldn't save the presentation." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    token: row.token,
    url: `${origin(req)}/present/${row.token}`,
    /** So the caller can tell the agent their profile is thin before it goes. */
    missing: [
      !agent.photo && "a photo",
      !agent.bio.trim() && "a short introduction",
      !agent.phone && "a mobile number",
    ].filter(Boolean) as string[],
  });
}

/**
 * The agent's introduction, from their own OS profile.
 *
 * The key here was 'presentation_profile', which NOTHING in the codebase has
 * ever written. The profile page saves under 'tle-profile-v1' (PROFILE_KEY in
 * app/(os)/profile/page.tsx). So this returned "" for every agent who had ever
 * typed a bio, and every deck quietly fell through to the generic default —
 * the page told them "shows on your listings, your emails and the landlord
 * review pages" and then showed it nowhere.
 *
 * Empty here is still a fine answer: presentAgentFor falls back to the TEG
 * Hub's bio, so a partner who never opened this page still gets a real
 * introduction rather than the stock one.
 */
async function agentProfile(userId: string): Promise<{ bio: string; photo: string | null }> {
  const rows = await q<{ value: { bio?: string; photo?: string } }>(
    `SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = 'tle-profile-v1'`,
    [userId]
  ).catch(() => []);
  return {
    bio: (rows[0]?.value?.bio ?? "").trim(),
    /* The uploader saves a data URL. Read back out for the deck, which used to
       ask REX and the Hub only — and both hold nothing for TLE, so an agent
       who had uploaded their own face still went out as a monogram. */
    photo: (rows[0]?.value?.photo ?? "").trim() || null,
  };
}
