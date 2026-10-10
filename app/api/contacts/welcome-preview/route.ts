import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { SITE } from "@/lib/email/tle-documents";
import { phoneForEmail } from "@/lib/agent-phone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The welcome a new tenant contact is sent, exactly as it would go, for the
 * New lead panel's "See the email they'll get" (10 Oct 2026, Rig run 2,
 * P-012). The panel drew its own wireframe before - "Your account is ready.
 * Set a password", a "Set up my account" button onto a mock page - which was
 * never the email: the real one (tenant-added-welcome, lib/tenant-journey-
 * emails sendAddedWelcome) asks them to reply and has no button. Same
 * renderer as the send, builder edits included, so the two cannot drift.
 */
export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  try {
    const { subject, html } = await renderTleEmailLive("tenant-added-welcome", {
      firstName: name.split(/\s+/)[0] || "there",
      agentName: actor.name || "The Letting Experts",
      agentPhone: await phoneForEmail(actor.id),
      onNowLine: "",
      link: `${SITE}/tenant/sign-in`,
    });
    return NextResponse.json({ ok: true, subject, html });
  } catch {
    return NextResponse.json({ ok: false, error: "We couldn't draw the email just now." }, { status: 500 });
  }
}
