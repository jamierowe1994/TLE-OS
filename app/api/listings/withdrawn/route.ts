import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";
import { AREA_DEFS, canAct, levelOf, lockedSentence } from "@/lib/area-map";
import { record } from "@/lib/audit";
import { listingIsTheirs } from "@/lib/listing-gate";
import { chooseWithdrawn, withdrawnFor, WithdrawnRefused, WITHDRAWN_CHOICES, type WithdrawnChoice } from "@/lib/listing-withdrawn";
import { publicError } from "@/lib/public-error";
import { rexConfigured } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { isTestId } from "@/lib/test-overlay";

/**
 * A home withdrawn behind the OS's back, and the agent's answer. See lib/listing-withdrawn.
 *
 *   GET  ?id=834264                                   → what happened, what's still out, the answer so far
 *   POST { id, choice: off|relist|leave, cancelTerms } → do it
 *
 * The same gates as Take off the market (app/api/listings/publish): the
 * listing's own agent, behind the listing-publish switch; owners and Susan
 * not gated. Nobody is emailed.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLISH_AREA = AREA_DEFS.find((a) => a.id === "listing-publish")!;
const idOf = (v: unknown) => (typeof v === "string" || typeof v === "number") && /^\d{1,9}$/.test(String(v)) ? String(v) : null;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("id");
  if (isTestId(raw)) return NextResponse.json({ ok: true, withdrawn: null });
  const id = idOf(raw);
  if (!id) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });
  try {
    const w = await withdrawnFor(id);
    return NextResponse.json({ ok: true, withdrawn: w.source ? w : null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The listings system didn't answer. Try again in a minute.") }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them first." }, { status: 403 });
  if (!["owner", "super_admin", "agent"].includes(actor.role)) return NextResponse.json({ ok: false, error: "This is for the listing's agent." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; choice?: unknown; cancelTerms?: unknown };
  const id = idOf(b.id);
  const choice = WITHDRAWN_CHOICES.includes(b.choice as WithdrawnChoice) ? (b.choice as WithdrawnChoice) : null;
  if (!id || !choice) return NextResponse.json({ ok: false, error: "Which listing, and what should happen?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });

  if (choice !== "leave" && actor.role === "agent") {
    const access = await accessFor(actor).catch(() => null);
    if (!access || !canAct(access, PUBLISH_AREA)) return NextResponse.json({ ok: false, areaLocked: PUBLISH_AREA.id, error: lockedSentence(PUBLISH_AREA, levelOf(access, PUBLISH_AREA.id)) }, { status: 423 });
  }
  const notTheirs = await listingIsTheirs(actor, Number(id));
  if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });

  try {
    const token = choice === "leave" ? null : await rexTokenFor(actor.id);
    const { did } = await chooseWithdrawn({ listingId: id, choice, cancelTerms: b.cancelTerms === true, token, by: { name: actor.name || actor.email, email: actor.email } });
    await record({
      kind: "listing_publication",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${id}: withdrawn home, chose ${choice}${did.length ? ` - ${did.join(" ")}` : ""}`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, did });
  } catch (e) {
    if (e instanceof WithdrawnRefused) return NextResponse.json({ ok: false, error: e.message, signIn: e.signIn || undefined }, { status: e.status });
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't go through. Try again in a minute.") }, { status: 502 });
  }
}
