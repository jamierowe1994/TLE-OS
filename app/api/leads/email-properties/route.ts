import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { createPassport, findPassportByEmail, markInvited } from "@/lib/passport";
import { sendAsAgent } from "@/lib/send-as-agent";
import { publicOrigin } from "@/lib/origin";
import { logDone } from "@/lib/tenant-email-send";

/**
 * POST -> Email properties from a lead, for real (16 Sep 2026).
 *
 * The picker on the lead used to show "Sent" and send nothing: its button
 * moved the modal to a tick and no request left the browser. This is the
 * send behind it - the catalogue's Homes That Fit email, as the agent.
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

type Home = { id?: string; name?: string; locality?: string; rent?: number | null };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
  const homes = (Array.isArray(b.homes) ? b.homes : []).filter((h) => h && h.name).slice(0, 20);
  if (!homes.length) return NextResponse.json({ ok: false, said: "Pick at least one property." }, { status: 400 });
  const name = String(b.name ?? "").trim();
  const to = String(b.email ?? "").trim();
  const first = name.split(/\s+/)[0] || "there";

  const homesList = homes
    .map((h) => {
      const rent = typeof h.rent === "number" && h.rent > 0 ? `<strong>£${Math.round(h.rent).toLocaleString("en-GB")} pcm</strong> · ` : "";
      return `${rent}${esc(String(h.name))}${h.locality ? `, ${esc(String(h.locality))}` : ""}`;
    })
    .join("<br>");
  const vars = (link: string) => ({
    firstName: first,
    count: String(homes.length),
    introLine:
      homes.length === 1
        ? "Here's a home on with us right now that I think fits what you're after."
        : "Here are the homes on with us right now that I think fit what you're after.",
    homesList,
    agentName: actor.name || "The Letting Experts",
    link,
  });

  if (b.preview) {
    const { subject, html } = await renderTleEmailLive("tenant-matches", vars(`${publicOrigin(req)}/tenant/welcome`));
    /* One home reads "1 homes" in the catalogue's subject. */
    return NextResponse.json({ ok: true, subject: homes.length === 1 ? subject.replace(/^1 homes that fit/, "A home that fits") : subject, html });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ ok: false, said: `${first === "there" ? "They have" : `${first} has`} no usable email address on their record, so nothing was sent.` }, { status: 400 });
  }

  /* The button is their passport, so it has to exist. The same one if they
     already have it, never a second. */
  let token: string;
  try {
    const existing = await findPassportByEmail(to, actor.id).catch(() => null);
    token = existing?.token ?? (await createPassport({ name, email: to, agentId: actor.id })).token;
  } catch (e) {
    return NextResponse.json({ ok: false, said: `Nothing was sent: the passport link could not be made (${e instanceof Error ? e.message : "unknown"}).` }, { status: 503 });
  }

  const rendered = await renderTleEmailLive("tenant-matches", vars(`${publicOrigin(req)}/tenant/passport/${token}`));
  const subject = homes.length === 1 ? rendered.subject.replace(/^1 homes that fit/, "A home that fits") : rendered.subject;
  const r = await sendAsAgent({ me: actor, to, toName: name, subject, html: rendered.html });
  if (r.sent) {
    await markInvited(token, actor.name).catch(() => null);
    /* On the tenant email log, with the homes, so Anything Close? can follow
       up in four days with what has come on near them since. */
    await logDone(`tenant-matches:${to.toLowerCase()}:${Date.now()}`, "tenant-matches", to, "sent", r.detail, {
      name,
      agentId: actor.id,
      homes: homes.map((h) => ({ id: h.id ?? null, name: h.name, locality: h.locality ?? null, rent: h.rent ?? null })),
    }).catch(() => null);
  }
  return NextResponse.json(
    { ok: r.sent, said: r.detail, via: r.via, timeline: r.timeline },
    { status: r.sent ? 200 : r.reason === "switched_off" ? 423 : 502 }
  );
}
