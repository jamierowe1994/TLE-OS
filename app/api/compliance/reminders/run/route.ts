import { NextRequest, NextResponse } from "next/server";
import { heldForRex } from "@/lib/rex-jobs";
import { publicError } from "@/lib/public-error";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { rexConfigured } from "@/lib/rex";
import { q } from "@/lib/db";
import { getComplianceBook } from "@/lib/compliance-cache";
import { buildQueue, buildTracker, type QueuedReminder } from "@/lib/compliance-tracker";
import { agentDirectory, chaseSettings, plainLabel, recordChase, stagesSent, type AgentLogin } from "@/lib/cert-chase";
import { certificateChaseEmail } from "@/lib/email/agent-emails";
import { sendEmail } from "@/lib/resend";
import { switchOn } from "@/lib/switches";

/**
 * The certificate chase, sent.
 *
 * GET  → DRY RUN. Builds the digest and writes nothing.
 * POST → the real run. Cron key only. On the daily cron (os-cron-daily,
 *        06:00 UTC), already scheduled; it holds every send while the
 *        Certificate chases switch is off.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://<host>/api/compliance/reminders/run
 *
 * ── Everything upstream of here already existed ───────────────────────────
 *
 * lib/compliance-tracker decides who is owed a chase and when, stages it at
 * the days the office picked (30, 14, 7 and on expiry unless they change it on
 * Agent Chases), and hands back a key per home/certificate/stage/expiry. This
 * joins it to the agent and the words, and is deliberately thin.
 *
 * ── RECORDED, one row per certificate (ticket 11c8acc9, 11 Nov 2026) ─────
 *
 * Josel: "automated reminders ... with the reminders and follow-ups recorded
 * on OS". Every reminder that goes is written to os_cert_agent_chases (how
 * "auto"), the same trail as a chase by hand, so the certificate says
 * "reminder sent 10 Nov" and the office's list holds both. The stage key is
 * unique there, which is what stops a stage being sent twice. It replaced
 * os_compliance_chases_sent, which never held a row (the switch was never on)
 * and keyed without the expiry, so a renewed certificate would never have
 * been chased again.
 *
 * A send that fails is recorded without its stage key: the trail shows it was
 * tried, and it comes round again on the next run.
 *
 * ── The agent, matched as everywhere else ─────────────────────────────────
 *
 * lib/cert-chase agentDirectory: the book's agent, else the OS property
 * record, matched to a login by first and last name. The first version
 * matched the full name exactly, which found 223 of 345 homes on the live
 * book; this finds 259 (11 Nov 2026). The rest name somebody with no login.
 *
 * ── AGENTS ONLY ───────────────────────────────────────────────────────────
 *
 * Michael never writes to a landlord: "he will always go through the agent".
 * Nothing here does either.
 *
 * ── REX must be live ──────────────────────────────────────────────────────
 *
 * Without REX there is no real book, and a stand-in would email real agents
 * about invented homes. This route sends nothing at all without a live REX.
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

interface Planned {
  agentName: string;
  login: AgentLogin | null;
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
  chaseLogReadable: boolean;
}> {
  if (!rexConfigured()) {
    return { live: false, reason: "REX isn't connected, so there is no real book to chase against.", groups: [], alreadyChased: 0, chaseLogReadable: true };
  }

  const [{ book }, settings, whoFor] = await Promise.all([getComplianceBook(), chaseSettings(), agentDirectory()]);
  const queue = buildQueue(buildTracker(book.properties), settings);

  let sent: Set<string>;
  let chaseLogReadable = true;
  try {
    sent = await stagesSent();
  } catch {
    chaseLogReadable = false;
    sent = new Set();
  }

  const fresh = queue.filter((r) => !sent.has(r.key));

  const byAgent = new Map<string, { login: AgentLogin | null; name: string; why: string | null; items: QueuedReminder[] }>();
  for (const r of fresh) {
    const a = whoFor(r.propertyId, r.to.agent);
    const k = a.login ? `login:${a.login.id}` : `name:${a.name ?? ""}`;
    const cur = byAgent.get(k);
    if (cur) cur.items.push(r);
    else byAgent.set(k, { login: a.login, name: a.login?.name ?? a.name ?? "(no agent on the property)", why: a.why, items: [r] });
  }

  /* Worst first WITHIN an agent's list: the expired above the 30-day one. */
  const groups: Planned[] = [...byAgent.values()].map((g) => {
    const sorted = [...g.items].sort((a, b) => a.daysLeft - b.daysLeft);
    return {
      agentName: g.name,
      login: g.login,
      problem: g.login ? null : g.why,
      /* Certificate labels carry em dashes ("EICR — electrical safety")
         because they were written for a screen; an email takes a hyphen. */
      lines: sorted.map((r) => {
        const cert = plainLabel(r.certLabel);
        if (r.band === 0) {
          const ago = Math.abs(r.daysLeft);
          return `<strong>${r.property}</strong> - ${cert}, expired ${ago === 0 ? "today" : `${ago} day${ago === 1 ? "" : "s"} ago`}`;
        }
        return `<strong>${r.property}</strong> - ${cert}, expires in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`;
      }),
      items: sorted,
    };
  });

  return { live: true, groups, alreadyChased: queue.length - fresh.length, chaseLogReadable };
}

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "staff:internal"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const p = await plan();
  return NextResponse.json({
    dryRun: true,
    live: p.live,
    ...(p.reason ? { reason: p.reason } : {}),
    alreadyChased: p.alreadyChased,
    chaseLogReadable: p.chaseLogReadable,
    sendingArmed: await switchOn("compliance_chases"),
    wouldEmail: p.groups.filter((g) => g.login).length,
    certificates: p.groups.reduce((n, g) => n + (g.login ? g.items.length : 0), 0),
    cannotEmail: p.groups.filter((g) => !g.login).map((g) => ({ agent: g.agentName, properties: g.items.length, why: g.problem })),
    preview: p.groups.filter((g) => g.login).map((g) => ({ agent: g.agentName, lines: g.lines })),
  });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  /* REX down (lib/rex-jobs): step aside, and run again once it is back. */
  const held = await heldForRex(req, { rerunWhenBack: true });
  if (held) return held;

  let p: Awaited<ReturnType<typeof plan>>;
  try {
    p = await plan();
  } catch (e) {
    return NextResponse.json({ sent: false, reason: publicError(e, "The compliance book couldn't be read.") }, { status: 502 });
  }
  if (!p.live) return NextResponse.json({ sent: false, reason: p.reason });

  /* An unreadable chase log stops the run. If we cannot tell what has already
     gone, the safe assumption is "everything" — guessing "nothing" sends the
     same stage again, and an agent who gets the same reminder five mornings
     running stops reading the next real one. */
  if (!p.chaseLogReadable) {
    return NextResponse.json({ sent: false, reason: "Cannot read which chases have already gone, so nothing was sent." });
  }

  const sendable = p.groups.filter((g) => g.login);
  if (sendable.length === 0) {
    return NextResponse.json({ sent: false, reason: "Nothing new to chase.", cannotEmail: p.groups.length });
  }

  /* Armed from Admin -> Switches (Certificate chases). Off, the run is HELD,
     not skipped and not recorded: it comes round again on the next run, so
     arming this later loses nothing. */
  if (!(await switchOn("compliance_chases"))) {
    return NextResponse.json({
      sent: false,
      reason: "Sending is off. Arm Certificate chases on Admin -> Switches.",
      wouldEmail: sendable.length,
    });
  }

  const failures: string[] = [];
  let chased = 0;

  for (const g of sendable) {
    const login = g.login!;
    /* CLAIMED BEFORE IT IS SENT. Each certificate's row goes in first with
       its stage key, which is unique: a second run landing at the same
       moment finds the key taken and leaves that certificate out of its
       email. So a stage cannot go twice, not just "is not recorded twice". */
    const claimed: { id: string; line: string }[] = [];
    for (const [i, r] of g.items.entries()) {
      const id = await recordChase({
        propertyId: r.propertyId,
        property: [r.property, r.locality].filter(Boolean).join(", "),
        cert: r.cert,
        certLabel: plainLabel(r.certLabel),
        expiry: r.expiry,
        certState: r.band === 0 ? "expired" : "due",
        agentName: r.to.agent?.trim() || login.name,
        agentEmail: login.email,
        agentUserId: login.id,
        how: "auto",
        stage: r.band,
        stageKey: r.key,
        byName: "Automatic reminder",
        subject: "",
        message: "",
        sent: false,
        via: null,
        note: "Sending",
      }).catch((e) => {
        console.error("[compliance/reminders] claim", e instanceof Error ? e.message : e);
        return null;
      });
      if (id) claimed.push({ id, line: g.lines[i] });
    }
    if (claimed.length === 0) continue;

    const mail = certificateChaseEmail({ firstName: login.name.split(/\s+/)[0] || "there", lines: claimed.map((c) => c.line) });
    const ids = claimed.map((c) => c.id);
    try {
      await sendEmail({ to: login.email, subject: mail.subject, html: mail.html, text: mail.text });
      await q(
        `UPDATE os_cert_agent_chases SET sent = TRUE, via = 'ours', note = '', subject = $2, message = $3 WHERE id = ANY($1::text[])`,
        [ids, mail.subject, mail.text]
      );
      chased += ids.length;
    } catch (e) {
      const note = publicError(e, "send failed");
      failures.push(`${g.agentName}: ${note}`);
      /* Tried and recorded, and the key let go so the next run tries again. */
      await q(
        `UPDATE os_cert_agent_chases SET stage_key = NULL, note = $2, subject = $3, message = $4 WHERE id = ANY($1::text[])`,
        [ids, note.slice(0, 500), mail.subject, mail.text]
      ).catch(() => null);
    }
  }

  return NextResponse.json({
    sent: chased > 0,
    agentsEmailed: sendable.length - failures.length,
    certificatesChased: chased,
    cannotEmail: p.groups.filter((g) => !g.login).length,
    failures,
  });
}
