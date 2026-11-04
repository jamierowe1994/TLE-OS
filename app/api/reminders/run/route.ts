import { warmDiary } from "@/lib/diary-cache";
import { publicError } from "@/lib/public-error";
import { after, NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { AUTO_TAKEDOWN_SWITCH, runAutoTakeDown } from "@/lib/listings-auto-takedown";
import { runReminders } from "@/lib/reminders";
import { switchOn } from "@/lib/switches";
import { worksSweep } from "@/lib/works-sweep";
import { sweepTickets } from "@/lib/ticket-sweep";
import { publicOrigin } from "@/lib/origin";

/**
 * The reminders run.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://tle-os.co.uk/api/reminders/run
 *
 * Hourly at five past, from the os-cron-reminders service on Railway. Works
 * out, for every person with an OS account, what on their book needs them
 * today (lib/reminders), writes it to os_reminders, and clears whatever has
 * been dealt with since. An owner can also press it to see the run's own
 * account of itself.
 *
 * From the cron it also starts the day's automatic take-down of let adverts
 * when Take let adverts down automatically is on (lib/listings-auto-takedown,
 * 3 Nov 2026).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(req: NextRequest) {
  const owner = await requireCapability(req, "see:everything");
  if (!owner && !cronAuthorised(req)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  /* The diary is kept warm from here (19 Sep 2026): this is the timer that
     already runs every five minutes, and a cold diary is the half-minute hole
     in the first dashboard of the morning. Started first so it runs beside the
     reminders rather than after them; it never throws. */
  const diaryWarm = warmDiary();
  /* LET ADVERTS TAKEN DOWN (Susan Liles, 3 Nov 2026; lib/listings-auto-takedown).
     On this hourly timer because it is one that is proven to run: the
     lunchtime cron's deployment still carries its old command and never
     calls the portal-figures sweep. From the cron only, never an owner's
     press. The switch is read now: off, nothing else happens. On, the run
     goes on after the answer (a fresh read of every let home's feeds, then
     the take-downs, longer than the cron waits) and keeps its own guards:
     from 11:00 London, at most once a London day. */
  const autoOn = cronAuthorised(req) ? await switchOn(AUTO_TAKEDOWN_SWITCH).catch(() => false) : false;
  if (autoOn) {
    after(() =>
      runAutoTakeDown()
        .then((r) => console.log("[reminders/run] automatic take-down", r.why ?? `${r.taken.length} taken down, ${r.failed.length} refused, ${r.held} held over`))
        .catch((e) => console.error("[reminders/run] automatic take-down failed", e))
    );
  }
  const run = await runReminders();
  const works = await worksSweep().catch((e) => ({ doneRequests: 0, failed: publicError(e, "failed") }));
  /* Tickets that close themselves (lib/ticket-sweep, 4 Nov 2026): an outage
     on REX's or Propoly's side once it has gone quiet, and anything a live
     fix carries a marker for. Never throws. */
  const tickets = await sweepTickets(publicOrigin(req));
  return NextResponse.json({ ...run, works, tickets, diary: await diaryWarm, autoTakeDown: autoOn ? "asked" : "off" }, { status: run.ok ? 200 : 503 });
}
