import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { presentAgentFor } from "@/lib/rex-agents";
import { createPresentation, presentationsFor } from "@/lib/present-store";
import { firstNameOf, type PresentDeck, type PresentMarket } from "@/lib/present";
import { hasDb, q } from "@/lib/db";

/**
 * Minting a pre-appraisal deck.
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
function origin(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_OS_ORIGIN ?? "").replace(/\/+$/, "");
  if (configured) return configured;
  // Local dev, and a genuinely useful fallback: whatever host this request
  // arrived on. Never guessed from a header we don't control in production,
  // because the URL ends up in an email.
  return req.nextUrl.origin;
}

type Body = {
  ref?: string;
  /** Straight from the presentation builder: the comparables the agent
   *  actually ticked, and which sections they kept. Both optional — a deck
   *  minted without the wizard still works exactly as it did. */
  comparables?: {
    guideLow: number;
    guideMid: number;
    guideHigh: number;
    basedOn: number;
    rows: { name: string; locality: string; rent: string; days: number | null; letAgreed: boolean }[];
    caveat: string | null;
  } | null;
  /** The market blocks the agent ticked on the Market step, already reduced to
   *  the figures that were on their screen. Absent means no market slide. */
  market?: PresentMarket | null;
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
  const bio = await agentBio(me.id);

  const agent = await presentAgentFor(me.email, { name: me.name, email: me.email }, bio).catch(
    () => ({
      name: me.name,
      firstName: firstNameOf(me.name),
      title: "",
      email: me.email,
      phone: "",
      photo: null,
      bio,
    })
  );

  const deck: PresentDeck = {
    kind: "pre-appraisal",
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
async function agentBio(userId: string): Promise<string> {
  const rows = await q<{ value: { bio?: string } }>(
    `SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = 'tle-profile-v1'`,
    [userId]
  ).catch(() => []);
  return (rows[0]?.value?.bio ?? "").trim();
}
