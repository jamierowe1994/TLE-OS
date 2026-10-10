import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendingLocked } from "@/lib/switches";

/**
 * Text messages, through Twilio (10 Oct 2026).
 *
 * James chose Twilio and a reply-able UK mobile number over a sender name, so
 * a viewer can text back "can't make it" and it reaches the agent (see
 * app/api/sms/inbound). Three variables on the TLE-OS service:
 *
 *   TWILIO_ACCOUNT_SID   AC...
 *   TWILIO_AUTH_TOKEN    signs our calls AND checks Twilio's calls to us
 *   TWILIO_FROM          +447861904771
 *
 * No SDK: one form POST to the Messages endpoint is the whole of sending, and
 * the signature check below is the whole of receiving.
 */

export function smsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

/**
 * A UK mobile as Twilio wants it (+447...), or null.
 *
 * Mobiles only: REX's phone_number is often a landline, and a text to a
 * landline is either refused or read aloud by a robot voice. Numbers from
 * abroad (+ and not +44) are kept - a tenant moving here often has one.
 */
export function smsNumber(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (d.startsWith("+44")) d = `0${d.slice(3).replace(/^0/, "")}`;
  else if (d.startsWith("44") && d.length === 12) d = `0${d.slice(2)}`;
  if (d.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
  if (/^07\d{9}$/.test(d)) return `+44${d.slice(1)}`;
  return null;
}

/** How many texts Twilio will bill this as - one rule, shared with the editor. */
export { smsParts } from "@/lib/viewing-text-template";

export interface SmsResult {
  sent: boolean;
  /** Worth another go on the next run (Twilio or the network was down). */
  retry: boolean;
  sid?: string;
  detail: string;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (sendingLocked()) return { sent: false, retry: true, detail: "Sending is locked (SENDING_LOCKED)." };
  if (!smsConfigured()) return { sent: false, retry: true, detail: "Texting isn't connected - the Twilio variables aren't set." };
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (res.ok && j.sid) return { sent: true, retry: false, sid: j.sid, detail: `Texted ${to}.` };
    /* 4xx is Twilio saying no to THIS message (a bad number, a blocked
       destination) - another go will get the same answer. 5xx and 429 are
       Twilio having a moment. */
    const retry = res.status >= 500 || res.status === 429;
    return { sent: false, retry, detail: `Twilio refused it (${res.status}${j.code ? `, code ${j.code}` : ""}): ${j.message ?? "no reason given"}` };
  } catch (e) {
    return { sent: false, retry: true, detail: `Twilio didn't answer: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Is this request really from Twilio? Twilio signs the full URL it called
 * plus every POSTed field, sorted by name, with our auth token (HMAC-SHA1,
 * base64) in X-Twilio-Signature. No token set means nothing is trusted.
 */
export function twilioSigned(url: string, params: URLSearchParams, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  if (!token || !signature) return false;
  const keys = [...new Set(params.keys())].sort();
  const data = url + keys.map((k) => k + params.getAll(k).join("")).join("");
  const want = createHmac("sha1", token).update(data, "utf8").digest("base64");
  const a = Buffer.from(want);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
