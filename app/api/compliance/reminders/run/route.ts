import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { rexConfigured } from "@/lib/rex";
import { getComplianceBook } from "@/lib/compliance-cache";
import { buildQueue, buildTracker, type QueuedReminder } from "@/lib/compliance-tracker";
import { chasesSent, markChased } from "@/lib/compliance-chase-store";
import { renderComplianceAgentChase } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";

/**
 * The certificate chase, sent.
 *
 * GET  → DRY RUN. Builds the digest and writes nothing.
 * POST → the real run. Cron key only.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://<host>/api/compliance/reminders/run
 *
 * ── Everything upstream of here already existed ───────────────────────────
 *
 * lib/compliance-tracker decides who is owed a chase and when, bands it at 30,
 * 14 and 7 days, and hands back a stable key per property/certificate/band. The
 * catalogue holds the words. This joins the two and is deliberately thin: the
 * judgement lives in the tracker, where it can be read without a mail server.
 *
 * ── AGENTS ONLY, and that is not the design ───────────────────────────────
 *
 * The tracker's rule is that every chase reaches the landlord AND their agent,
 * because an agent must never be surprised by a chase on their own file. Only
 * the agent half can be sent: lib/email-policy refuses every non-internal
 * address until the public Lettings Experts domain exists. The landlord
 * document is written and previewable and waits for that.
 *
 * So a run reports how many landlords it did NOT write to. A number that is
 * quietly missing is how a half-built feature gets mistaken for a finished one.
 *
 * ── REX must be live ──────────────────────────────────────────────────────
 *
 * /api/compliance/tracker falls back to a sample book when REX is unconfigured,
 * which is right for a screen somebody is developing against and catastrophic
 * here: it would email real agents about invented properties. This route sends
 * nothing at all without a live REX.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  /* Fail shut on a missing secret: unset must never mean "let everybody in". */
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** An agent's name as the tracker knows it, mapped to an address we can use. */
async function agentAddresses(): Promise<Map<string, { email: string; name: string }>> {
  const out = new Map<string, { email: string; name: string }>();
  if (!hasDb()) return out;
  const rows = await q<{ email: string; name: string }>(
    `SELECT email, name FROM os_users WHERE email <> ''`
  );
  for (const r of rows) {
    const key = (r.name ?? "").trim().toLowerCase();
    if (key) out.set(key, { email: r.email, name: r.name });
  }
  return out;
}

interface Planned {
  agentName: string;
  to: string | null;
  /** Why nobody will be written to, if that is the case. */
  problem: string | null;
  lines: string[];
  items: QueuedReminder[];
}

/**
 * What the run would do, grouped by agent.
 *
 * Everything that CANNOT be sent is kept in the list with a reason rather than
 * filtered away. A property with no agent, or an agent with no account, is a
 * record that needs fixing — and dropping it silently is how it stays broken
 * while the digest looks healthy.
 */
async function plan(): Promise<{
  live: boolean;
  reason?: string;
  groups: Planned[];
  alreadyChased: number;
  landlordsNotWritten: number;
  chaseLogReadable: boolean;
}> {
  if (!rexConfigured()) {
    return {
      live: false,
      reason: "REX isn't connected, so there is no real book to chase against.",
      groups: [],
      alreadyChased: 0,
      landlordsNotWritten: 0,
      chaseLogReadable: true,
    };
  }

  const { book } = await getComplianceBook();
  const queue = buildQueue(buildTracker(book.properties));

  let sent: Set<string>;
  let chaseLogReadable = true;
  try {
    sent = await chasesSent();
  } catch {
    chaseLogReadable = false;
    sent = new Set();
  }

  const fresh = queue.filter((r) => !sent.has(r.key));
  const addresses = await agentAddresses().catch(() => new Map());

  const byAgent = new Map<string, QueuedReminder[]>();
  for (const r of fresh) {
    /* `blocked` is the tracker's own verdict — currently "no agent on this
       property", which it treats as a defect rather than a reason to write to
       the landlord alone. Respected rather than second-guessed. */
    const name = r.blocked ? "(no agent on the property)" : (r.to.agent ?? "(no agent)");
    const cur = byAgent.get(name);
    if (cur) cur.push(r);
    else byAgent.set(name, [r]);
  }

  /* Worst first WITHIN an agent's list: the 7-day band above the 30-day one.
     The order is a judgement about the book, so it is made here rather than in
     the template. */
  const groups: Planned[] = [...byAgent.entries()].map(([agentName, items]) => {
    const sorted = [...items].sort((a, b) => a.daysLeft - b.daysLeft);
    const hit = addresses.get(agentName.trim().toLowerCase());
    const problem = items[0]?.blocked
      ? items[0].blocked
      : hit
        ? null
        : `No TLE OS account matches "${agentName}", so there is nobody to write to.`;
    return {
      agentName,
      to: hit?.email ?? null,
      problem,
      /* Certificate labels carry em dashes ("EICR — electrical safety") because
         they were written for a screen. This is client-facing copy now, where
         the house rule is a hyphen, and the assistant already learned that a
         style rule is worth enforcing in code rather than hoping every source
         obeys it. Normalised here rather than renamed at source, because those
         labels are also column headings on Compliance and are not mine to
         restyle. */
      lines: sorted.map((r) => {
        const cert = r.certLabel.replace(/\s+[—–]\s+/g, " - ").replace(/[—–]/g, "-");
        return `<strong>${r.property}</strong> - ${cert}, expires in ${r.daysLeft} day${
          r.daysLeft === 1 ? "" : "s"
        }`;
      }),
      items: sorted,
    };
  });

  return {
    live: true,
    groups,
    alreadyChased: queue.length - fresh.length,
    /* Every fresh chase is a landlord who is not being written to today. */
    landlordsNotWritten: fresh.length,
    chaseLogReadable,
  };
}

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "admin:open"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const p = await plan();
  return NextResponse.json({
    dryRun: true,
    ...p,
    sendingArmed: process.env.COMPLIANCE_CHASES === "on",
    wouldEmail: p.groups.filter((g) => g.to && !g.problem).length,
    cannotEmail: p.groups.filter((g) => !g.to || g.problem).map((g) => ({
      agent: g.agentName,
      properties: g.items.length,
      why: g.problem,
    })),
    preview: p.groups
      .filter((g) => g.to && !g.problem)
      .map((g) => ({ to: g.to, lines: g.lines })),
  });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const p = await plan();
  if (!p.live) return NextResponse.json({ sent: false, reason: p.reason });

  /* An unreadable chase log stops the run. If we cannot tell what has already
     gone, the safe assumption is "everything" — guessing "nothing" sends the
     same band again, and a landlord who gets the same reminder five mornings
     running stops reading the next real one. */
  if (!p.chaseLogReadable) {
    return NextResponse.json({
      sent: false,
      reason: "Cannot read which chases have already gone, so nothing was sent.",
    });
  }

  const sendable = p.groups.filter((g) => g.to && !g.problem);
  if (sendable.length === 0) {
    return NextResponse.json({
      sent: false,
      reason: "Nothing new to chase.",
      cannotEmail: p.groups.length,
    });
  }

  if (process.env.COMPLIANCE_CHASES !== "on") {
    /* HELD, not skipped and not recorded: it comes round again on the next run,
       so arming this later loses nothing. */
    return NextResponse.json({
      sent: false,
      reason: 'Sending is off. Set COMPLIANCE_CHASES="on" to arm it.',
      wouldEmail: sendable.length,
    });
  }

  const failures: string[] = [];
  const chased: Array<{ key: string; propertyId: string; cert: string; band: number; to: string }> = [];

  for (const g of sendable) {
    const { subject, html } = renderComplianceAgentChase({
      firstName: g.agentName.split(/\s+/)[0] ?? "there",
      lines: g.lines,
    });
    try {
      await sendEmail({ to: g.to!, subject, html });
      for (const r of g.items) {
        /* The key is propertyId:cert:band, built by buildQueue — the cert is
           the middle segment. Parsed rather than re-derived so the log and the
           de-duplication can never key on different things. */
        const [, cert] = r.key.split(":");
        chased.push({
          key: r.key,
          propertyId: r.propertyId,
          cert: cert ?? "",
          band: r.band,
          to: g.to!,
        });
      }
    } catch (e) {
      failures.push(`${g.to}: ${e instanceof Error ? e.message : "send failed"}`);
    }
  }

  /* Recorded per AGENT, only for the ones whose email actually left. Marking
     the whole batch on a partial failure would silently drop every chase in the
     agents who did not receive it, and they would never come round again. */
  await markChased(chased);

  return NextResponse.json({
    sent: chased.length > 0,
    agentsEmailed: sendable.length - failures.length,
    certificatesChased: chased.length,
    landlordsNotWritten: p.landlordsNotWritten,
    cannotEmail: p.groups.filter((g) => !g.to || g.problem).length,
    failures,
  });
}
