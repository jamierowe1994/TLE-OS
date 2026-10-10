import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { getOrder } from "@/lib/works-orders";
import { getLandlordPref, setLandlordPref, JOB_EMAILS, type JobEmails } from "@/lib/landlord-prefs";

/**
 * A landlord's job-email choice (lib/landlord-prefs): every job, only over a
 * figure, or none - we ring them.
 *
 * GET   ?job=<works order id>  the landlord on that job
 *       ?landlord=<email>      the landlord on a Portfolio card
 * PATCH { job | landlord, jobEmails, overAmount, name? }
 *
 * Any signed-in member of staff, as the job routes beside it. Saved under
 * the person's name.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function emailFrom(job: string | null | undefined, landlord: string | null | undefined): Promise<{ email: string; name: string } | null> {
  if (job) {
    const found = await getOrder(job);
    return found ? { email: found.order.landlordEmail, name: found.order.landlord } : null;
  }
  return landlord ? { email: landlord, name: "" } : null;
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const who = await emailFrom(req.nextUrl.searchParams.get("job"), req.nextUrl.searchParams.get("landlord"));
  if (!who) return NextResponse.json({ ok: false, error: "Which landlord?" }, { status: 400 });
  if (!who.email.includes("@")) return NextResponse.json({ ok: true, hasEmail: false, pref: null });
  const pref = await getLandlordPref(who.email);
  return NextResponse.json({ ok: true, hasEmail: true, pref });
}

export async function PATCH(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { job?: string; landlord?: string; jobEmails?: string; overAmount?: number; name?: string } | null;
  if (!b || !JOB_EMAILS.includes(b.jobEmails as JobEmails)) return NextResponse.json({ ok: false, error: "Every job, only over a figure, or none." }, { status: 400 });
  const who = await emailFrom(b.job, b.landlord);
  if (!who) return NextResponse.json({ ok: false, error: "Which landlord?" }, { status: 400 });
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    const pref = await setLandlordPref(who.email, { jobEmails: b.jobEmails as JobEmails, overAmount: b.overAmount, name: b.name || who.name }, by);
    return NextResponse.json({ ok: true, hasEmail: true, pref });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save.") }, { status: 400 });
  }
}
