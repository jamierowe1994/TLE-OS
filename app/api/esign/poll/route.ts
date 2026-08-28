import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { esignRequest } from "@/lib/rex-esign";

/**
 * Noticing that terms came back.
 *
 * REX PUBLISHES NO E-SIGN WEBHOOK. Its nearest events are contracts.created /
 * updated / purged, and those fire on a REX contract record, not on the
 * signature request. So completion has to be noticed rather than announced.
 *
 * A poll on its own can only ever say "this is complete" — never "this just
 * completed". The difference is the whole point: an agent wants telling once,
 * at the moment it lands, not every time a screen refreshes. So this compares
 * REX's status against the last one we recorded, and only a CHANGE counts.
 *
 * Cheap by construction: it asks REX only about requests we have open. Once
 * something is complete it leaves the working set for good.
 *
 * Run it on a cron alongside the campaign runner. It is safe to run twice —
 * the second run finds nothing changed and reports nothing.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  /* No secret set: open on a laptop, CLOSED in production.
     
     This used to return true unconditionally — "an environment nobody has
     locked down yet". That was survivable only while middleware happened to
     redirect every unauthenticated request, which made it look locked when it
     was not. Now that cron routes are deliberately exempt from that redirect
     (they authenticate themselves), an unset secret in production would put
     this endpoint on the open internet. Fail shut. */
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Row = {
  rex_id: string;
  listing_id: string | null;
  ref: string;
  template_name: string;
  sent_by: string;
  last_status: string;
};

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  }

  const open = await q<Row>(
    `SELECT rex_id, listing_id, ref, template_name, sent_by, last_status
       FROM os_esign_watch
      WHERE last_status <> 'completed'
      ORDER BY created_at
      LIMIT 200`
  ).catch(() => []);

  const changed: {
    id: number;
    ref: string;
    template: string;
    sentBy: string;
    from: string;
    to: string;
    completedAt: string | null;
  }[] = [];

  for (const row of open) {
    const live = await esignRequest(row.rex_id).catch(() => null);
    if (!live) {
      // REX unreachable, or the request was deleted there. Record that we
      // looked; do not guess at a status.
      await q(`UPDATE os_esign_watch SET checked_at = NOW() WHERE rex_id = $1`, [row.rex_id]).catch(() => []);
      continue;
    }

    if (live.status !== row.last_status) {
      changed.push({
        id: live.id,
        ref: row.ref,
        template: row.template_name || live.templateName,
        sentBy: row.sent_by || live.sentBy,
        from: row.last_status,
        to: live.status,
        completedAt: live.completedAt,
      });
    }

    await q(
      `UPDATE os_esign_watch
          SET last_status = $2,
              completed_at = $3,
              checked_at = NOW(),
              notified_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE notified_at END
        WHERE rex_id = $1`,
      [row.rex_id, live.status, live.completedAt]
    ).catch(() => []);
  }

  return NextResponse.json({
    ok: true,
    watched: open.length,
    changed,
    signed: changed.filter((c) => c.to === "completed").length,
  });
}

/** A dry read of the same thing, for a screen or for checking by hand. */
export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database." }, { status: 503 });
  const rows = await q<Row & { completed_at: string | null; checked_at: string | null }>(
    `SELECT rex_id, listing_id, ref, template_name, sent_by, last_status, completed_at, checked_at
       FROM os_esign_watch ORDER BY created_at DESC LIMIT 100`
  ).catch(() => []);
  return NextResponse.json({ ok: true, rows });
}
