import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { requireAnyCapability } from "@/lib/admin";
import { FRESH_MS, refreshComplianceBook } from "@/lib/compliance-cache";
import { rexConfigured } from "@/lib/rex";
import { noteFailure } from "@/lib/auto-bugs";

/**
 * Sweep the compliance book before anybody asks for it.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * James, 6 Sep: the compliance area "is still running pretty slow". Measured,
 * the server is not: /compliance answers in 18ms and /api/compliance in 25.
 * What is slow is the one path nobody had covered — a cache older than 24
 * hours, where `getComplianceBook` makes the CALLER wait for the whole sweep.
 * The code's own note calls that thirty seconds, and the service's p99 shows
 * exactly 30,000ms spikes.
 *
 * Nothing was warming it. Every refresh happened as a side effect of somebody
 * using the page, uploading a certificate, or a PLC write. So the book stayed
 * warm all the time it was being used and went cold overnight — which is
 * precisely the shape of "I go in and it's slow, I go in again and it's fine".
 * The first person in each morning was paying for everybody.
 *
 * ── Who waits, not how fast ───────────────────────────────────────────────
 *
 * Same argument as the income warmer next door. The sweep does not get any
 * quicker; it stops happening while somebody is watching.
 *
 * ── Two ways in ───────────────────────────────────────────────────────────
 *
 * A cron with the shared secret, and a signed-in person who can see the book
 * anyway. Cron cannot hold a session, and a route that starts a thirty-second
 * walk of the slowest service we talk to should not be open to anyone who
 * finds the URL.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* The sweep is thirty chunked queries against a superlinear-slow service.
   Being killed halfway means the next caller starts over, which is the exact
   thing this route exists to prevent. */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  /* x-cron-key, which is what every other scheduled route in this codebase
     reads and what the Railway cron services already send. The income warmer
     next door uses x-cron-secret and is the odd one out; matching IT would
     have meant a second header nobody could guess from the neighbours. */
  const secret = process.env.CRON_SECRET;
  const offered = req.headers.get("x-cron-key") ?? "";
  const byCron = Boolean(secret && offered && offered === secret);
  const byPerson = Boolean(
    await requireAnyCapability(req, ["see:reports", "see:everything"])
  );
  if (!byCron && !byPerson) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }

  if (!rexConfigured()) {
    return NextResponse.json({ ok: true, warmed: false, reason: "REX isn't connected here." });
  }

  const started = Date.now();
  /* ANSWER BEFORE THE DOOR SHUTS (4 Oct 2026). The sweep takes two to three
     minutes and Cloudflare hangs up on any request at 100 seconds, so every
     cron run from 28 Sep onwards logged a 524 even though the sweep finished
     on the server - and a real failure looked exactly the same. Now the route
     answers at 80 seconds with "still going", the sweep carries on, and if
     it then fails, that failure is logged where failures are read (Admin,
     Tickets) instead of nowhere. */
  const sweep = refreshComplianceBook();
  sweep.catch((e) => {
    noteFailure({ source: "REX", what: "compliance book sweep", message: publicError(e, "The compliance book sweep failed.") });
  });
  const answerBy = new Promise<"still going">((r) => setTimeout(() => r("still going"), 80_000));
  try {
    /* refreshComplianceBook shares one in-flight sweep, so a cron landing on
       top of a page load costs nothing extra — they wait on the same promise
       rather than starting a second walk. */
    const first = await Promise.race([sweep, answerBy]);
    if (first === "still going") {
      return NextResponse.json(
        { ok: true, warmed: "still going", tookMs: Date.now() - started, note: "The sweep is still running and will finish on its own; a failure is logged as a ticket." },
        { status: 202 }
      );
    }
    const entry = first;
    return NextResponse.json({
      ok: true,
      warmed: true,
      properties: entry.book.properties?.length ?? null,
      tookMs: Date.now() - started,
      /* So a human running this by hand can see whether it was worth it. */
      wouldHaveBeenStaleIn: FRESH_MS,
      by: byCron ? "cron" : "person",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        tookMs: Date.now() - started,
        error: publicError(e, "Couldn't reach REX."),
      },
      { status: 502 }
    );
  }
}
