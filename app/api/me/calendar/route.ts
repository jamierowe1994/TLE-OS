import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { calendarLinksFor, makeFeedToken, setBusyUrl, stopBusy, stopFeed } from "@/lib/personal-calendar";

/**
 * A person's own calendar links (Profile > Connections), lib/personal-calendar.
 *
 *   GET                              where each one stands
 *   POST { action: "feed" }          make the subscribe link, or a new one (the old stops); the
 *                                    link comes back this once and is not stored
 *   POST { action: "feed-off" }      stop the subscribe link
 *   POST { action: "busy", url }     read their personal calendar's secret address once, then keep it
 *   POST { action: "busy-off" }      forget it
 *
 * Only by the person it belongs to: refused while an owner is viewing as
 * somebody, the same line app/api/me/footer draws. Nothing here writes to any
 * calendar.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Where calendars collect the link from: the public address, not Railway's inside one. */
function origin(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-host");
  return (process.env.OS_ORIGIN || (forwarded ? `${(req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim()}://${forwarded}` : req.nextUrl.origin)).replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected here." }, { status: 503 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "Calendar links belong to the person themselves, so they can't be seen while viewing as somebody." }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await calendarLinksFor(actor.id)) });
  } catch {
    return NextResponse.json({ ok: false, error: "Your calendar links couldn't be read just now." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected here." }, { status: 503 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "Only the person themselves can change their calendar links." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; url?: string };
  const me = { id: actor.id, name: actor.name || "", email: actor.email || "" };
  try {
    if (b.action === "feed") {
      const token = await makeFeedToken(actor.id);
      const https = `${origin(req)}/api/calendar/feed/${token}.ics`;
      return NextResponse.json({ ok: true, link: https, webcal: https.replace(/^https?:\/\//, "webcal://"), ...(await calendarLinksFor(actor.id)) });
    }
    if (b.action === "feed-off") {
      await stopFeed(actor.id);
      return NextResponse.json({ ok: true, ...(await calendarLinksFor(actor.id)) });
    }
    if (b.action === "busy") {
      const r = await setBusyUrl(me, String(b.url ?? ""));
      if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
      return NextResponse.json({ ok: true, upcoming: r.count, ...(await calendarLinksFor(actor.id)) });
    }
    if (b.action === "busy-off") {
      await stopBusy(actor.id);
      return NextResponse.json({ ok: true, ...(await calendarLinksFor(actor.id)) });
    }
    return NextResponse.json({ ok: false, error: "Nothing to do." }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
