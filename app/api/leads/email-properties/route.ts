import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { renderHomesThatFit, sendHomesThatFit, type FitHome } from "@/lib/homes-that-fit";
import { publicOrigin } from "@/lib/origin";

/**
 * POST -> Email properties from a lead, for real (16 Sep 2026).
 *
 * The picker on the lead used to show "Sent" and send nothing: its button
 * moved the modal to a tick and no request left the browser. This is the
 * send behind it - the catalogue's Homes That Fit email, as the agent
 * (lib/homes-that-fit, shared with Mail the database on a listing).
 *
 *   { name, email, homes: [{ name, locality, rent }], preview? }
 *
 * `preview: true` renders the email and sends nothing, so the Review step
 * shows the real thing rather than a paragraph written to look like it. The
 * homes come from the picker rather than a fresh book read: they are what the
 * agent was looking at when they ticked them.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Home = { id?: string; name?: string; locality?: string; rent?: number | null; rentPeriod?: string | null };

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, said: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { name?: string; email?: string; homes?: Home[]; preview?: boolean };
  const homes = (Array.isArray(b.homes) ? b.homes : [])
    .filter((h) => h && h.name)
    .slice(0, 20)
    .map((h): FitHome => ({ id: h.id ?? null, name: String(h.name), locality: h.locality ?? null, rent: h.rent ?? null, rentPeriod: h.rentPeriod ?? null }));
  if (!homes.length) return NextResponse.json({ ok: false, said: "Pick at least one property." }, { status: 400 });
  const name = String(b.name ?? "").trim();
  const to = String(b.email ?? "").trim();

  if (b.preview) {
    const { subject, html } = await renderHomesThatFit({
      name,
      homes,
      agentName: actor.name || "The Letting Experts",
      link: `${publicOrigin(req)}/tenant/welcome`,
    });
    return NextResponse.json({ ok: true, subject, html });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    const first = name.split(/\s+/)[0] || "there";
    return NextResponse.json({ ok: false, said: `${first === "there" ? "They have" : `${first} has`} no usable email address on their record, so nothing was sent.` }, { status: 400 });
  }

  const r = await sendHomesThatFit({ me: actor, name, to, homes, origin: publicOrigin(req) });
  return NextResponse.json(
    { ok: r.sent, said: r.detail, via: r.via, timeline: r.timeline },
    { status: r.sent ? 200 : r.reason === "switched_off" ? 423 : 502 }
  );
}
