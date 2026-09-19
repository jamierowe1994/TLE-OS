import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getApplicationById } from "@/lib/applications";
import { rexConfigured } from "@/lib/rex";
import { journeyFor } from "@/lib/application-journey";
import { isTestId, testApplication, testJourney } from "@/lib/test-overlay";

/**
 * GET /api/applications/{id}/journey → the spine, the agent's actions, and
 * Kirstie's flags for one application. See lib/application-journey.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId || !(await findUserById(userId))) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }
  if (isTestId(id)) {
    const t = await testApplication(id);
    return t ? NextResponse.json({ ok: true, test: true, ...testJourney(t.app, t.deal) }) : NextResponse.json({ ok: false, error: "That test application has gone." }, { status: 404 });
  }
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "Applications aren't connected here." }, { status: 503 });

  /* The book, then the one. TenancyApplications has no id criterion that
     behaves, which is why every reader here pulls and matches. */
  const app = await getApplicationById(id);
  if (!app) return NextResponse.json({ ok: false, error: `No application ${id}.` }, { status: 404 });

  try {
    return NextResponse.json({ ok: true, ...(await journeyFor(app)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "read failed" }, { status: 502 });
  }
}
