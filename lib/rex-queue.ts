import "server-only";
import { hasDb, q } from "@/lib/db";
import type { RexResponse } from "@/lib/rex";
import { noteQueued, onRexBack, readRexSetting, rexDownReason, rexIsDown } from "@/lib/rex-outage";

/* ==========================================================================
   CHANGES FOR REX, KEPT WHILE IT IS DOWN (21 Oct 2026).

   Only a write that already got past the lock reaches here: rexCall refuses
   anything not armed in REX_ALLOW_WRITES before it ever asks whether REX is
   up, so the queue can never send something James has not approved. And on
   the way out each row is checked against the lock again, in case a write
   was disarmed overnight.

   Which writes wait, and which are turned away:

   - A write whose answer nobody reads (an update, a note, a diary entry
     moved) is kept and the caller is told it went: the OS has its own copy of
     the change, and REX gets it in the morning.
   - A CREATE whose new id the caller files away cannot be faked - a made-up
     id would be written into the OS and point at nothing. Those are turned
     away fast with "try again after 8am", and every one of them already has a
     retry of its own (signed terms hourly, certificates on the next filing).

   Sent in order, one at a time, a second and a half apart. The first refusal
   stops the run: a later change can depend on an earlier one, and REX must
   not end up with the second without the first. Admin > REX status shows
   what is waiting, what went and what stopped it.
   ========================================================================== */

/** Writes that are kept and sent later. Anything else is turned away while REX is down. */
const KEEP_FOR_LATER = new Set<string>([
  /* Updates to a record REX already has, where the caller only asks "did it
     go" (audit, 21 Oct 2026). Creates, uploads, notes, e-sign requests, mail
     merges and publishing all need REX's own answer, so they are turned away. */
  "Listings/update",
  "Properties/update",
  "Contacts/update",
  "CalendarEvents/update",
  "TenancyApplications/update",
  "ComplianceEntries/update",
  "CustomFields/setFieldValues",
]);

export function keptForLater(service: string, method: string): boolean {
  return KEEP_FOR_LATER.has(`${service}/${method}`);
}

const DOWN_REFUSAL = "REX is down for maintenance. This needs REX to answer, so try it again once it is back.";

/* Said the way REX is down (22 Oct 2026). "Until about 8am" was written into
   the words, so at 9.45am the next morning a two-minute blip told James
   Crumpton REX was still down for the night's maintenance. */
async function downRefusal(): Promise<string> {
  const reason = await rexDownReason().catch(() => null);
  if (reason === "detected") return "REX isn't answering just now. Nothing was saved there - try again in a minute or two.";
  if (reason === "planned") {
    const until = (await readRexSetting().catch(() => null))?.plannedUntil;
    const at = until ? new Date(until) : null;
    if (at && Number.isFinite(at.getTime())) {
      const time = at.toLocaleString("en-GB", { weekday: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" });
      return `REX is down for maintenance until about ${time}. This needs REX to answer, so try it again once it is back.`;
    }
  }
  return DOWN_REFUSAL;
}

/** Which record a write is about, so the record can say "Waiting for REX". */
function recordOf(service: string, body: unknown): { kind: string; id: string } | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const d = (b.data ?? {}) as Record<string, unknown>;
  const pick = (...vals: unknown[]) => {
    for (const v of vals) if (v != null && v !== "" && (typeof v === "string" || typeof v === "number")) return String(v);
    return null;
  };
  const rel = (d._related ?? d.related ?? {}) as Record<string, unknown>;
  const listing = pick(d.listing_id, b.listing_id, (rel as { listing_id?: unknown }).listing_id);
  if (service === "Listings") return pick(d.id, b.id, listing) ? { kind: "listing", id: pick(d.id, b.id, listing)! } : null;
  if (service === "Contacts") return pick(d.id, b.id) ? { kind: "contact", id: pick(d.id, b.id)! } : null;
  if (service === "Properties") return pick(d.id, b.id) ? { kind: "property", id: pick(d.id, b.id)! } : null;
  if (service === "Leads") return pick(d.id, b.id) ? { kind: "lead", id: pick(d.id, b.id)! } : null;
  if (listing) return { kind: "listing", id: listing };
  const contact = pick(d.contact_id, b.contact_id);
  if (contact) return { kind: "contact", id: contact };
  const property = pick(d.property_id, b.property_id);
  if (property) return { kind: "property", id: property };
  const own = pick(d.id, b.id);
  return own ? { kind: service, id: own } : null;
}

/** Who is making the change, if this is a signed-in request. */
async function whoIsAsking(): Promise<{ id: string | null; name: string }> {
  try {
    const { cookies } = await import("next/headers");
    const { SESSION_COOKIE, verifySessionToken } = await import("@/lib/auth");
    const { findUserById } = await import("@/lib/users");
    const id = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
    if (!id) return { id: null, name: "" };
    const u = await findUserById(id);
    return { id, name: u?.name || u?.email || "" };
  } catch {
    /* Outside a request (a cron): nobody in particular. */
    return { id: null, name: "" };
  }
}

/**
 * rexCall's answer for a write while REX is down: kept (202, ok) or turned
 * away (503). Never throws for a database hiccup - a write that cannot be
 * kept is turned away, so the caller's own retry still has it.
 */
export async function queueRexWrite(
  service: string,
  method: string,
  body: unknown,
  actorToken: string | null
): Promise<RexResponse> {
  if (!hasDb()) return { status: 503, ok: false, result: undefined, error: await downRefusal() };
  const keep = keptForLater(service, method);
  try {
    const who = await whoIsAsking();
    const rec = recordOf(service, body);
    /* Turned away, but written down (James, 21 Oct 2026): the backlog for the
       morning's catch-up has to know about everything REX did not get, not
       only what can be sent on as it is. Never sent from here - a create is
       redone by the catch-up through the OS's own push, so the new REX id
       lands on the OS record (lib/rex-catchup). */
    if (!keep) {
      await q(
        `INSERT INTO os_rex_write_queue (service, method, body, actor_user_id, actor_name, as_person, record_kind, record_id, summary, state)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, 'turned_away')`,
        [service, method, JSON.stringify(body ?? {}), who.id, who.name, Boolean(actorToken), rec?.kind ?? null, rec?.id ?? null, summaryOf(service, method)]
      );
      return { status: 503, ok: false, result: undefined, error: await downRefusal() };
    }
    const rows = await q<{ id: string }>(
      `INSERT INTO os_rex_write_queue (service, method, body, actor_user_id, actor_name, as_person, record_kind, record_id, summary)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9) RETURNING id::text`,
      [service, method, JSON.stringify(body ?? {}), who.id, who.name, Boolean(actorToken), rec?.kind ?? null, rec?.id ?? null, summaryOf(service, method)]
    );
    noteQueued();
    qs().maybeWaiting = true;
    await showOnCopy(service, body).catch((e) => console.warn("[rex-queue] could not show the change on the copy", e));
    console.log(`[rex-queue] kept ${service}/${method} #${rows[0]?.id} for when REX is back`);
    return { status: 202, ok: true, result: null, error: null, queuedId: Number(rows[0]?.id) };
  } catch (e) {
    console.error("[rex-queue] could not keep a write", `${service}/${method}`, e);
    return { status: 503, ok: false, result: undefined, error: await downRefusal() };
  }
}

function summaryOf(service: string, method: string): string {
  const what: Record<string, string> = {
    "Listings/update": "Listing changed",
    "Properties/update": "Property changed",
    "Contacts/update": "Contact changed",
    "CalendarEvents/update": "Diary entry changed",
    "TenancyApplications/update": "Application changed",
    "ComplianceEntries/update": "Certificate changed",
    "CustomFields/setFieldValues": "Custom fields changed",
    "Contacts/create": "New contact",
    "Notes/create": "Note",
    "CalendarEvents/create": "New diary entry",
    "Listings/create": "New listing",
    "Properties/create": "New property",
    "TenancyApplications/create": "New application",
    "ComplianceEntries/create": "New certificate",
    "Upload/uploadFileFromUrl": "File upload",
    "EsignRequests/create": "REX e-sign request (old route, not DocuSeal)",
    "ListingPublication/publish": "Listing published",
    "ListingPublication/setActivePublicationChannels": "Portals chosen",
    "MailMerge/queueMergeUsingObjects": "Mail merge",
  };
  return what[`${service}/${method}`] ?? `${service} ${method}`;
}

/**
 * The change shown on the copy straight away (21 Oct 2026). Without this an
 * agent edits a listing, the screen reads it back from the copy taken before
 * the edit, and the change looks lost. Only the kept "read" of that one
 * record is touched, and only fields the copy already has with the same kind
 * of value - a field the update names differently is left alone rather than
 * risk a shape the screen does not expect. REX gets the real thing later.
 */
async function showOnCopy(service: string, body: unknown): Promise<void> {
  const data = ((body ?? {}) as { data?: Record<string, unknown> }).data;
  const id = data?.id;
  if (!data || id == null || !["Listings", "Properties", "Contacts"].includes(service)) return;
  const rows = await q<{ key: string; result: Record<string, unknown> | null }>(
    `SELECT key, result FROM os_rex_snapshot WHERE service = $1 AND method = 'read' AND body->>'id' = $2`,
    [service, String(id)]
  );
  for (const row of rows) {
    const r = row.result;
    if (!r || typeof r !== "object") continue;
    let changed = false;
    for (const [k, v] of Object.entries(data)) {
      if (k === "id" || !(k in r)) continue;
      const was = r[k];
      const same = v === null || was === null || typeof v === typeof was;
      if (!same || (v !== null && typeof v === "object")) continue;
      r[k] = v;
      changed = true;
    }
    if (changed) await q(`UPDATE os_rex_snapshot SET result = $2::jsonb WHERE key = $1`, [row.key, JSON.stringify(r)]);
  }
}

/* ───────────────────────── sending it on ───────────────────────── */

export interface QueueRow {
  id: string;
  service: string;
  method: string;
  actorName: string;
  asPerson: boolean;
  recordKind: string | null;
  recordId: string | null;
  summary: string;
  state: "waiting" | "sent" | "failed" | "held" | "skipped" | "turned_away" | "caught_up";
  queuedAt: string;
  triedAt: string | null;
  sentAt: string | null;
  error: string | null;
}

export async function queueRows(limit = 200): Promise<QueueRow[]> {
  if (!hasDb()) return [];
  const rows = await q<Record<string, unknown>>(
    `SELECT id::text, service, method, actor_name, as_person, record_kind, record_id, summary, state,
            queued_at, tried_at, sent_at, error
       FROM os_rex_write_queue ORDER BY (state IN ('waiting','failed','turned_away')) DESC, id DESC LIMIT $1`,
    [limit]
  );
  const t = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return rows.map((r) => ({
    id: String(r.id),
    service: String(r.service),
    method: String(r.method),
    actorName: String(r.actor_name ?? ""),
    asPerson: Boolean(r.as_person),
    recordKind: (r.record_kind as string) ?? null,
    recordId: (r.record_id as string) ?? null,
    summary: String(r.summary ?? ""),
    state: r.state as QueueRow["state"],
    queuedAt: t(r.queued_at)!,
    triedAt: t(r.tried_at),
    sentAt: t(r.sent_at),
    error: (r.error as string) ?? null,
  }));
}

/** Waiting changes for one record, for its "Waiting for REX" line. */
export async function waitingFor(kind: string, id: string): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM os_rex_write_queue WHERE record_kind = $1 AND record_id = $2 AND state IN ('waiting','failed','turned_away')`,
    [kind, id]
  ).catch(() => []);
  return Number(rows[0]?.n ?? 0);
}

/* On globalThis, not module scope: a route bundle can carry its own copy of
   this module, and two copies each thinking they were the only replay sent a
   refused change four times in testing (21 Oct 2026). The lease in the
   database below is what actually keeps it to one at a time. */
const gq = globalThis as {
  __rexQueue?: { maybeWaiting: boolean; running: Promise<ReplayReport> | null; lastKick: number; hooked: boolean };
};
function qs() {
  if (!gq.__rexQueue) gq.__rexQueue = { maybeWaiting: true, running: null, lastKick: 0, hooked: false };
  return gq.__rexQueue;
}

export interface ReplayReport {
  sent: number;
  held: number;
  stopped: { id: string; what: string; error: string } | null;
  skippedBecause?: string;
}

/** Something is waiting (a write kept, a job stepped aside): look on the next good answer. */
export function markWaiting(): void {
  qs().maybeWaiting = true;
}

/** A good REX answer came back: if anything may be waiting, send it (at most once a minute). */
export function kickReplay(): void {
  const g = qs();
  if (!g.maybeWaiting || g.running || Date.now() - g.lastKick < 60_000) return;
  g.lastKick = Date.now();
  /* Thirty seconds' grace: REX's first good answer after an outage is not
     yet proof it will take a run of writes. */
  setTimeout(() => void replayQueue("automatic").catch((e) => console.error("[rex-queue] replay failed", e)), 30_000);
}

if (!qs().hooked) {
  qs().hooked = true;
  onRexBack(() => {
    const g = qs();
    g.maybeWaiting = true;
    g.lastKick = 0;
    kickReplay();
  });
}

const PACE_MS = 1_500;

export function replayQueue(by: string): Promise<ReplayReport> {
  const g = qs();
  if (g.running) return g.running;
  g.running = doReplay(by).finally(() => {
    g.running = null;
  });
  return g.running;
}

/* One replay at a time, across every copy of this module and every server:
   a lease in os_settings, taken only if nobody holds a live one, renewed as
   each change goes, and let go at the end. */
const LEASE_KEY = "rex_queue_lease";
const LEASE_MS = 3 * 60_000;
async function takeLease(holder: string): Promise<boolean> {
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const rows = await q<{ key: string }>(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, jsonb_build_object('holder', $2::text, 'until', $3::text), NOW(), 'rex-queue')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       WHERE (os_settings.value->>'until')::timestamptz < NOW() OR os_settings.value->>'holder' = $2
     RETURNING key`,
    [LEASE_KEY, holder, until]
  );
  return rows.length > 0;
}
async function dropLease(holder: string): Promise<void> {
  await q(`DELETE FROM os_settings WHERE key = $1 AND value->>'holder' = $2`, [LEASE_KEY, holder]).catch(() => {});
}

async function doReplay(by: string): Promise<ReplayReport> {
  const report: ReplayReport = { sent: 0, held: 0, stopped: null };
  if (!hasDb()) return { ...report, skippedBecause: "no database" };
  if (await rexIsDown()) return { ...report, skippedBecause: "REX is still down" };
  const holder = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  if (!(await takeLease(holder))) return { ...report, skippedBecause: "another send is already going" };
  try {
    return await sendInOrder(by, holder, report);
  } finally {
    await dropLease(holder);
  }
}

async function sendInOrder(by: string, holder: string, report: ReplayReport): Promise<ReplayReport> {
  /* A row that stopped the last run stays in the way until somebody looks:
     Try again or Skip it, on Admin > REX status. */
  const { rexCall, rexWritesLocked } = await import("@/lib/rex");
  const { rexTokenFor } = await import("@/lib/rex-user");
  for (;;) {
    /* The first row not yet sent - and if that is one that stopped a run,
       stop here too. Asked afresh every time, never from a list read at the
       start, so nothing can be sent past a refusal. */
    const rows = await q<{ id: string; service: string; method: string; body: unknown; actor_user_id: string | null; as_person: boolean; state: string; error: string | null }>(
      `SELECT id::text, service, method, body, actor_user_id, as_person, state, error FROM os_rex_write_queue
        WHERE state IN ('waiting','failed') ORDER BY id LIMIT 1`
    );
    const row = rows[0];
    if (!row) {
      qs().maybeWaiting = false;
      break;
    }
    const what = `${row.service}/${row.method}`;
    if (row.state === "failed") {
      report.stopped = { id: row.id, what, error: row.error ?? "" };
      break;
    }
    if (!(await takeLease(holder))) break; // renewed; lost only if this run stalled past the lease
    /* Disarmed since it was kept: not sent, and not an error either. */
    if (rexWritesLocked(row.service, row.method)) {
      await q(`UPDATE os_rex_write_queue SET state = 'held', tried_at = NOW(), error = $2 WHERE id = $1`, [
        row.id,
        "No longer switched on for REX, so it was not sent.",
      ]);
      report.held += 1;
      continue;
    }
    let token: string | null = null;
    if (row.as_person) {
      token = await rexTokenFor(row.actor_user_id).catch(() => null);
      if (!token) {
        const error = "Their REX sign-in has lapsed - they need to connect REX again on Profile, then Try again.";
        await q(`UPDATE os_rex_write_queue SET state = 'failed', tried_at = NOW(), error = $2 WHERE id = $1`, [row.id, error]);
        report.stopped = { id: row.id, what, error };
        break;
      }
    }
    let res: RexResponse;
    try {
      res = await rexCall(row.service, row.method, row.body, token, { fromQueue: true });
    } catch (e) {
      res = { status: 0, ok: false, result: undefined, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) {
      const error = res.error ?? `REX answered ${res.status}`;
      await q(`UPDATE os_rex_write_queue SET state = 'failed', tried_at = NOW(), error = $2 WHERE id = $1`, [row.id, error.slice(0, 1000)]);
      report.stopped = { id: row.id, what, error };
      break;
    }
    await q(`UPDATE os_rex_write_queue SET state = 'sent', tried_at = NOW(), sent_at = NOW(), error = NULL WHERE id = $1`, [row.id]);
    report.sent += 1;
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  /* The daily jobs that stepped aside while REX was down (lib/rex-jobs),
     once the waiting changes have gone - in the background, a minute apart. */
  if (!report.stopped && !(await rexIsDown())) {
    const { rerunSkippedJobs, skippedJobs } = await import("@/lib/rex-jobs");
    if (Object.keys(await skippedJobs()).length) {
      const base = process.env.REX_SNAPSHOT_BASE || (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : "http://127.0.0.1:3000");
      void rerunSkippedJobs(base).catch((e) => console.error("[rex-jobs] rerun failed", e));
    }
  }
  console.log(`[rex-queue] replay by ${by}: sent ${report.sent}, held ${report.held}${report.stopped ? `, stopped at #${report.stopped.id} ${report.stopped.what}: ${report.stopped.error}` : ""}`);
  if (report.stopped || report.sent) {
    const { record } = await import("@/lib/audit");
    await record({
      kind: report.stopped ? "rex_queue_stopped" : "rex_queue_sent",
      actorEmail: by,
      detail: report.stopped
        ? `Sent ${report.sent} waiting change(s) to REX, then stopped at #${report.stopped.id} (${report.stopped.what}): ${report.stopped.error}`
        : `Sent ${report.sent} waiting change(s) to REX${report.held ? `; ${report.held} no longer switched on, kept back` : ""}.`,
    });
  }
  return report;
}

/** Admin's two buttons on a stopped row. */
export async function retryRow(id: string): Promise<void> {
  await q(`UPDATE os_rex_write_queue SET state = 'waiting', error = NULL WHERE id = $1 AND state = 'failed'`, [id]);
  qs().maybeWaiting = true;
}
export async function skipRow(id: string, by: string): Promise<void> {
  await q(`UPDATE os_rex_write_queue SET state = 'skipped', error = COALESCE(error, '') || $2 WHERE id = $1 AND state IN ('failed','waiting')`, [
    id,
    ` (skipped by ${by})`,
  ]);
}
