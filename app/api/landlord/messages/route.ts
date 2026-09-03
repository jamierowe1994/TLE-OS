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
  const to = agent?.email?.trim() || OFFICE;
  const property = journey?.appraisal.address ?? "your property";

  let message;
  try {
    message = await recordLandlordMessage({ accountId: me.id, appraisalId, body: text, toEmail: to });
  } catch (e) {
    console.error("[landlord/messages] could not store", e);
    return NextResponse.json({ ok: false, error: "That didn't save. Try again in a moment." }, { status: 502 });
  }

  const subject = `${me.name} about ${property}`;
  const html = `<p>${escape(me.name)} wrote from their property file about <strong>${escape(property)}</strong>:</p><blockquote style="border-left:3px solid #ccc;margin:12px 0;padding:8px 12px;white-space:pre-wrap">${escape(text)}</blockquote><p>Reply to this email and it goes straight to them (${escape(me.email)}).</p>`;
  let emailed = false;
  try {
    await sendEmail({ to, subject, html, text: `${me.name} wrote about ${property}:\n\n${text}\n\nReply to reach them: ${me.email}`, replyTo: me.email });
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
