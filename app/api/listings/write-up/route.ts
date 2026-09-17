import { NextRequest, NextResponse } from "next/server";
import { isExpiredToken, rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { rexTokenFor } from "@/lib/rex-user";
import { invalidateListingBook } from "@/lib/listings-cache";
import { whoIs } from "@/lib/admin";
import { forAgent, isOwner } from "@/lib/agent-words";

/**
 * Save a listing's portal write-up back to REX.
 *
 * This is the OS's first write to the team's live system, so it is deliberately
 * narrow: one collection on one record, nothing else. The payload is the shape
 * the Rex UI itself sends and the F&C pipeline runs in production —
 *
 *   Listings/update { data: { id, related: { listing_adverts: [ … ] } } }
 *
 * Proven against this account on 11 Aug 2026, on a draft and on a published
 * listing (identical text written back: 200, content byte-identical,
 * system_modtime advanced). Two things learned doing it:
 *
 *   • REX TRIMS TRAILING WHITESPACE. Adding a space to prove a write landed
 *     reads back as no change at all — check system_modtime, not the text.
 *   • The advert row is addressed by advert_type, not by id. Sending the
 *     "internet" row leaves brochure and stocklist alone.
 *
 * lib/rex.ts refuses every write unless REX_ALLOW_WRITES names this exact
 * call, so this route is inert on any environment that hasn't opted in.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY = 20_000;
const MAX_HEADING = 500;

export async function POST(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ error: "The listings system isn't connected here." }, { status: 503 });
  }

  let payload: { id?: unknown; heading?: unknown; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A numeric listing id is required." }, { status: 400 });
  }
  const heading = typeof payload.heading === "string" ? payload.heading.trim() : null;
  const body = typeof payload.body === "string" ? payload.body : null;
  if ((heading?.length ?? 0) > MAX_HEADING || (body?.length ?? 0) > MAX_BODY) {
    return NextResponse.json({ error: "That write-up is longer than the listing will take." }, { status: 400 });
  }

  try {
    // As THEM. A write-up saved by Susan should say Susan in REX, so the
    // call carries her token; without one it falls to the office account and
    // the record would read as the API user forever.
    const actor = await rexTokenFor(verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value));

    const res = await rexCall("Listings", "update", {
      data: {
        id,
        related: { listing_adverts: [{ advert_type: "internet", advert_heading: heading, advert_body: body }] },
      },
    }, actor);
    if (!res.ok) {
      // Their sign-in lapsing is a different problem from REX refusing the
      // write, and it has a different fix — say so rather than making them
      // guess at a 502.
      if (actor && isExpiredToken(res)) {
        return NextResponse.json(
          { error: "Your sign-in to the listings system has lapsed. Reconnect it on your Profile and try again.", reconnect: true },
          { status: 401 }
        );
      }
      const { actor: who } = await whoIs(req).catch(() => ({ actor: null }));
      return NextResponse.json(
        { error: isOwner(who) ? res.error ?? `REX refused the write (${res.status}).` : "The write-up did not save. Try again in a minute." },
        { status: 502 }
      );
    }

    // Read it straight back rather than trusting the write: REX normalises
    // what it stores, so what the screen shows should be what REX now holds.
    const after = await rexCall("Listings", "read", { id });
    const rows = (after.result as { related?: { listing_adverts?: { advert_type?: string; advert_heading?: string | null; advert_body?: string | null }[] } } | null)
      ?.related?.listing_adverts ?? [];
    const net = rows.find((a) => a.advert_type === "internet") ?? null;

    // The book is cached in two layers, and both now hold a stale write-up for
    // this listing. Clearing them is part of the save, not housekeeping after
    // it: leave either one and the screen answers "no it didn't" to a write
    // that plainly did.
    await invalidateListingBook();

    return NextResponse.json({
      ok: true,
      id,
      heading: net?.advert_heading ?? null,
      body: net?.advert_body ?? null,
    });
  } catch (e) {
    const { actor: who } = await whoIs(req).catch(() => ({ actor: null }));
    if (e instanceof RexWriteBlocked) {
      return NextResponse.json(
        {
          error: isOwner(who)
            ? "Writes to REX are locked on this environment. Set REX_ALLOW_WRITES=\"Listings/update\" to unlock this one call."
            : "Saving the write-up is not switched on yet.",
          locked: true,
        },
        { status: 423 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? forAgent(who, e.message, "The write-up did not save. Try again in a minute.") : "The write-up did not save. Try again in a minute." },
      { status: 500 }
    );
  }
}
