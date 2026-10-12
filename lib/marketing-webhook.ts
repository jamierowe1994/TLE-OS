import { createHmac, randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * A ping to marketing's app for every new lead (James, 12 Oct 2026: "add
 * webhooks for new leads too"), alongside the figures feed
 * (lib/marketing-feed). The same rule as the feed: what came in, from where,
 * tenant or landlord, the town and the advertised home - never a name, an
 * email or a phone number.
 *
 *   MARKETING_WEBHOOK_URL     where to send; https only; several, comma-separated
 *   MARKETING_WEBHOOK_SECRET  signs each one, so the app can tell it is ours
 *
 * Each POST is one event, JSON, with these headers:
 *   X-TLE-Event       lead.created | ping
 *   X-TLE-Delivery    unique per send; a retry of the same lead reuses the lead id in the body
 *   X-TLE-Timestamp   unix seconds
 *   X-TLE-Signature   sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with the secret>
 *
 * Rides the five-minute lead scan (/api/leads/scan), so a lead reaches the
 * app within about five minutes of reaching the OS. "New" is new to the OS
 * (first_seen), and only leads received in the last two days, so a backfill
 * of old leads never floods the app. A failed send stops the run and the same
 * lead goes again next time: the app should treat `id` as the key and ignore
 * one it already has. With no address set the cursor still moves, so setting
 * one later starts from that moment rather than sending the backlog.
 */

const SETTING = "marketing_webhook";
const PER_RUN = 40;

/* A cursor is the exact time (to the microsecond, as text from Postgres) and
   the id: the scan stamps a whole batch with one first_seen, so time alone
   would skip the rest of a batch cut short at PER_RUN. */
interface Cursor {
  at: string;
  id: string;
}

interface State {
  leadsCursor?: Cursor;
  contactsCursor?: Cursor;
  sent?: number;
  lastSentAt?: string;
  lastError?: string | null;
  lastErrorAt?: string | null;
}

export interface LeadEvent {
  event: "lead.created";
  id: string;
  receivedAt: string;
  source: string;
  type: "tenant" | "landlord";
  stage: string;
  area: string | null;
  /** The advertised home a tenant asked about. Never on a landlord lead: that address is the landlord's own. */
  property: { listingId: string; address: string | null } | null;
}

function targets(): string[] {
  return (process.env.MARKETING_WEBHOOK_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => /^https:\/\/[^\s]+$/i.test(u));
}

async function readState(): Promise<State> {
  const rows = await q<{ value: State }>(`SELECT value FROM os_settings WHERE key = $1`, [SETTING]).catch(() => []);
  return rows[0]?.value ?? {};
}

async function writeState(s: State): Promise<void> {
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), 'marketing webhook')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [SETTING, JSON.stringify(s)]
  );
}

async function post(url: string, event: string, body: unknown): Promise<string | null> {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const secret = process.env.MARKETING_WEBHOOK_SECRET ?? "";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "TLE-OS-webhook/1",
    "x-tle-event": event,
    "x-tle-delivery": randomUUID(),
    "x-tle-timestamp": ts,
  };
  if (secret) headers["x-tle-signature"] = `sha256=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`;
  try {
    const r = await fetch(url, { method: "POST", headers, body: raw, signal: AbortSignal.timeout(8000), redirect: "error" });
    return r.ok ? null : `${new URL(url).host} answered ${r.status}`;
  } catch (e) {
    return `${new URL(url).host} did not answer (${e instanceof Error ? e.name : "error"})`;
  }
}

async function sendToAll(event: string, body: unknown): Promise<string | null> {
  for (const url of targets()) {
    const err = await post(url, event, body);
    if (err) return err;
  }
  return null;
}

/** The new leads since the cursors, oldest first, in the event's shape. */
const US = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

async function newLeads(s: State): Promise<{ events: LeadEvent[]; marks: { lead?: Cursor; contact?: Cursor }[] }> {
  const fresh = { at: new Date().toISOString(), id: "" };
  const lc = s.leadsCursor ?? fresh;
  const cc = s.contactsCursor ?? fresh;
  const leads = await q<{ id: string; at: Date; seen: string; source: string; enquiry: string; stage: string; area: string | null; listing_id: string | null; address: string | null }>(
    `SELECT id, received_at AS at, ${US("first_seen")} AS seen, COALESCE(NULLIF(TRIM(source), ''), 'Not recorded') AS source,
            enquiry, COALESCE(NULLIF(stage, ''), 'New') AS stage,
            NULLIF(NULLIF(TRIM(payload->>'area'), ''), '—') AS area, NULLIF(listing_id, '') AS listing_id, NULLIF(address, '') AS address
       FROM os_leads
      WHERE (first_seen, id) > ($1::timestamptz, $2)
        AND received_at > NOW() - INTERVAL '2 days'
        AND source IS DISTINCT FROM 'REX diary'
        AND id NOT IN (SELECT id FROM os_hidden_leads)
      ORDER BY first_seen, id
      LIMIT $3`,
    [lc.at, lc.id, PER_RUN]
  );
  const contacts = await q<{ id: string; at: Date; mark: string; source: string; kind: string }>(
    `SELECT id, created_at AS at, ${US("created_at")} AS mark, COALESCE(NULLIF(TRIM(source), ''), 'Not recorded') AS source, kind
       FROM os_contacts
      WHERE (created_at, id) > ($1::timestamptz, $2) AND NOT COALESCE(is_test, false)
      ORDER BY created_at, id
      LIMIT $3`,
    [cc.at, cc.id, PER_RUN]
  );
  const out: { e: LeadEvent; at: number; mark: { lead?: Cursor; contact?: Cursor } }[] = [];
  for (const l of leads) {
    const type = l.enquiry === "Valuation" ? "landlord" : "tenant";
    out.push({
      at: new Date(l.seen).getTime(),
      mark: { lead: { at: l.seen, id: l.id } },
      e: {
        event: "lead.created",
        id: l.id,
        receivedAt: new Date(l.at).toISOString(),
        source: l.source,
        type,
        stage: l.stage,
        area: l.area,
        property: type === "tenant" && l.listing_id ? { listingId: l.listing_id, address: l.address } : null,
      },
    });
  }
  for (const c of contacts) {
    out.push({
      at: new Date(c.at).getTime(),
      mark: { contact: { at: c.mark, id: c.id } },
      e: { event: "lead.created", id: `os-${c.id}`, receivedAt: new Date(c.at).toISOString(), source: c.source, type: c.kind === "landlord" ? "landlord" : "tenant", stage: "Added in the OS", area: null, property: null },
    });
  }
  out.sort((a, b) => a.at - b.at);
  return { events: out.map((o) => o.e), marks: out.map((o) => o.mark) };
}

export interface WebhookRun {
  on: boolean;
  sent: number;
  waiting: number;
  error?: string;
}

/** Send what is new. Called by the lead scan; safe to call again. */
export async function sendNewLeadWebhooks(): Promise<WebhookRun> {
  if (!hasDb()) return { on: false, sent: 0, waiting: 0 };
  const s = await readState();
  const now: Cursor = { at: new Date().toISOString(), id: "" };
  if (!targets().length) {
    /* Off: keep the cursors at now, so switching it on sends from then. */
    await writeState({ ...s, leadsCursor: now, contactsCursor: now });
    return { on: false, sent: 0, waiting: 0 };
  }
  const { events, marks } = await newLeads(s);
  let sent = 0;
  const next: State = { ...s, leadsCursor: s.leadsCursor ?? now, contactsCursor: s.contactsCursor ?? now };
  for (let i = 0; i < events.length; i++) {
    const err = await sendToAll("lead.created", { ...events[i], sentAt: new Date().toISOString() });
    if (err) {
      await writeState({ ...next, sent: (s.sent ?? 0) + sent, lastError: err, lastErrorAt: new Date().toISOString() });
      return { on: true, sent, waiting: events.length - i, error: err };
    }
    if (marks[i].lead) next.leadsCursor = marks[i].lead;
    if (marks[i].contact) next.contactsCursor = marks[i].contact;
    sent++;
  }
  await writeState({ ...next, sent: (s.sent ?? 0) + sent, lastSentAt: sent ? new Date().toISOString() : s.lastSentAt, lastError: null, lastErrorAt: null });
  return { on: true, sent, waiting: 0 };
}

/** One "ping" with a made-up lead in the real shape, for setting the app up. */
export async function sendTestWebhook(): Promise<{ ok: boolean; error?: string; to: string[] }> {
  const to = targets();
  if (!to.length) return { ok: false, error: "No MARKETING_WEBHOOK_URL is set (it must start https://).", to };
  const sample: LeadEvent & { test: true; sentAt: string } = {
    event: "lead.created",
    id: "test-0000",
    receivedAt: new Date().toISOString(),
    source: "Rightmove",
    type: "tenant",
    stage: "New",
    area: "Glasgow",
    property: { listingId: "0", address: "1 Example Street, Glasgow G1 1AA" },
    test: true,
    sentAt: new Date().toISOString(),
  };
  const error = await sendToAll("ping", sample);
  return error ? { ok: false, error, to: to.map((u) => new URL(u).host) } : { ok: true, to: to.map((u) => new URL(u).host) };
}

export async function webhookStatus() {
  const s = hasDb() ? await readState() : {};
  return { on: targets().length > 0, signed: Boolean(process.env.MARKETING_WEBHOOK_SECRET), to: targets().map((u) => new URL(u).host), ...s };
}
