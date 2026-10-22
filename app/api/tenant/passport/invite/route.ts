import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { publicOrigin } from "@/lib/origin";
import { findDonePassportByEmail, findPassportByEmail, getPassport } from "@/lib/passport";
import { sendPassportInvite } from "@/lib/passport-invite";
import { forScreen, passportRules } from "@/lib/passport-scotland";
import { can } from "@/lib/roles";
import { householdIncome } from "@/lib/passport-shape";
import { renderTleEmail } from "@/lib/email/tle-emails";

/**
 * POST /api/tenant/passport/invite
 *
 * ── Two emails, by whether there is a viewing (1 Oct 2026) ────────────────
 *
 * From a lead there is no viewing, and agents do not book one until the
 * passport says the tenant fits (Rhiannon). So with no `whenPretty` this
 * sends the passport on its own (tenant-passport-request), and says nothing
 * about a booking. From a booked viewing it sends the viewing email with the
 * passport in it, as before. The lead used to get the viewing email too, with
 * "the property" and "the time we agreed" standing in for a viewing that did
 * not exist.
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

/**
 * GET /api/tenant/passport/invite?email=...
 *
 * Has this tenant been sent one, and what is their link? Asked by the agent's
 * screen so the button can say Send or Resend truthfully (James, 9 Sep 2026).
 * Reads only - it never mints and never sends, so opening a record cannot
 * quietly email somebody.
 */
export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const email = (req.nextUrl.searchParams.get("email") ?? "").trim();
  if (!email) return NextResponse.json({ ok: true, sent: false, path: null, invitedAt: null });

  const own = await findPassportByEmail(email, me.id).catch(() => null);
  /* The office sees every agent's tenants (Passports done on Leads), so a
     tenant who finished an agent's passport shows as done to them too, rather
     than offering to send a second one. Only a FINISHED one, and only here:
     the POST still mints and sends per agent. */
  const ownDone = own ? await getPassport(own.token).catch(() => null) : null;
  const existing =
    !ownDone?.submittedAt && can(me.role, "see:everything")
      ? (await findDonePassportByEmail(email).catch(() => null)) ?? own
      : own;
  /* Done or not, and what it says (11 Sep 2026): a finished passport shows
     on the lead as a tick, and its answers fill in the tenant's details, so
     the agent never re-asks what the tenant has already told us. */
  const full = existing ? (existing.token === ownDone?.token ? ownDone : await getPassport(existing.token).catch(() => null)) : null;
  /* Scotland: no Right to rent on the summary (lib/passport-scotland). */
  const d = full ? forScreen(full.data, await passportRules(full, req.nextUrl.searchParams.get("home"))) : undefined;
  const yes = (b: boolean | null | undefined) => (b == null ? null : b ? "Yes" : "No");
  const income = d ? householdIncome(d).total : null;
  return NextResponse.json({
    ok: true,
    sent: Boolean(existing?.invitedAt),
    exists: Boolean(existing),
    invitedAt: existing?.invitedAt ?? null,
    path: existing ? `/tenant/passport/${existing.token}` : null,
    done: Boolean(full?.submittedAt),
    submittedAt: full?.submittedAt ?? null,
    summary: d
      ? {
          applicantType: d.applicantType || null,
          householdIncome: income,
          adults: d.numAdults || null,
          children: d.numChildren || null,
          pets: d.pets == null ? null : d.pets ? d.petsNote || "Yes" : "No",
          guarantor: yes(d.guarantor),
          rightToRent: d.hasBritishPassport ? "British passport" : d.shareCode ? "Share code given" : null,
          currentAddress: d.currentAddress || null,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  let body: { name?: string; email?: string; address?: string; home?: string; whenPretty?: string; again?: boolean; preview?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const email = (body.email ?? "").trim();
  const name = (body.name ?? "").trim();
  /* THE EMAIL AS IT WILL GO, for the agent to read first (8 Oct 2026: sending
     passports from a listing's Enquiries in one go). Mints nothing, sends
     nothing, needs no address: the link is shown as a placeholder. */
  if (body.preview === true) {
    const { subject, html } = renderTleEmail("tenant-passport-request", {
      firstName: name.split(/\s+/)[0] || "there",
      agentName: me.name || "your agent",
      link: `${publicOrigin(req)}/tenant/passport/your-own-link`,
    });
    return NextResponse.json({ ok: true, preview: true, subject, html });
  }
  /* The send itself lives in lib/passport-invite, shared with a listing's
     Automate passport (lib/auto-passport) so both send the same email. */
  const r = await sendPassportInvite({
    me,
    origin: publicOrigin(req),
    name,
    email,
    address: body.address,
    home: body.home,
    whenPretty: body.whenPretty,
    again: body.again,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  if (r.alreadySent) return NextResponse.json({ ok: true, alreadySent: true, invitedAt: r.invitedAt, path: r.path });
  return NextResponse.json({ ok: true, alreadySent: false, invitedAt: r.invitedAt, path: r.path, said: r.said });
}
