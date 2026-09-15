import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { changeViewing } from "@/lib/viewing-change";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST → cancel or move a viewing (lib/viewing-change, 15 Sep 2026).
 * Body: { viewingId, action: "cancel"|"move", reason?, reasonText?, newStartsAt?,
 *         oldStartsAt, minutes, applicantName, applicantEmail, address }.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, said: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const action = str("action");
  const valid = (iso: string) => Boolean(iso) && !Number.isNaN(new Date(iso).getTime());
  if (!str("viewingId") || (action !== "cancel" && action !== "move") || !valid(str("oldStartsAt"))) {
    return NextResponse.json({ ok: false, said: "Which viewing, and cancel or move?" }, { status: 400 });
  }
  if (action === "move" && !valid(str("newStartsAt"))) {
    return NextResponse.json({ ok: false, said: "Pick the new time first." }, { status: 400 });
  }
  const out = await changeViewing(actor, {
    viewingId: str("viewingId"),
    action,
    reason: str("reason") === "applicant" ? "applicant" : "organiser",
    reasonText: str("reasonText"),
    newStartsAt: str("newStartsAt") || undefined,
    oldStartsAt: str("oldStartsAt"),
    minutes: Number(b.minutes) || 30,
    applicantName: str("applicantName") || "The applicant",
    applicantEmail: str("applicantEmail") || null,
    address: str("address") || "the property",
    unaccompanied: b.unaccompanied === true,
  });
  return NextResponse.json({ ok: true, ...out });
}
