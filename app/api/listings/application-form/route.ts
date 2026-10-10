import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { publicOrigin } from "@/lib/origin";
import { homeOnMarket } from "@/lib/tenant-homes";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * A listing's application form, from the staff side (Howard's ticket,
 * approved by James 1 Oct 2026).
 *
 * GET  ?id=<listing>              → the link, to show and copy, and whether the
 *                                   home is on the market (the form only takes
 *                                   applications for one that is).
 * POST { listingId, emails[], kind? } → the catalogue's application-form-invite
 *                                   (or offer-link-invite with kind "offer") to
 *                                   each address, from the agent's own mailbox
 *                                   where connected (lib/send-as-agent), so it
 *                                   obeys the customer email switch like every
 *                                   other customer send. One result per address.
 *
 * The application form only. It never mints or links a tenant passport: that
 * goes when the agent presses Send passport (James, 1 Oct 2026).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

async function me(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return userId ? await findUserById(userId) : null;
}

const linkFor = (req: NextRequest, id: string) => `${publicOrigin(req)}/tenant/apply?listing=${encodeURIComponent(id)}`;
/* The same form as an offer (7 Oct 2026): /tenant/offer, sent with its own email. */
const offerLinkFor = (req: NextRequest, id: string) => `${publicOrigin(req)}/tenant/offer?listing=${encodeURIComponent(id)}`;

export async function GET(req: NextRequest) {
  if (!(await me(req))) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: true, url: null, offerUrl: null, onMarket: false });
  const home = await homeOnMarket(id).catch(() => null);
  return NextResponse.json({ ok: true, url: linkFor(req, id), offerUrl: offerLinkFor(req, id), onMarket: Boolean(home) });
}

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const user = await me(req);
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { listingId?: string | number; emails?: unknown; kind?: string };
  const asOffer = b.kind === "offer";
  const id = String(b.listingId ?? "").trim();
  const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map((e) => String(e ?? "").trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return NextResponse.json({ ok: false, error: "Add at least one email address." }, { status: 400 });
  if (emails.length > 20) return NextResponse.json({ ok: false, error: "Twenty addresses at a time at most." }, { status: 400 });
  const bad = emails.filter((e) => !EMAIL.test(e));
  if (bad.length) return NextResponse.json({ ok: false, error: `${bad.join(", ")} ${bad.length === 1 ? "doesn't" : "don't"} look like an email address.` }, { status: 400 });

  const home = /^\d+$/.test(id) ? await homeOnMarket(id).catch(() => null) : null;
  if (!home) {
    return NextResponse.json({ ok: false, error: "This home isn't on the market, so the form would tell them it's closed. Put it live first." }, { status: 409 });
  }
  const rent = home.rentPeriod === "week" ? `${gbp(home.rent)} a week` : `${gbp(home.rent)} a month`;
  const address = [home.name, home.locality].filter(Boolean).join(", ");
  const { subject, html } = await renderTleEmailLive(asOffer ? "offer-link-invite" : "application-form-invite", {
    address,
    rent,
    agentName: user.name || "The Letting Experts",
    link: asOffer ? offerLinkFor(req, id) : linkFor(req, id),
  });

  const results: { email: string; sent: boolean; detail: string }[] = [];
  for (const to of emails) {
    const r = await sendAsAgent({ me: user, to, subject, html }).catch((e) => ({ sent: false, detail: publicError(e, "It did not send.") }));
    results.push({ email: to, sent: r.sent, detail: r.detail });
  }
  return NextResponse.json({ ok: results.some((r) => r.sent), results });
}
