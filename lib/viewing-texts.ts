import "server-only";
import { hasDb, q } from "@/lib/db";
import { switchOn } from "@/lib/switches";
import { readViewing, type Viewing } from "@/lib/rex-viewings";
import { sendSms, smsConfigured, smsNumber, smsParts } from "@/lib/sms";
import { firstName, london, userByName } from "@/lib/tenant-email-send";
import { OFFICE_PHONE, agentPhone } from "@/lib/agent-phone";
import { allAgents } from "@/lib/rex-agents";
import { VIEWING_TEXT_PREF, checkTemplate, fillTemplate, tidyTemplate } from "@/lib/viewing-text-template";

/**
 * The viewing reminder text (10 Oct 2026).
 *
 * James: "when the viewings happen, let's say an hour before, we send out text
 * to them". Run every five minutes by os-cron-viewing-texts
 * (POST /api/viewings/texts/run); each viewer is texted once per viewing.
 *
 * ── What keeps it from texting the wrong person, or the wrong thing ──────
 *
 * THE SWITCH. `viewing_texts` on Admin, Switches. Off, nothing goes; ?dry=1
 * shows who would be texted either way.
 *
 * TLE ONLY. The same rule as the morning email (lib/tenant-reminders): the
 * diary holds every brand on the shared REX account, and only REX's own "TLE
 * ... Viewing" types are ours.
 *
 * REX IS ASKED AGAIN. os_viewings learns of a cancellation or a new time only
 * on the four-hourly sweep, so each viewing is read back from REX the moment
 * before its text goes. Cancelled, moved out of the hour, or REX not
 * answering: no text, and the next run looks again.
 *
 * A NARROW WINDOW. From 65 to 20 minutes before the start, and only between
 * 7am and 9pm London time. Switching this on texts the viewings of the next
 * hour, nobody else; a viewing booked twenty minutes out is not texted at all.
 *
 * WHAT IS LOGGED. os_sms_log, keyed on the viewing, its start time and the
 * number - so a viewing moved to another time is reminded about afresh, and
 * two viewers sharing one phone get one text.
 */

export type TextState = "sent" | "would" | "skipped" | "failed" | "held";

export interface TextResult {
  key: string;
  viewingId: string;
  to: string;
  name: string;
  body: string;
  parts: number;
  state: TextState;
  detail: string;
}

export interface TextRun {
  ok: boolean;
  on: boolean;
  dry: boolean;
  connected: boolean;
  results: TextResult[];
  error?: string;
}

const EARLIEST_MIN = 20;
const LATEST_MIN = 65;

type Row = {
  id: string;
  starts_at: string | Date;
  agent: string | null;
  contacts: { name?: string; phone?: string | null }[] | null;
  label: string | null;
  type: string | null;
};

/** "3pm", "3:30pm" - the way a text reads, not "15:00". */
export function timeForText(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, "")
    .replace(":00", "")
    .toLowerCase();
}

/**
 * The words. Plain characters only (no curly quotes, no dashes beyond "-")
 * so it bills as ordinary texts - see smsParts.
 */
export function viewingText(p: {
  firstName: string;
  time: string;
  address: string;
  agentName: string | null;
  agentPhone: string;
  unaccompanied: boolean;
}): string {
  const agentFirst = p.agentName ? firstName(p.agentName) : null;
  const meet = p.unaccompanied
    ? "It's an unaccompanied viewing, so nobody from us will be there."
    : agentFirst
      ? `${agentFirst} will meet you there.`
      : "We'll meet you there.";
  const call = agentFirst ? `call ${agentFirst} on ${p.agentPhone}` : `call us on ${p.agentPhone}`;
  return `Hi ${p.firstName}, a reminder of your viewing today at ${p.time} at ${p.address}. ${meet} Running late or can't make it? Just reply, or ${call}. The Letting Experts`;
}

/** A tidy address for a text: REX's label without a trailing postcode once it runs long. */
export function addressForText(label: string | null): string {
  const a = (label ?? "").replace(/\s+/g, " ").trim();
  if (!a) return "the property";
  if (a.length <= 45) return a;
  return a.replace(/,?\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, "").trim();
}

async function claim(key: string, r: { kind: string; viewingId: string; to: string; name: string; agent: string | null; body: string }): Promise<boolean> {
  const rows = await q<{ key: string }>(
    `INSERT INTO os_sms_log (key, kind, viewing_id, to_number, to_name, agent, body, outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'claimed')
     ON CONFLICT (key) DO UPDATE SET outcome = 'claimed', sent_at = NOW()
       WHERE os_sms_log.outcome = 'claimed' AND os_sms_log.sent_at < NOW() - INTERVAL '1 hour'
     RETURNING key`,
    [key, r.kind, r.viewingId, r.to, r.name, r.agent, r.body]
  );
  return rows.length > 0;
}

async function settle(key: string, outcome: string, detail: string, sid?: string) {
  await q(`UPDATE os_sms_log SET outcome = $2, detail = $3, twilio_sid = $4, sent_at = NOW() WHERE key = $1`, [key, outcome, detail, sid ?? null]);
}

async function release(key: string) {
  await q(`DELETE FROM os_sms_log WHERE key = $1 AND outcome = 'claimed'`, [key]).catch(() => null);
}

async function done(key: string): Promise<boolean> {
  return (await q<{ key: string }>(`SELECT key FROM os_sms_log WHERE key = $1`, [key])).length > 0;
}

/**
 * The phone a viewer is told to ring: the agent's own, from their OS profile,
 * else the mobile REX holds for them (most agents have one there and not on
 * their profile - 10 Oct 2026), else the office line. REX's diary names the
 * agent, so REX's user list is matched by name when the OS has no account.
 */
export async function phoneForAgent(name: string, user: { id: string; email: string } | null): Promise<string> {
  const own = user ? await agentPhone(user.id).catch(() => "") : "";
  if (own) return own;
  const agents = await allAgents().catch(() => []);
  const hit = agents.find((a) => (user && a.email && a.email.toLowerCase() === user.email.toLowerCase()) || a.name.trim().toLowerCase() === name.trim().toLowerCase());
  return hit?.phone || OFFICE_PHONE;
}

/**
 * The agent's own wording from Profile > Custom, or null for the standard
 * text. Checked again here, not only on save: anything that fails a rule goes
 * out as the standard text rather than as typed.
 */
export async function ownTemplate(userId: string): Promise<string | null> {
  const rows = await q<{ value: { template?: string } | null }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, VIEWING_TEXT_PREF]).catch(() => []);
  const t = tidyTemplate(rows[0]?.value?.template ?? "");
  return t && checkTemplate(t).ok ? t : null;
}

type AgentInfo = { name: string; phone: string; template: string | null };

async function agentFor(name: string | null, cache: Map<string, AgentInfo>): Promise<AgentInfo> {
  const n = (name ?? "").trim();
  if (!n) return { name: "", phone: OFFICE_PHONE, template: null };
  if (!cache.has(n)) {
    const user = await userByName(n).catch(() => null);
    cache.set(n, { name: n, phone: await phoneForAgent(n, user), template: user ? await ownTemplate(user.id) : null });
  }
  return cache.get(n)!;
}

/** The agent's own words when they have some and the viewing is accompanied; the standard text otherwise. */
export function composeText(p: { firstName: string; time: string; address: string; agent: AgentInfo; unaccompanied: boolean }): string {
  if (p.agent.template && p.agent.name && !p.unaccompanied) {
    return fillTemplate(p.agent.template, { firstName: p.firstName, time: p.time, address: p.address, myName: p.agent.name, myPhone: p.agent.phone });
  }
  return viewingText({ firstName: p.firstName, time: p.time, address: p.address, agentName: p.agent.name || null, agentPhone: p.agent.phone, unaccompanied: p.unaccompanied });
}

/**
 * One run. `dry` works everything out, REX read included, and sends nothing.
 * Switched off counts as dry: the run says what it would have sent.
 */
export async function runViewingTexts(opts: { dry?: boolean; now?: Date } = {}): Promise<TextRun> {
  const now = opts.now ?? new Date();
  const on = await switchOn("viewing_texts");
  const dry = Boolean(opts.dry) || !on;
  const run: TextRun = { ok: true, on, dry, connected: smsConfigured(), results: [] };
  if (!hasDb()) return { ...run, ok: false, error: "No database is connected." };

  const { hour } = london(now);
  if (hour < 7 || hour >= 21) return run;

  const rows = await q<Row>(
    `SELECT id, starts_at, agent, contacts, payload->>'listingLabel' AS label, payload->>'type' AS type
       FROM os_viewings
      WHERE kind = 'viewing'
        AND cancelled = FALSE
        AND id LIKE 'rex-%'
        AND starts_at >  $1::timestamptz + ($2 || ' minutes')::interval
        AND starts_at <= $1::timestamptz + ($3 || ' minutes')::interval
        AND payload->>'type' ILIKE 'TLE %Viewing%'
      ORDER BY starts_at`,
    [now.toISOString(), String(EARLIEST_MIN), String(LATEST_MIN)]
  );

  const phones = new Map<string, AgentInfo>();
  for (const row of rows) {
    /* Cheap first: if every viewer on it has been texted already, REX need
       not be asked. Keys use the ledger's start time; a moved viewing is
       caught by the fresh read below. */
    const startIso = new Date(row.starts_at).toISOString();
    const numbers = [...new Set((row.contacts ?? []).map((c) => smsNumber(c.phone)).filter((n): n is string => Boolean(n)))];
    if (!numbers.length) {
      const who = (row.contacts ?? []).map((c) => c.name).filter(Boolean).join(" and ") || "The viewer";
      run.results.push({ key: `viewing-1h:${row.id}`, viewingId: row.id, to: "", name: who, body: "", parts: 0, state: "skipped", detail: `${who}: no mobile number on REX.` });
      continue;
    }
    const pending = [];
    for (const n of numbers) if (!(await done(`viewing-1h:${row.id}:${startIso}:${n}`))) pending.push(n);
    if (!pending.length) continue;

    const fresh: Viewing | null = await readViewing(row.id.slice(4));
    const base = { viewingId: row.id, body: "", parts: 0 };
    if (!fresh) {
      run.results.push({ ...base, key: `viewing-1h:${row.id}`, to: "", name: "", state: "held", detail: "REX didn't answer, so the viewing couldn't be checked. The next run tries again." });
      continue;
    }
    const mins = (new Date(fresh.startsAt).getTime() - now.getTime()) / 60000;
    if (fresh.cancelled) {
      run.results.push({ ...base, key: `viewing-1h:${row.id}`, to: "", name: "", state: "skipped", detail: "Cancelled in REX." });
      continue;
    }
    if (mins <= EARLIEST_MIN || mins > LATEST_MIN) {
      const moved = new Date(fresh.startsAt).toISOString() !== startIso;
      run.results.push({ ...base, key: `viewing-1h:${row.id}`, to: "", name: "", state: "skipped", detail: moved ? `Moved in REX to ${timeForText(fresh.startsAt)}; it will be texted an hour before that.` : "Too close to the start to text now." });
      continue;
    }

    const agent = await agentFor(fresh.agent, phones);
    const address = addressForText(fresh.listingLabel ?? row.label);
    const unaccompanied = /unaccompanied/i.test(fresh.type ?? row.type ?? "");
    const freshStart = new Date(fresh.startsAt).toISOString();
    const texted = new Set<string>();

    for (const c of fresh.contacts) {
      const name = c.name && c.name !== "(no name)" ? c.name : "";
      const to = smsNumber(c.phone);
      const body = composeText({ firstName: firstName(name), time: timeForText(fresh.startsAt), address, agent, unaccompanied });
      const { parts } = smsParts(body);
      if (!to) {
        run.results.push({ key: `viewing-1h:${row.id}:${c.id}`, viewingId: row.id, to: c.phone ?? "", name, body, parts, state: "skipped", detail: c.phone ? `${c.phone} isn't a mobile number.` : "No phone number on REX." });
        continue;
      }
      if (texted.has(to)) continue;
      texted.add(to);
      const key = `viewing-1h:${row.id}:${freshStart}:${to}`;
      if (await done(key)) continue;
      const result: TextResult = { key, viewingId: row.id, to, name, body, parts, state: "would", detail: `Would text ${name || to} about ${address} at ${timeForText(fresh.startsAt)}.` };
      if (dry) {
        run.results.push(result);
        continue;
      }
      if (!(await claim(key, { kind: "viewing-1h", viewingId: row.id, to, name, agent: fresh.agent, body }))) continue;
      const r = await sendSms(to, body);
      if (r.sent) await settle(key, "sent", r.detail, r.sid);
      else if (r.retry) await release(key);
      else await settle(key, "refused", r.detail);
      run.results.push({ ...result, state: r.sent ? "sent" : "failed", detail: r.detail });
    }
  }
  if (run.results.some((r) => r.state === "failed")) run.ok = false;
  return run;
}

/**
 * A test text to a number an owner types (Admin), so James can see the real
 * thing on his own phone before the switch goes on. Uses the next TLE viewing
 * in the diary for the words when there is one, made-up details otherwise -
 * and says which. Not behind the switch: it only ever goes to the number
 * typed. The sending lock still stops it.
 */
export async function sendTestText(toRaw: string): Promise<{ ok: boolean; to: string | null; body: string; parts: number; from: string; detail: string }> {
  const to = smsNumber(toRaw);
  let body = viewingText({ firstName: "Sophie", time: "3pm", address: "14 Test Street, Manchester", agentName: "Tom Smith", agentPhone: OFFICE_PHONE, unaccompanied: false });
  let from = "made-up details";
  if (hasDb()) {
    const next = await q<Row>(
      `SELECT id, starts_at, agent, contacts, payload->>'listingLabel' AS label, payload->>'type' AS type
         FROM os_viewings
        WHERE kind = 'viewing' AND cancelled = FALSE AND starts_at > NOW() AND payload->>'type' ILIKE 'TLE %Viewing%'
        ORDER BY starts_at LIMIT 1`
    ).catch(() => []);
    const v = next[0];
    if (v) {
      const c = (v.contacts ?? [])[0];
      body = composeText({
        firstName: firstName(c?.name && c.name !== "(no name)" ? c.name : ""),
        time: timeForText(new Date(v.starts_at).toISOString()),
        address: addressForText(v.label),
        agent: await agentFor(v.agent, new Map()),
        unaccompanied: /unaccompanied/i.test(v.type ?? ""),
      });
      from = `the next TLE viewing in the diary (${v.id})`;
    }
  }
  const { parts } = smsParts(body);
  if (!to) return { ok: false, to: null, body, parts, from, detail: "That isn't a mobile number." };
  const r = await sendSms(to, body);
  if (hasDb()) {
    await q(
      `INSERT INTO os_sms_log (key, kind, to_number, body, outcome, detail, twilio_sid) VALUES ($1,'test',$2,$3,$4,$5,$6)`,
      [`test:${Date.now()}:${to}`, to, body, r.sent ? "sent" : "refused", r.detail, r.sid ?? null]
    ).catch(() => null);
  }
  return { ok: r.sent, to, body, parts, from, detail: r.detail };
}
