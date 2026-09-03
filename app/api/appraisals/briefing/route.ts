import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { presentationsFor } from "@/lib/present-store";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { ExternalRecipientRefused } from "@/lib/email-policy";
import { PRE_APPRAISAL_LEAD_DAYS } from "@/lib/appraisal-email";
import {
  briefingHtml,
  briefingSubject,
  briefingText,
  type AgentBriefing,
} from "@/lib/agent-briefing";
import { recipientFor } from "@/lib/agent-recipient";

/**
 * Tell the AGENT their pre-appraisal is going out.
 *
 * GET  → what would be sent, and to whom. Sends nothing.
 * POST → sends it.
 *
 * ── Why this one is allowed to send when the landlord half is not ─────────
 *
 * It goes to a TLE address, and lib/email-policy refuses everything else at
 * the transport. That guard is what makes this safe to wire now: there is no
 * combination of a wrong id, a bad lookup or a typo that turns this into an
 * email to a landlord — the worst case is a refusal.
 *
 * ── No switch, deliberately ───────────────────────────────────────────────
 *
 * The four switches in lib/switches all gate something that reaches a CLIENT,
 * or writes to REX. This reaches a colleague, on our own domain, as the direct
 * result of that colleague pressing a button. Putting it behind an arming
 * phrase would be safety theatre and would leave the OS silently not telling
 * anybody anything, which is the failure it exists to prevent.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function origin(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_OS_ORIGIN ?? "").replace(/\/+$/, "");
  return configured || req.nextUrl.origin;
}

const pretty = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

const prettyDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

async function build(req: NextRequest, id: string) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return { error: "Sign in first.", status: 401 as const };

  const ma = await getAppraisal(id);
  if (!ma) return { error: "No such appraisal.", status: 404 as const };

  const to = await recipientFor(ma.agent, { email: me.email, name: me.name || me.email });

  /* The deck the landlord will actually open, if one has been minted. Read
     rather than assumed: an email promising "this is what they will see" that
     links to nothing is worse than one that does not offer the link. */
  const decks = await presentationsFor(ma.leadId ?? ma.id).catch(() => []);
  const pre = decks.find((d) => d.kind === "pre-appraisal") ?? null;

  /* Counted BACK from the visit, the same way AppraisalTrack schedules it, so
     the date in the email is the date the queue will actually use. */
  let sendPretty: string | null = null;
  if (ma.appointmentAt) {
    const visit = new Date(ma.appointmentAt);
    if (!Number.isNaN(visit.valueOf())) {
      const when = new Date(visit);
      when.setDate(when.getDate() - PRE_APPRAISAL_LEAD_DAYS);
      sendPretty = prettyDay(when);
    }
  }

  const briefing: AgentBriefing = {
    agentFirstName: to.name,
    landlordName: ma.landlord,
    address: ma.address,
    visitPretty: pretty(ma.appointmentAt),
    sendPretty,
    appraisalUrl: `${origin(req)}/market-appraisals/${ma.id}`,
    deckUrl: pre ? `${origin(req)}/present/${pre.token}` : null,
  };

  return {
    to,
    briefing,
    subject: briefingSubject(briefing),
    text: briefingText(briefing),
    html: briefingHtml(briefing),
  };
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Which appraisal?" }, { status: 400 });

  const built = await build(req, id);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: built.status });

  return NextResponse.json({
    dryRun: true,
    to: built.to.email,
    matchedAgent: built.to.matched,
    subject: built.subject,
    text: built.text,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Which appraisal?" }, { status: 400 });

  const built = await build(req, id);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: built.status });

  try {
    await sendEmail({
      to: built.to.email,
      subject: built.subject,
      html: built.html,
      text: built.text,
    });
    return NextResponse.json({
      ok: true,
      to: built.to.email,
      matchedAgent: built.to.matched,
      /* Said back so the caller can show it. An agent who minted a deck for a
         colleague should learn that the colleague was not found, at the moment
         it happens rather than in a week. */
      note: built.to.matched
        ? null
        : "No OS user matches the agent named on this appraisal, so it went to you instead.",
    });
  } catch (e) {
    /* The three failures worth telling apart, because they need different
       actions: not configured, locked, and refused-as-external. The last one
       should be impossible here and is reported loudly if it ever happens. */
    if (e instanceof ExternalRecipientRefused) {
      return NextResponse.json(
        {
          error:
            "That address is not on a TLE domain, so it was refused. This email only ever goes to colleagues.",
        },
        { status: 400 }
      );
    }
    if (e instanceof ResendBlocked) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That didn't send." },
      { status: 502 }
    );
  }
}
