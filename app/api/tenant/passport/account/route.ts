import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getPassport, passportEmailedTo, submitPassport } from "@/lib/passport";
import { createTenantFromPassport, tenantHasPassword, upsertTenantAccount } from "@/lib/tenant-account";
import { createPortalToken, TENANT_COOKIE, portalCookieOptions } from "@/lib/auth";
import { normaliseEmail } from "@/lib/users";
import { startVerification } from "@/lib/verification";
import { renderTenantSignIn } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";

/**
 * The end of the passport: an account, and straight in.
 *
 * WHOSE ACCOUNT (rewritten 18 Sep 2026). This used to make the account for
 * whatever address was typed on page one, overwrite the password of an account
 * that already existed, and set the cookie - so anybody holding ANY passport
 * link could type somebody else's address and be signed in as them, with their
 * ID documents behind it. Now:
 *
 *  - The link only proves an address when we EMAILED the link to it. That
 *    address gets the account and goes straight in, as before.
 *  - Any other address (a link that was copied and pasted, or an address
 *    changed on the form) gets a sign-in link by email instead. No password is
 *    kept and no cookie is set until they open it.
 *  - An account that already has a password is never touched from here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  let body: { token?: string; password?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* falls through */
  }
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");
  if (!token) return NextResponse.json({ ok: false, error: "That passport link is missing its code." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ ok: false, error: "Your password needs at least 8 characters." }, { status: 400 });

  const record = await getPassport(token).catch(() => null);
  if (!record) return NextResponse.json({ ok: false, error: "That passport could not be found." }, { status: 404 });

  const emailedTo = await passportEmailedTo(token);
  const typed = (record.data.email || record.email || "").trim();
  const email = emailedTo ?? typed;
  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Add your email address on the first page - it becomes your username." }, { status: 400 });
  }
  const name = record.data.legalName || record.name;

  if (await tenantHasPassword(email)) {
    return NextResponse.json(
      { ok: false, error: "You already have an account with us. Sign in with your email and password, or ask for a sign-in link." },
      { status: 409 }
    );
  }

  /* Proven: we sent this link to this address, and they typed the same one (or
     none). Straight in. */
  if (emailedTo && (!typed || normaliseEmail(typed) === normaliseEmail(emailedTo))) {
    const account = await createTenantFromPassport({ email, name, password, passportToken: token });
    await submitPassport(token).catch(() => null);
    const res = NextResponse.json({ ok: true, name: account.name });
    res.cookies.set(TENANT_COOKIE, createPortalToken("tenant", account.id), portalCookieOptions());
    return res;
  }

  /* Not proven. The address they typed gets a sign-in link; the account is a
     row with no password on it until they open that link. */
  const to = normaliseEmail(typed || email);
  await upsertTenantAccount({ email: to, name: name.trim() || to });
  await submitPassport(token).catch(() => null);
  try {
    const { token: vt } = await startVerification(to, "tenant");
    const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
    const link = `${origin}/tenant/enter?token=${encodeURIComponent(vt)}`;
    const mail = renderTenantSignIn({ firstName: name.split(/\s+/)[0] || "there", link });
    await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, audience: "customer" });
  } catch (e) {
    console.error(`[passport/account] sign-in link not sent to ${to}:`, e);
    return NextResponse.json(
      { ok: false, error: "Your passport is saved, but we couldn't email your sign-in link just now. Try again in a minute." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, verify: true, email: to });
}
