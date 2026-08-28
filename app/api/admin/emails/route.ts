import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { TLE_EMAILS } from "@/lib/email/tle-emails";

/**
 * The email catalogue, rendered.
 *
 * Owner-only, and 404 rather than 403 for the same reason as the rest of the
 * admin API: a 403 confirms the route exists.
 *
 * Two shapes on purpose. The LIST is metadata only, because rendering nine
 * full HTML documents to draw a list of titles is a quarter of a megabyte
 * nobody reads. One email's HTML comes back only when somebody opens it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });

  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const entry = TLE_EMAILS.find((e) => e.id === id);
    if (!entry) return NextResponse.json({ ok: false, error: "No such email." }, { status: 404 });
    try {
      const { subject, html } = entry.render();
      return NextResponse.json({ ok: true, id: entry.id, name: entry.name, subject, html });
    } catch (e) {
      /* A template that throws must say WHICH one and why. The catalogue is
         the last place an email is looked at before it goes to a partner, so
         a silent blank preview here is worse than an error on the page. */
      return NextResponse.json(
        {
          ok: false,
          error: `"${entry.name}" failed to render: ${e instanceof Error ? e.message : "unknown"}`,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    rows: TLE_EMAILS.map((e) => ({
      id: e.id,
      group: e.group,
      name: e.name,
      audience: e.audience,
      trigger: e.trigger,
      fires: e.fires,
      to: e.to,
      draft: Boolean(e.draft),
      summary: e.summary,
    })),
  });
}
