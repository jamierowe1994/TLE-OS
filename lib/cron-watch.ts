import "server-only";
import { hasDb, q } from "@/lib/db";
import { isFresh, rentBook } from "@/lib/rent-status";

/* ==========================================================================
   WHEN A TIMER STOPS (28 Oct 2026).

   From 07:15 on 27 Oct the scheduled-sends timer on Railway started every
   five minutes and never reached the OS. Nothing said so. The rent box sat
   on "last checked on Monday 26 October at 16:02" for 28 hours, passport
   reminders queued up unsent, and James found it from a screenshot.

   So the scheduled-sends run notes the time it was reached (beat), and the
   push scan - a different timer, every five minutes - looks at that and at
   the age of the rent read (checkCronWatch). Each stoppage is written down
   once in os_cron_watch, with when it started and when it came back, and
   James's and Howard's bells read that (watchNotices).

     scheduled-sends   not reached for 20 minutes (four missed runs)
     rent read         the stored read is older than the rent box will show
   ========================================================================== */

/** Who hears about it (James, 28 Oct 2026: "warn me and Howard"). */
export const WATCHERS = ["james@therecruitmentexperts.co.uk", "howard.russell@theexpertsgroup.co.uk"];

const BEAT_LATE_MS = 20 * 60_000;

type Watch = "scheduled-sends" | "rent-read";

let ready: Promise<void> | null = null;
async function wq<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_cron_beats (
      name TEXT PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS os_cron_watch (
      id BIGSERIAL PRIMARY KEY,
      watch TEXT NOT NULL,
      since TIMESTAMPTZ NOT NULL,
      noticed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      back_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS os_cron_watch_open ON os_cron_watch (watch) WHERE back_at IS NULL`)
    .then(() => undefined)
    .catch(() => { ready = null; });
  await ready;
  return q<T>(text, params);
}

/** The timer reached the OS. Called at the top of each scheduled-sends run. */
export async function beat(name: Watch): Promise<void> {
  if (!hasDb()) return;
  await wq(`INSERT INTO os_cron_beats (name, at) VALUES ($1, NOW()) ON CONFLICT (name) DO UPDATE SET at = NOW()`, [name]).catch(() => {});
}

/**
 * Opens a stoppage when one starts and closes it when it ends. Called by the
 * push scan, so it still runs when scheduled-sends is the timer that stopped.
 */
export async function checkCronWatch(): Promise<{ stopped: Watch[] }> {
  if (!hasDb()) return { stopped: [] };
  const stopped: Watch[] = [];

  const [b] = await wq<{ at: Date }>(`SELECT at FROM os_cron_beats WHERE name = 'scheduled-sends'`).catch(() => []);
  /* No beat yet means this has only just shipped: nothing to judge. */
  if (b) {
    const last = new Date(b.at).getTime();
    await settle("scheduled-sends", Date.now() - last > BEAT_LATE_MS ? new Date(last) : null);
    if (Date.now() - last > BEAT_LATE_MS) stopped.push("scheduled-sends");
  }

  const book = await rentBook().catch(() => null);
  if (book) {
    const late = !isFresh(book);
    await settle("rent-read", late ? new Date(book.at) : null);
    if (late) stopped.push("rent-read");
  }
  return { stopped };
}

/** since = when it was last fine, or null if it's fine now. */
async function settle(watch: Watch, since: Date | null): Promise<void> {
  if (since) {
    await wq(`INSERT INTO os_cron_watch (watch, since) VALUES ($1, $2) ON CONFLICT (watch) WHERE back_at IS NULL DO NOTHING`, [watch, since]).catch(() => {});
  } else {
    await wq(`UPDATE os_cron_watch SET back_at = NOW() WHERE watch = $1 AND back_at IS NULL`, [watch]).catch(() => {});
  }
}

const TITLE: Record<Watch, { open: string; closed: string }> = {
  "scheduled-sends": { open: "Scheduled emails have stopped", closed: "Scheduled emails were stopped" },
  "rent-read": { open: "The rent isn't being read from PayProp", closed: "The rent wasn't read from PayProp" },
};

const when = (d: Date) =>
  new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** The bell lines: open stoppages, and ones that ended in the last three days. */
export async function watchNotices(): Promise<Array<{ id: string; at: string; title: string; body: string; tone: "warn" | "none" }>> {
  if (!hasDb()) return [];
  const rows = await wq<{ id: string; watch: Watch; since: Date; noticed_at: Date; back_at: Date | null }>(
    `SELECT id, watch, since, noticed_at, back_at FROM os_cron_watch
      WHERE back_at IS NULL OR back_at > NOW() - INTERVAL '3 days'
      ORDER BY noticed_at DESC LIMIT 10`
  ).catch(() => []);
  return rows.map((r) => {
    const open = !r.back_at;
    const since = when(r.since);
    const body =
      r.watch === "scheduled-sends"
        ? open
          ? `The Railway timer os-cron-scheduled-sends hasn't reached the OS since ${since}. Pre-presentations, passport reminders, deck chases and the rent read are waiting behind it. Redeploying the timer on Railway restarts it.`
          : `The Railway timer os-cron-scheduled-sends didn't reach the OS from ${since} until ${when(r.back_at!)}. It's running again.`
        : open
          ? `The last rent read from PayProp was ${since}, so every home's rent box says the rent can't be shown. Check os-cron-scheduled-sends, and Admin > Connections for PayProp.`
          : `The rent went unread from ${since} until ${when(r.back_at!)}. It's reading again.`;
    return { id: `cron-watch:${r.id}:${open ? "open" : "back"}`, at: new Date(open ? r.noticed_at : r.back_at!).toISOString(), title: open ? TITLE[r.watch].open : TITLE[r.watch].closed, body, tone: open ? "warn" : "none" };
  });
}
