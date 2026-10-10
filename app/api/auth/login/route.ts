import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { record } from "@/lib/audit";
import { q } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { authenticate } from "@/lib/users";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  }
  let body: { email?: string; password?: string; remember?: boolean };
  try {
    const raw = (await req.json()) as Record<string, unknown> | null;
    /* Only text gets past here (Rig run 3, P-027): a list or an object in a
       field reached .trim() and the route crashed with an empty 500. */
    const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    body = {
      email: typeof o.email === "string" ? o.email : "",
      password: typeof o.password === "string" ? o.password : "",
      remember: typeof o.remember === "boolean" ? o.remember : undefined,
    };
  } catch {
    return NextResponse.json({ ok: false, error: "Expected an email and a password." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const ip = clientIp(req);
  /* NO RATE LIMIT AT ALL on staff sign-in until 22 Sep 2026 (18 Sep sweep,
     item 12). The audit trail already holds every failed attempt with the
     address and the IP, so the limit reads from it: eight wrong goes against
     one address or from one IP in a quarter of an hour, and the door waits.
     Counted before the password is checked, so a locked address costs the
     attacker nothing to learn and us nothing to serve. */
  /* Two counts, not one (Rig run 2, P-010, 10 Oct 2026). Eight wrong from
     anywhere used to lock the ADDRESS, so a stranger could keep Susan out of
     sign-in by typing eight wrong passwords every quarter of an hour; and the
     IP was the one the visitor writes, so it never limited anybody. Now:
     eight from one real address (clientIp) waits, wherever they aim; and an
     account waits only after thirty wrong goes from everywhere at once, which
     is a spray across many machines, not somebody locking a colleague out. */
  const recent = await q<{ by_ip: string; by_email: string }>(
    `SELECT COUNT(*) FILTER (WHERE $2 <> '' AND ip = $2)::text AS by_ip,
            COUNT(*) FILTER (WHERE actor_email = $1)::text AS by_email
       FROM os_audit
      WHERE kind = 'sign_in_failed' AND at > NOW() - INTERVAL '15 minutes'
        AND (actor_email = $1 OR ($2 <> '' AND ip = $2))`,
    [email, ip]
  ).catch(() => []);
  if (Number(recent[0]?.by_ip ?? 0) >= 8 || Number(recent[0]?.by_email ?? 0) >= 30) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Wait fifteen minutes and try again." }, { status: 429 });
  }

  const user = await authenticate(body.email ?? "", body.password ?? "");
  if (!user) {
    // One message for both wrong-address and wrong-password: saying which
    // confirms whether an address has an account here.
    await record({
      kind: "sign_in_failed",
      actorEmail: (body.email ?? "").trim().toLowerCase(),
      ip: clientIp(req),
    });
    return NextResponse.json({ ok: false, error: "That email and password don't match." }, { status: 401 });
  }

  /* Stamped here rather than on every request: "last seen" means last SIGNED
     IN, which is the question the admin centre asks. Updating it per request
     would make it "last loaded a page", a different and less useful fact, and
     a write on every single request. */
  await q(`update os_users set last_seen_at = now() where id = $1`, [user.id]).catch(() => {});
  await record({
    kind: "sign_in",
    actorId: user.id,
    actorEmail: user.email,
    ip: clientIp(req),
  });

  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions(body.remember !== false));
  return res;
}
