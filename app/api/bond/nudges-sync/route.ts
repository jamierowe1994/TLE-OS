import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { requireCapability } from "@/lib/admin";
import { buildNudges, syncRexDoors } from "@/lib/bond-nudges";

/**
 * Read our own book out of REX, then build the call list.
 *
 * POST → 202 at once; the read runs on in the background and the row in
 *        os_bond_rex_sync says how it went. The edge closes a request at 100
 *        seconds and this takes minutes: pages of withdrawn and let listings,
 *        the lettings appraisals, and a batch of property reads for the
 *        landlords behind the appraisals.
 * GET  → the last few runs.
 *
 * Machine route: the daily workflow calls it with the cron key after the
 * sweep. REX is only ever read.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/* The cron key, or somebody who may work the switches. This path skips the
   sign-in door, and until 18 Sep 2026 nothing here checked anything: anybody on
   the internet could start a minutes-long read of the whole book, over and
   over, on our rate limit. */
async function allowed(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (secret && given) {
    const a = Buffer.from(secret);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return Boolean(await requireCapability(req, "manage:switches").catch(() => null));
}

export async function GET(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const runs = await q<Record<string, unknown>>(`SELECT * FROM os_bond_rex_sync ORDER BY id DESC LIMIT 5`);
  return NextResponse.json({ ok: true, runs });
}

export async function POST(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  await q(`UPDATE os_bond_rex_sync SET status = 'failed', error = 'interrupted, most likely by a deploy', finished_at = NOW()
            WHERE status = 'running' AND started_at < NOW() - INTERVAL '40 minutes'`);
  const running = await q<{ id: number }>(`SELECT id FROM os_bond_rex_sync WHERE status = 'running'`);
  if (running[0]) return NextResponse.json({ ok: false, error: "A read is already going.", runId: running[0].id }, { status: 409 });
  const wait = req.nextUrl.searchParams.get("wait") === "1";
  const [run] = await q<{ id: number }>(`INSERT INTO os_bond_rex_sync (status) VALUES ('running') RETURNING id`);
  const runId = run.id;

  const work = (async () => {
    try {
      const r = await syncRexDoors();
      if (!r.ok) throw new Error(r.reason ?? "read failed");
      const b = await buildNudges();
      await q(
        `UPDATE os_bond_rex_sync SET status = 'done', withdrawn = $2, leased = $3, appraisals = $4, contacts_read = $5, contacts_left = $6,
                nudges = $7, matched = $8, finished_at = NOW() WHERE id = $1`,
        [runId, r.withdrawn, r.leased, r.appraisals, r.contactsRead, r.contactsLeft, b.nudges, b.matched]
      );
      return { ...r, ...b };
    } catch (e) {
      await q(`UPDATE os_bond_rex_sync SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`, [runId, (e as Error).message]);
      throw e;
    }
  })();

  if (wait) {
    try {
      return NextResponse.json({ ...(await work), ok: true, runId });
    } catch (e) {
      return NextResponse.json({ ok: false, runId, error: (e as Error).message }, { status: 502 });
    }
  }
  work.catch(() => null);
  return NextResponse.json({ ok: true, started: true, runId }, { status: 202 });
}
