import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getApplicationById } from "@/lib/applications";
import { rexConfigured } from "@/lib/rex";
import { introOnlyTestJourney, journeyFor } from "@/lib/application-journey";
import { isIntroOnly } from "@/lib/intro-only";
import { isTestId, testApplication, testJourney } from "@/lib/test-overlay";
import { getCase } from "@/lib/plc-store";
import { caseIdFor } from "@/lib/plc";

/**
 * GET /api/applications/{id}/journey → the spine, the agent's actions, and
 * Kirstie's flags for one application. See lib/application-journey.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  /* Looked up once, here, and used again for the agent gate below. */
  const me = userId ? await findUserById(userId) : null;
  if (!me) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }
  if (isTestId(id)) {
    const [t, plc] = await Promise.all([testApplication(id), getCase(caseIdFor(id)).catch(() => null)]);
    if (!t) return NextResponse.json({ ok: false, error: "That test application has gone." }, { status: 404 });
    const j = testJourney(t.app, t.deal, plc);
    /* Intro only on a test file too (lib/intro-only). */
    const intro = await isIntroOnly(t.app.listingId).catch(() => false);
    return NextResponse.json({ ok: true, test: true, ...(intro ? introOnlyTestJourney(j, t.app.status === "accepted") : j) });
  }
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "Applications aren't connected here." }, { status: 503 });

  /* The book, then the one. TenancyApplications has no id criterion that
     behaves, which is why every reader here pulls and matches. */
  const app = await getApplicationById(id);
  if (!app) return NextResponse.json({ ok: false, error: `No application ${id}.` }, { status: 404 });
  /* An agent reads their own applications (18 Sep sweep, item 4). The
     application names its agent; owners and the office are not gated. */
  if (me.role === "agent" && app.agent && app.agent.trim().toLowerCase() !== (me.name ?? "").trim().toLowerCase()) {
    return NextResponse.json({ ok: false, error: `That application is ${app.agent.split(/\s+/)[0]}'s.` }, { status: 403 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await journeyFor(app)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "read failed") }, { status: 502 });
  }
}
