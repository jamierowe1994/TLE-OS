import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { whoIs } from "@/lib/admin";
import { leadScope } from "@/lib/scope";
import { hasDb } from "@/lib/db";
import { publicOrigin } from "@/lib/origin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { autoSentEmails, getAutoPassport, sendReminderToMe, setAutoPassport } from "@/lib/auto-passport";
import { reminderPreview } from "@/lib/passport-reminder";
import { isTestId } from "@/lib/test-overlay";

/**
 * A LISTING'S AUTOMATE PASSPORT (22 Oct 2026, lib/auto-passport).
 *
 *   GET                         is it on, since when, by whom; who has had one
 *   POST { on: true, home }     on from now, sending as the person pressing
 *   POST { on: false }          off, and the waiting reminders with it
 *   POST { preview: true }      the reminder as a tenant will get it; sends nothing
 *   POST { test: true, home }   the reminder to your own address
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const listingOf = async (params: Promise<{ id: string }>) => {
  const id = String((await params).id ?? "").trim();
  return /^-?\d+$/.test(id) ? id : null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const listingId = await listingOf(params);
  if (!listingId) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, on: false, autoSent: [] });
  try {
    const [auto, autoSent] = await Promise.all([getAutoPassport(listingId), autoSentEmails(listingId)]);
    return NextResponse.json({ ok: true, on: Boolean(auto), by: auto?.userName ?? null, mine: auto?.userId === actor.id, since: auto?.onSince ?? null, autoSent });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Couldn't read the switch.") }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const listingId = await listingOf(params);
  if (!listingId) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  let body: { on?: boolean; home?: string; preview?: boolean; test?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const home = (body.home ?? "").trim().slice(0, 300);
  const origin = publicOrigin(req);

  try {
    if (body.preview === true) {
      const { subject, html } = await reminderPreview({ agentName: actor.name || "Your agent", home, origin, stoppedAt: "not-started" });
      return NextResponse.json({ ok: true, subject, html });
    }
    if (body.test === true) {
      const r = await sendReminderToMe({ me: actor, home, origin });
      return NextResponse.json({ ok: r.sent, said: r.detail, to: actor.email }, { status: r.sent ? 200 : 502 });
    }
    if (typeof body.on !== "boolean") return NextResponse.json({ ok: false, error: "On or off?" }, { status: 400 });
    if (body.on && isTestId(listingId)) {
      return NextResponse.json({ ok: false, error: "A test listing's enquiries are made up, so there is nobody to send to." }, { status: 400 });
    }
    /* Only ever the enquirers the switcher can see on their own board. */
    const scope = await leadScope(req);
    if (body.on && scope.unlinked) {
      return NextResponse.json({ ok: false, error: "We can't tell which enquiries are yours yet, so this can't be turned on. Ask James to link your account." }, { status: 409 });
    }
    const auto = await setAutoPassport({ listingId, on: body.on, me: actor, rexUserId: scope.rexUserId, home });
    return NextResponse.json({ ok: true, on: Boolean(auto), by: auto?.userName ?? null, mine: auto ? auto.userId === actor.id : false, since: auto?.onSince ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save.") }, { status: 502 });
  }
}
