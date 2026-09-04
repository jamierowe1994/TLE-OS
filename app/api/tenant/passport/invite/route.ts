import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { publicOrigin } from "@/lib/origin";
import { createPassport, findPassportByEmail, markInvited } from "@/lib/passport";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";
import { switchOn } from "@/lib/switches";

/**
 * POST /api/tenant/passport/invite
 *
 * The send path the passport never had (launch list, item 17). An agent
 * presses "Invite to the passport" on a booked viewing; this mints the
 * passport for that tenant, renders the catalogue's Viewing Booked email with
 * the real viewing in it, and sends it on the public sender. The passport
 * link in the email is the credential, the same as the deck and the landlord
 * sign-in.
 *
 * ── Once per tenant, per agent ────────────────────────────────────────────
 *
 * A second press on the same email reuses the passport already minted and
 * says when the invite last went, so a tenant is never given two links to
 * two half-filled passports. To send again anyway, pass `again: true`.
 *
 * ── Behind the customer sender ────────────────────────────────────────────
 *
 * This is a real email to a real tenant, so it needs the "Email to
 * customers" switch and RESEND_FROM_PUBLIC, the same as the landlord link.
 * Off, it mints nothing and says so.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  let body: { name?: string; email?: string; address?: string; whenPretty?: string; again?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const email = (body.email ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "The viewing has no usable email for the tenant." }, { status: 400 });
  }
  if (!(await switchOn("customer_email"))) {
    return NextResponse.json(
      { ok: false, error: "Email to customers is off. Admin, Switches, then try again." },
      { status: 409 }
    );
  }

  const existing = await findPassportByEmail(email, me.id);
  if (existing?.invitedAt && !body.again) {
    return NextResponse.json({
      ok: true,
      alreadySent: true,
      invitedAt: existing.invitedAt,
      path: `/tenant/passport/${existing.token}`,
    });
  }

  const token = existing?.token ?? (await createPassport({ name, email, agentId: me.id })).token;
  const link = `${publicOrigin(req)}/tenant/passport/${token}`;
  const firstName = name.split(/\s+/)[0] || "there";
  const { subject, html } = renderTleEmail("tenant-passport-invite", {
    firstName,
    address: (body.address ?? "").trim() || "the property",
    whenPretty: (body.whenPretty ?? "").trim() || "the time we agreed",
    agentName: me.name || "Your agent",
    link,
  });

  try {
    await sendEmail({ to: email, subject, html, audience: "customer", replyTo: me.email || undefined });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "The email did not send." }, { status: 502 });
  }
  await markInvited(token, me.name || me.email);
  return NextResponse.json({ ok: true, alreadySent: false, invitedAt: new Date().toISOString(), path: `/tenant/passport/${token}` });
}
