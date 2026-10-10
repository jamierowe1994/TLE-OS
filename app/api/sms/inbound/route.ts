import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { publicOrigin } from "@/lib/origin";
import { sendEmail } from "@/lib/resend";
import { ALWAYS_SEND_TO } from "@/lib/switches";
import { twilioSigned } from "@/lib/sms";
import { timeForText } from "@/lib/viewing-texts";
import { userByName } from "@/lib/tenant-email-send";

/**
 * A text back to the TLE number (10 Oct 2026). Twilio POSTs it here - set as
 * the number's "A message comes in" webhook in the Twilio console.
 *
 * Kept in os_sms_inbound, matched to the last text we sent that number, and
 * emailed straight to that viewing's agent: a viewer replying "running ten
 * minutes late" half an hour before needs a person, not a screen. Anything we
 * cannot place goes to Howard.
 *
 * Signed: refuses with no TWILIO_AUTH_TOKEN, and on a signature that does not
 * check out (lib/sms twilioSigned). Twilio retries on failure, so the message
 * sid is the key and a retry tells nobody twice.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMPTY = new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
  headers: { "Content-Type": "text/xml" },
});

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  if (!process.env.TWILIO_AUTH_TOKEN) return NextResponse.json({ ok: false, error: "Texting isn't connected." }, { status: 503 });
  const params = new URLSearchParams(await req.text());
  const url = `${publicOrigin(req)}/api/sms/inbound`;
  if (!twilioSigned(url, params, req.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ ok: false, error: "Not signed by Twilio." }, { status: 401 });
  }
  const sid = params.get("MessageSid") ?? "";
  const from = params.get("From") ?? "";
  const body = (params.get("Body") ?? "").trim();
  if (!sid || !from || !hasDb()) return EMPTY;

  /* The last text of ours to this number in the past two days. */
  const ours = await q<{ key: string; viewing_id: string | null; to_name: string | null; agent: string | null; starts_at: string | Date | null; label: string | null }>(
    `SELECT l.key, l.viewing_id, l.to_name, l.agent, v.starts_at, v.payload->>'listingLabel' AS label
       FROM os_sms_log l LEFT JOIN os_viewings v ON v.id = l.viewing_id
      WHERE l.to_number = $1 AND l.outcome = 'sent' AND l.kind <> 'test' AND l.sent_at > NOW() - INTERVAL '2 days'
      ORDER BY l.sent_at DESC LIMIT 1`,
    [from]
  ).catch(() => []);
  const hit = ours[0] ?? null;

  const agent = hit?.agent ? await userByName(hit.agent).catch(() => null) : null;
  const tell = agent?.email ?? ALWAYS_SEND_TO[0];

  const fresh = await q<{ sid: string }>(
    `INSERT INTO os_sms_inbound (sid, from_number, body, reply_to, viewing_id, told) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (sid) DO NOTHING RETURNING sid`,
    [sid, from, body, hit?.key ?? null, hit?.viewing_id ?? null, tell]
  ).catch(() => []);
  if (!fresh.length) return EMPTY;

  const who = hit?.to_name || from;
  const about = hit?.starts_at
    ? `their ${timeForText(new Date(hit.starts_at).toISOString())} viewing at ${hit.label ?? "the property"}`
    : hit
      ? "a viewing reminder"
      : null;
  const subject = about ? `Text from ${who} about ${about}` : `Text to the TLE number from ${from}`;
  const html = `<p style="font-family:Arial,sans-serif;font-size:15px;color:#2b2b2b">${
    about ? `${esc(who)} replied to the reminder text about ${esc(about)}:` : `A text came in to the TLE number from ${esc(from)}, and it doesn't match a reminder we sent:`
  }</p>
<blockquote style="font-family:Arial,sans-serif;font-size:16px;margin:12px 0;padding:10px 14px;border-left:3px solid #c98b7a;background:#faf6f4">${esc(body) || "(no words)"}</blockquote>
<p style="font-family:Arial,sans-serif;font-size:14px;color:#555">Their number: <a href="tel:${esc(from)}">${esc(from)}</a>. Ring or text them from your own phone - a reply to this email does not reach them.</p>`;
  await sendEmail({ to: tell, subject, html, audience: "internal" }).catch(() => undefined);
  return EMPTY;
}
