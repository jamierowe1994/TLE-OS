import { NextRequest, NextResponse } from "next/server";
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
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected an email and a password." }, { status: 400 });
  }

  const user = await authenticate(body.email ?? "", body.password ?? "");
  if (!user) {
    // One message for both wrong-address and wrong-password: saying which
    // confirms whether an address has an account here.
    await record({
      kind: "sign_in_failed",
      actorEmail: (body.email ?? "").trim().toLowerCase(),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
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
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
  });

  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions(body.remember !== false));
  return res;
}
