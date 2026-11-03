import "server-only";
import { markOffline } from "@/lib/advert-offline";
import { record } from "@/lib/audit";
import { hasDb, q } from "@/lib/db";
import { takeAdvertOff } from "@/lib/listing-take-off";
import { movedInReport, type MovedInRow } from "@/lib/listings-moved-in";
import { londonToday } from "@/lib/london-clock";
import { rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { rexIsDown } from "@/lib/rex-outage";
import { switchOn } from "@/lib/switches";
import { isTestId } from "@/lib/test-overlay";

/**
 * LET ADVERTS TAKEN DOWN BY THEMSELVES (Susan Liles, 3 Nov 2026).
 *
 * "Can we add a setting so that any properties Let Agreed that have actually
 * moved in and past 14 days from move in date that the adverts are removed
 * from the portals?"
 *
 * The setting is the switch "Take let adverts down automatically" on Admin >
 * Switches (lib/switches, listing_auto_takedown), OFF until an owner arms it.
 * Once a day, from 11:00 London, on the hourly reminders run
 * (/api/reminders/run, os-cron-reminders - a cron proven to run; the
 * lunchtime one's deployment never calls its portal-figures sweep), every home
 * on the owners' Moved In and Still Advertised list (lib/listings-moved-in,
 * read fresh) is taken off the portals with exactly the steps the list's own
 * Take the advert down runs: lib/listing-take-off, then the OS's Offline
 * marker. So the button and the job cannot differ.
 *
 * Guards, in the order they bite:
 *   - the switch off: nothing at all. No REX call, no write, not even the read
 *     of the list. Unreadable is off (lib/switches switchOn).
 *   - not before RUN_FROM_HOUR London: office hours, so a home taken down
 *     by mistake is seen the same day.
 *   - once per London day: a row in os_auto_takedown_runs claimed BEFORE the
 *     read, so a second cron, a rerun after a REX outage or two servers can
 *     never run it twice. No database, no run.
 *   - test listings never (lib/test-overlay isTestId).
 *   - at most RUN_CAP homes a run, longest moved in first, so a bad read can't
 *     sweep the whole book in one go. The rest wait for tomorrow.
 *   - REX going down mid-run stops the run: rexCall would queue the writes to
 *     send later, and a take-down a day late is not worth a surprise.
 *   - REX_ALLOW_WRITES not naming the writes stops the run on the first home,
 *     said once in the log.
 *
 * Done as the office account: there is no person pressing anything, and the
 * other server-side REX writes (certificates, signed terms) are the office
 * account too. An agent's own sign-in would lapse and leave their homes up.
 * The OS's activity log (os_audit, listing_publication) says it was the
 * automatic take-down, with the move-in date it went on.
 */

export const AUTO_TAKEDOWN_SWITCH = "listing_auto_takedown";
/** A day's most. The list was 78 homes on 3 Nov 2026. */
export const RUN_CAP = 100;
/** Not before 11:00 London. */
export const RUN_FROM_HOUR = 11;
const londonHour = () => Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }));
const BY = { name: "Automatic take-down", email: "" };

let ready: Promise<void> | null = null;
async function rq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_auto_takedown_runs (
      day         TEXT PRIMARY KEY,
      started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      listed      INT,
      taken       INT NOT NULL DEFAULT 0,
      failed      INT NOT NULL DEFAULT 0,
      held        INT NOT NULL DEFAULT 0,
      note        TEXT NOT NULL DEFAULT '',
      homes       JSONB NOT NULL DEFAULT '[]'::jsonb
    )`)
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
  return q<T>(text, params);
}

type Home = Pick<MovedInRow, "listingId" | "address" | "moveIn" | "days">;

export interface AutoTakeDownRun {
  /** False when nothing was taken down and nothing was asked of REX. */
  ran: boolean;
  why?: "off" | "not-yet" | "already-today" | "no-rex" | "no-db" | "busy" | "unreadable";
  day: string;
  /** On the list today, test listings left out. */
  listed: number;
  /** The homes this run takes down (or, in a dry run, would). */
  homes: Home[];
  taken: Home[];
  failed: (Home & { why: string })[];
  /** Over the day's cap, left for tomorrow. */
  held: number;
  note: string;
  dryRun: boolean;
}

export interface AutoTakeDownState {
  on: boolean;
  cap: number;
  last: { day: string; startedAt: string; finishedAt: string | null; listed: number | null; taken: number; failed: number; held: number; note: string } | null;
}

/** What the owners' list shows: the switch, and the last run. */
export async function autoTakeDownState(): Promise<AutoTakeDownState> {
  const on = await switchOn(AUTO_TAKEDOWN_SWITCH).catch(() => false);
  let last: AutoTakeDownState["last"] = null;
  if (hasDb()) {
    const rows = await rq<{ day: string; started_at: Date; finished_at: Date | null; listed: number | null; taken: number; failed: number; held: number; note: string }>(
      `SELECT day, started_at, finished_at, listed, taken, failed, held, note FROM os_auto_takedown_runs ORDER BY day DESC LIMIT 1`
    ).catch(() => []);
    const r = rows[0];
    if (r) {
      last = {
        day: r.day,
        startedAt: new Date(r.started_at).toISOString(),
        finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
        listed: r.listed,
        taken: r.taken,
        failed: r.failed,
        held: r.held,
        note: r.note,
      };
    }
  }
  return { on, cap: RUN_CAP, last };
}

let running = false;

/**
 * The day's run. `dryRun` reads the list and says which homes it would take
 * down, writing nothing anywhere; `switchOn` stands in for the switch for this
 * call only (verification), and is never saved.
 */
export async function runAutoTakeDown(opts: { dryRun?: boolean; switchOn?: boolean } = {}): Promise<AutoTakeDownRun> {
  const day = londonToday();
  const dryRun = Boolean(opts.dryRun);
  const empty = (why: AutoTakeDownRun["why"], note = ""): AutoTakeDownRun => ({ ran: false, why, day, listed: 0, homes: [], taken: [], failed: [], held: 0, note, dryRun });

  /* The switch first, before anything else is read or written. */
  const on = opts.switchOn ?? (await switchOn(AUTO_TAKEDOWN_SWITCH).catch(() => false));
  if (!on) return empty("off");
  if (!dryRun && londonHour() < RUN_FROM_HOUR) return empty("not-yet");
  if (!rexConfigured()) return empty("no-rex");
  if (running) return empty("busy");
  running = true;
  try {
    if (!dryRun) {
      if (!hasDb()) return empty("no-db");
      const claimed = await rq<{ day: string }>(`INSERT INTO os_auto_takedown_runs (day) VALUES ($1) ON CONFLICT (day) DO NOTHING RETURNING day`, [day]);
      if (!claimed.length) return empty("already-today");
    }

    const finish = async (run: AutoTakeDownRun) => {
      if (dryRun) return run;
      await rq(
        `UPDATE os_auto_takedown_runs SET finished_at = NOW(), listed = $2, taken = $3, failed = $4, held = $5, note = $6, homes = $7::jsonb WHERE day = $1`,
        [day, run.listed, run.taken.length, run.failed.length, run.held, run.note.slice(0, 500), JSON.stringify({ taken: run.taken, failed: run.failed })]
      ).catch((e) => console.error("[auto-takedown] could not note the run", e));
      return run;
    };

    let report;
    try {
      report = await movedInReport(true);
    } catch (e) {
      console.error("[auto-takedown] the list could not be read", e);
      return finish({ ...empty("unreadable", "The list could not be read, so nothing was taken down."), ran: false });
    }
    const listed = report.rows.filter((r) => !isTestId(r.listingId));
    /* Longest moved in first, as the list sorts them. */
    const homes: Home[] = listed.slice(0, RUN_CAP).map((r) => ({ listingId: r.listingId, address: r.address, moveIn: r.moveIn, days: r.days }));
    const held = listed.length - homes.length;
    const run: AutoTakeDownRun = { ran: !dryRun && homes.length > 0, day, listed: listed.length, homes, taken: [], failed: [], held, note: "", dryRun };
    if (dryRun || !homes.length) return finish(run);

    for (const h of homes) {
      if (await rexIsDown()) {
        run.note = "REX went down, so the rest wait for tomorrow.";
        break;
      }
      let done;
      try {
        done = await takeAdvertOff(Number(h.listingId), null);
      } catch (e) {
        if (e instanceof RexWriteBlocked) {
          run.note = `Locked on this environment: ${e.message.match(/Refusing to call (\S+)/)?.[1] ?? "a write"} is not in REX_ALLOW_WRITES. Nothing was taken down.`;
          break;
        }
        run.failed.push({ ...h, why: e instanceof Error ? e.message.slice(0, 200) : "REX did not answer." });
        continue;
      }
      if (!done.ok) {
        /* Not published any more: off already, nothing to do and nothing failed. */
        if (done.step === "not-published") continue;
        const why = String(done.error ?? "REX did not say.")
          .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[removed]"')
          .replace(/\b[0-9a-f]{4}(?:-[0-9a-f]{4}){4,}\b/gi, "[removed]")
          .slice(0, 300);
        run.failed.push({ ...h, why });
        await record({ kind: "listing_publication", actorEmail: "", detail: `${h.listingId}: off REFUSED (automatic take-down, moved in ${h.moveIn}) as the office account - ${why}` }).catch(() => {});
        continue;
      }
      /* Then the OS's own marker, as the list's button does. */
      await markOffline(h.listingId, null, BY).catch((e) => console.error("[auto-takedown] Offline marker not saved", h.listingId, e));
      await record({
        kind: "listing_publication",
        actorEmail: "",
        detail: `${h.listingId}: off (automatic take-down, moved in ${h.moveIn}, ${h.days} days ago) (${done.was.status ?? "?"} [${done.was.channels.join(",")}] -> ${done.now.status ?? "?"} [${done.now.channels.join(",")}]) as the office account`,
      }).catch(() => {});
      run.taken.push(h);
    }
    console.log(`[auto-takedown] ${day}: ${run.taken.length} taken down, ${run.failed.length} refused, ${held} held over${run.note ? ` - ${run.note}` : ""}`);
    return finish(run);
  } finally {
    running = false;
  }
}
