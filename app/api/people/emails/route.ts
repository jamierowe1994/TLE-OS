import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { badEmail, emailsFor, kindOf, MAX_EXTRAS, saveEmails } from "@/lib/landlord-emails";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * A landlord's other email addresses (lib/landlord-emails), one person at a time.
 *
 * GET  ?email=&ref=                                   -> { ok, emails }
 * PUT  { email?, ref?, was?, name?, mainKind, extras: [{ email, kind }] } -> { ok, emails }
 *
 * Staff only. Saved on the OS record; nothing is written to REX, PayProp or
 * Propoly (Dan Richards, ticket 190230a3; James, 10 Nov 2026).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const u = req.nextUrl.searchParams;
  const email = s(u.get("email"), 200);
  const ref = s(u.get("ref"), 120);
  if (!email && !ref) return NextResponse.json({ ok: true, emails: null });
  try {
    return NextResponse.json({ ok: true, emails: await emailsFor({ email, ref }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Their other emails couldn't be read just now.") }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = s(b?.email, 200).toLowerCase();
  const ref = s(b?.ref, 120);
  if (!email && !ref) return NextResponse.json({ ok: false, error: "Add their main email first, so the others have somebody to belong to." }, { status: 400 });
  const extras = (Array.isArray(b?.extras) ? b.extras : [])
    .map((x) => ({ email: s((x as Record<string, unknown>)?.email, 200), kind: kindOf((x as Record<string, unknown>)?.kind) }))
    .filter((x) => x.email);
  const bad = badEmail(extras);
  if (bad) return NextResponse.json({ ok: false, error: `"${bad}" doesn't look like an email address.` }, { status: 400 });
  if (extras.length > MAX_EXTRAS) return NextResponse.json({ ok: false, error: `Up to ${MAX_EXTRAS} other emails.` }, { status: 400 });
  try {
    const emails = await saveEmails({ email, ref, was: s(b?.was, 200), name: s(b?.name, 160), mainKind: kindOf(b?.mainKind), extras, by: actor.email });
    await record({
      kind: "landlord_emails_saved",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${email || ref}: main email ${emails.mainKind}, ${emails.extras.length} other email${emails.extras.length === 1 ? "" : "s"}`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, emails });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Their other emails didn't save.") }, { status: 500 });
  }
}
