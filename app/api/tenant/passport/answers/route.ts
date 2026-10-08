import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { can } from "@/lib/roles";
import { findDonePassportByEmail, findPassportByEmail, getPassport } from "@/lib/passport";
import { householdIncome } from "@/lib/passport-shape";

/**
 * GET /api/tenant/passport/answers?email= -> the tenant's passport, every answer
 *
 * For the agent's read-only view (James, 8 Oct 2026): "we don't want to have
 * to click through all the questions to find the answer we need. We just want
 * a list of all of the answers." The passport link itself is the tenant's own
 * form; this is the agent's way in, staff only, and it never writes.
 *
 * The agent's own passport for that email, or - for the office, which sees
 * everybody - a finished one of anyone's, exactly as the invite GET decides.
 */

/* Postgres's "2026-10-07 12:00:03.05+00" as ISO, which every browser reads. */
const iso = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim();
  if (!email.includes("@")) return NextResponse.json({ ok: false, error: "Whose passport?" }, { status: 400 });

  const own = await findPassportByEmail(email, me.id).catch(() => null);
  const ownRec = own ? await getPassport(own.token).catch(() => null) : null;
  const rec =
    ownRec?.submittedAt || !can(me.role, "see:everything")
      ? ownRec
      : await findDonePassportByEmail(email)
          .then((d) => (d ? getPassport(d.token) : ownRec))
          .catch(() => ownRec);
  if (!rec) return NextResponse.json({ ok: false, error: "There's no passport for them yet." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    name: rec.data.legalName || rec.name,
    email: rec.email,
    submittedAt: iso(rec.submittedAt),
    updatedAt: iso(rec.updatedAt),
    householdIncome: householdIncome(rec.data).total,
    data: rec.data,
  });
}
