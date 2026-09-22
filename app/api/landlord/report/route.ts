import { NextRequest, NextResponse } from "next/server";
import { currentLandlord, landlordJourneys, landlordProperties, markMessageEmailed, recordLandlordMessage } from "@/lib/landlord-account";
import { createOrder, URGENCIES, type Urgency } from "@/lib/works-orders";
import { sendEmail } from "@/lib/resend";
import { agentMessageEmail } from "@/lib/appraisal-messages";
import { recipientFor } from "@/lib/agent-recipient";
import { publicOrigin } from "@/lib/origin";
import { hasDb } from "@/lib/db";

/**
 * POST → a landlord reports a problem with a home we manage.
 *
 * Until 22 Sep 2026 (18 Sep sweep, item 7) this was a message: it went into
 * the agent's inbox as words, never became a job, and the portal said Sent
 * whatever happened. A problem with a managed home is a works order first -
 * the same record a tenant's report makes, on the maintenance board, with
 * the landlord on it - and a note on the file second, so the agent is told
 * with a link to the job rather than asked to retype it.
 *
 * Body: { text, urgency: "Emergency" | "Urgent" | "Routine", property: the
 * name as the portal lists it }. The home is taken from the signed-in
 * landlord's own managed book, never from the body, so one landlord's
 * login cannot raise work against another's home.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OFFICE = "hello@thelettingexperts.co.uk";

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; urgency?: string; property?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "Say what the problem is first." }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ ok: false, error: "That's a long one. Keep it under 4,000 characters." }, { status: 413 });

  const homes = await landlordProperties(me).catch(() => []);
  const wanted = (body.property ?? "").trim().toLowerCase();
  const home = homes.find((p) => p.name.trim().toLowerCase() === wanted) ?? (homes.length === 1 ? homes[0] : null);
  if (!home) {
    return NextResponse.json(
      { ok: false, error: "We cannot see that home on your file, so there is nothing to report it against. Message your agent and they will sort it." },
      { status: 404 }
    );
  }

  const urgency: Urgency = body.urgency === "Emergency" ? "emergency" : body.urgency === "Urgent" ? "urgent" : "routine";
  const label = URGENCIES.find((u) => u.id === urgency)?.label ?? "Routine";

  let order;
  try {
    order = await createOrder(
      {
        kind: "repair",
        propertyId: home.propertyId,
        propertyName: home.name,
        locality: home.locality,
        landlord: me.name,
        landlordEmail: me.email,
        title: text.replace(/\s+/g, " ").slice(0, 140),
        description: text,
        /* Not guessed from the words: an agent sets the trade when they read it. */
        category: "Other",
        urgency,
        reportedBy: "Landlord",
        propertyLat: home.lat,
        propertyLng: home.lng,
      },
      me.name || me.email
    );
  } catch (e) {
    console.error("[landlord/report] could not raise the job", e);
    return NextResponse.json({ ok: false, error: "That didn't save. Try again in a moment, or message your agent." }, { status: 502 });
  }

  /* The agent is told on the file, with a link to the job. Stored first,
     emailed second, exactly as a message from the Messages panel is; the
     job exists whatever the email does. */
  const journeys = await landlordJourneys(me).catch(() => []);
  const journey = journeys.find((j) => j.appraisal.address.trim().toLowerCase().startsWith(home.name.trim().toLowerCase())) ?? journeys[0] ?? null;
  const named = journey?.appraisal.agent ? await recipientFor(journey.appraisal.agent, { email: "", name: "" }).catch(() => null) : null;
  const to = named?.email || journey?.decks[0]?.deck.agent?.email?.trim() || OFFICE;
  const words = `Repair reported (${label.toLowerCase()}) at ${home.name}:\n${text}\n\nJob ${order.ref} is on the maintenance board.`;
  let emailed = false;
  try {
    const message = await recordLandlordMessage({ accountId: me.id, appraisalId: journey?.appraisal.id ?? null, body: words, toEmail: to });
    const link = `${publicOrigin(req)}/maintenance?open=${encodeURIComponent(order.id)}`;
    const mail = agentMessageEmail({ landlord: me.name, address: home.name, body: words, link, landlordEmail: me.email });
    try {
      await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: me.email });
      await markMessageEmailed(message.id, null);
      emailed = true;
    } catch (e) {
      await markMessageEmailed(message.id, e instanceof Error ? e.message : String(e)).catch(() => null);
    }
  } catch (e) {
    console.warn("[landlord/report] job raised, note not filed", e);
  }

  return NextResponse.json({ ok: true, ref: order.ref, emailed, to });
}
