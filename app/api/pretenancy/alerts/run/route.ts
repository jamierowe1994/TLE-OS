import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { effectivePortalStage, getOverlays } from "@/lib/business/deal-store";
import { loadMoneyContext, moneyForDeal } from "@/lib/business/deal-money";
import { dealAlerts, digestText, type AlertDeal, type DealAlert } from "@/lib/business/deal-alerts";
import { alreadySent, markSent, clearResolved } from "@/lib/business/alert-store";
import { sendEmail } from "@/lib/resend";
import { can } from "@/lib/roles";

/**
 * The thing that notices, and tells somebody.
 *
 * GET  → DRY RUN. Computes the digest and writes nothing. Anyone with
 *        see:pretenancy can open it, so the list can be read before the machine
 *        is ever trusted to send it.
 * POST → the real run. Cron key only.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://<host>/api/pretenancy/alerts/run
 *
 * ── Three locks, and each one is a different fear ─────────────────────────
 *
 * 1. CRON_SECRET, checked in constant time. Without it anybody who guesses a
 *    URL can make the system send mail.
 * 2. PRETENANCY_ALERTS=on. Sending is off until somebody turns it on, exactly
 *    as campaign sending is. A scheduler that has never run in anger should not
 *    have its first run be a real one.
 * 3. The email policy in lib/resend, which refuses any address that is not
 *    internal. That is the reason this version tells Kirstie and nobody else:
 *    the OS domain must never mail a landlord or a tenant, and the public
 *    domain does not exist yet.
 *
 * ── It would rather send nothing than send noise ──────────────────────────
 *
 * A cold PayProp cache produces no alerts at all (see dealAlerts), and an
 * unreadable sent-log stops the run rather than guessing. Both are deliberate:
 * the failure everybody remembers is the morning a robot mailed forty false
 * alarms, and after that nobody reads the real ones.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  /* Fail SHUT on a missing secret. An unset CRON_SECRET must not mean "let
     everybody in" — that is how a machine route quietly becomes public. */
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Internal staff who should get the digest: whoever holds see:pretenancy. */
async function recipients(): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ email: string; role: string }>(
    `SELECT email, role FROM os_users WHERE email <> ''`
  );
  return rows.filter((r) => can(r.role, "see:pretenancy")).map((r) => r.email);
}

/** Everything the alert set needs, assembled from the same parts as the board. */
async function collect(): Promise<{ alerts: DealAlert[]; loaded: boolean; deals: number }> {
  const now = new Date();
  const [deals, money] = await Promise.all([
    getAllPropolyDeals().catch(() => null),
    loadMoneyContext(now).catch(() => null),
  ]);
  if (!deals || !money) return { alerts: [], loaded: false, deals: 0 };

  const overlays = await getOverlays(deals.map((d) => d.app.id)).catch(() => new Map());
  const rows: AlertDeal[] = deals.map((d) => {
    const meta = overlays.get(d.app.id)?.meta ?? null;
    const m = moneyForDeal(money, d.app.propertyName, d.app.startDate);
    return {
      app: { id: d.app.id, propertyName: d.app.propertyName },
      effectiveStatusKey: effectivePortalStage(d.statusKey, meta),
      statusKey: d.statusKey,
      agentName: d.managerName ?? null,
      startDate: d.app.startDate,
      ...m,
    };
  });

  return {
    alerts: dealAlerts(rows, { moneyLoaded: money.loaded }),
    loaded: money.loaded,
    deals: deals.length,
  };
}

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "see:pretenancy"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { alerts, loaded, deals } = await collect();
  let sent: string[] = [];
  let sentLogReadable = true;
  try {
    sent = [...(await alreadySent())];
  } catch {
    sentLogReadable = false;
  }
  const fresh = alerts.filter((a) => !sent.includes(a.key));

  return NextResponse.json({
    dryRun: true,
    moneyLoaded: loaded,
    sentLogReadable,
    deals,
    alerts: alerts.length,
    alreadyTold: sent.length,
    wouldSend: fresh.length,
    sendingArmed: process.env.PRETENANCY_ALERTS === "on",
    to: await recipients().catch(() => []),
    digest: fresh.length ? digestText(fresh) : null,
  });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { alerts, loaded } = await collect();

  /* Nothing loaded, nothing said. dealAlerts already returns empty on a cold
     cache; this reports it rather than looking like a quiet success. */
  if (!loaded) {
    return NextResponse.json({ sent: false, reason: "PayProp's money reports had not loaded." });
  }

  /* An unreadable sent-log stops the run. If we cannot tell what has gone out,
     the safe assumption is "everything" — guessing "nothing" re-sends the lot,
     and a mailbox of repeats is how the whole thing gets muted. */
  let sent: Set<string>;
  try {
    sent = await alreadySent();
  } catch (e) {
    return NextResponse.json(
      { sent: false, reason: e instanceof Error ? e.message : "Cannot read what was already sent." },
      { status: 200 }
    );
  }

  const fresh = alerts.filter((a) => !sent.has(a.key));

  /* Resolved alerts are closed off FIRST and regardless of whether anything is
     sent. A deposit that got registered should stop being open even on a quiet
     morning, so that if it ever goes missing again that is news rather than a
     duplicate suppressed by a row from months ago. */
  const cleared = await clearResolved(new Set(alerts.map((a) => a.key))).catch(() => 0);

  if (fresh.length === 0) {
    return NextResponse.json({ sent: false, reason: "Nothing new.", cleared });
  }

  if (process.env.PRETENANCY_ALERTS !== "on") {
    /* HELD, not skipped and not recorded. It comes up again on the next run,
       so arming this later loses nothing. */
    return NextResponse.json({
      sent: false,
      reason: 'Sending is off. Set PRETENANCY_ALERTS="on" to arm it.',
      wouldSend: fresh.length,
      cleared,
    });
  }

  const to = await recipients();
  if (to.length === 0) {
    return NextResponse.json({
      sent: false,
      reason: "Nobody holds see:pretenancy, so there is no one to tell.",
      wouldSend: fresh.length,
      cleared,
    });
  }

  const body = digestText(fresh);
  const subject = `Pre-tenancy: ${fresh.length} thing${fresh.length === 1 ? "" : "s"} to look at`;
  const failures: string[] = [];
  for (const address of to) {
    try {
      await sendEmail({
        to: address,
        subject,
        text: body,
        html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${body
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</pre>`,
      });
    } catch (e) {
      failures.push(`${address}: ${e instanceof Error ? e.message : "send failed"}`);
    }
  }

  /* Recorded only if somebody actually received it. Marking on a total failure
     would silently swallow the whole batch — they would never come round
     again, and the first anybody knew would be a problem nobody was told about. */
  if (failures.length < to.length) await markSent(fresh);

  return NextResponse.json({
    sent: failures.length < to.length,
    told: to.length - failures.length,
    alerts: fresh.length,
    cleared,
    failures,
  });
}
