import { NextRequest, NextResponse } from "next/server";
import {
  currentLandlord,
  landlordJourneys,
  landlordMessages,
  landlordOwnsAppraisal,
  markMessageEmailed,
  recordLandlordMessage,
} from "@/lib/landlord-account";
import { sendEmail } from "@/lib/resend";
import { agentMessageEmail } from "@/lib/appraisal-messages";
import { recipientFor } from "@/lib/agent-recipient";
import { publicOrigin } from "@/lib/origin";
import { hasDb } from "@/lib/db";

/**
 * A message from the landlord to their agent.
 *
 * Stored first, emailed second: the agent gets it in their inbox, on the
 * OS's internal sender, with reply-to set to the landlord so a reply goes
 * straight back to them. A refused or failed email never loses the words -
 * the row keeps them, with the error beside it, and the page shows the
 * message as sent to the file either way.
 *
 * Where it goes: the agent on the presentation deck when there is one,
 * otherwise the office. The office address is a fallback, not a dumping
 * ground - a message that lands there is one somebody has to forward.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OFFICE = "hello@thelettingexperts.co.uk";

export async function GET() {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, messages: await landlordMessages(me.id) });
}

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { appraisalId?: string; text?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "Write something first." }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ ok: false, error: "That's a long one. Keep it under 4,000 characters." }, { status: 413 });

  const appraisalId = (body.appraisalId ?? "").trim() || null;
  if (appraisalId && !(await landlordOwnsAppraisal(me, appraisalId))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }

  const journeys = await landlordJourneys(me);
  const journey = appraisalId ? journeys.find((j) => j.appraisal.id === appraisalId) : journeys[0];
  const agent = journey?.decks[0]?.deck.agent ?? null;
  /* The agent on the appraisal first - a file with no deck on it yet still
     has an agent - then whoever sent the deck, then the office. */
  const named = journey?.appraisal.agent ? await recipientFor(journey.appraisal.agent, { email: "", name: "" }) : null;
  const to = named?.email || agent?.email?.trim() || OFFICE;
  const property = journey?.appraisal.address ?? "your property";

  let message;
  try {
    /* Filed against the property it is about, even when the page did not say,
       so it lands in that appraisal's Messages panel. */
    message = await recordLandlordMessage({ accountId: me.id, appraisalId: appraisalId ?? journey?.appraisal.id ?? null, body: text, toEmail: to });
  } catch (e) {
    console.error("[landlord/messages] could not store", e);
    return NextResponse.json({ ok: false, error: "That didn't save. Try again in a moment." }, { status: 502 });
  }

  /* A proper email with a button straight into the Messages panel on the
     appraisal (James, 17 Sep 2026: "when they click it, it'll launch the
     agent straight ... into the message tab"). */
  const link = `${publicOrigin(req)}/market-appraisals/${encodeURIComponent(journey?.appraisal.id ?? appraisalId ?? "")}?messages=1`;
  const mail = agentMessageEmail({ landlord: me.name, address: property, body: text, link, landlordEmail: me.email });
  let emailed = false;
  try {
    await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: me.email });
    await markMessageEmailed(message.id, null);
    emailed = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[landlord/messages] stored but not emailed to ${to}: ${msg}`);
    await markMessageEmailed(message.id, msg);
  }

  return NextResponse.json({ ok: true, message: { ...message, emailedAt: emailed ? new Date().toISOString() : null }, emailed, to });
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
