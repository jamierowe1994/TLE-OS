import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { COMP_BOOK, type CertKey } from "@/lib/compliance";
import {
  buildTracker,
  DEFAULT_STAGES,
  expiryOf,
  STAGE_CHOICES,
  type ChaseRow,
  type ChaseStages,
  type TrackerBook,
} from "@/lib/compliance-tracker";
import { getComplianceBook, heldComplianceBook } from "@/lib/compliance-cache";
import { rexConfigured } from "@/lib/rex";
import { msConnectionFor, msSendMail } from "@/lib/microsoft";
import { ResendBlocked, sendEmail } from "@/lib/resend";
import { proseEmail } from "@/lib/email/prose";
import { sendingLocked } from "@/lib/switches";
import type { OsUser } from "@/lib/users";

/**
 * Chasing the agent about a certificate, and the record of every chase
 * (Josel, compliance office, ticket 11c8acc9, 11 Nov 2026: "record when
 * agents are chased for compliance certificates that are due for renewal or
 * have already expired ... a tab to email the agent on OS directly on the cert
 * itself ... a clear audit trail ... automated reminders ... recorded on OS").
 *
 * ── Two doors, one trail ──────────────────────────────────────────────────
 *
 *   BY HAND    Chase the Agent on a certificate in Property Compliance. The
 *              office writes (or keeps) the message and it goes from their
 *              own Outlook where that is connected, so the agent's reply
 *              comes back to them; otherwise on the OS sender with their
 *              address to reply to. The same road as Send to Susan
 *              (lib/plc-final-ask): staff to staff, never a customer.
 *   AUTOMATIC  The daily certificate chase (app/api/compliance/reminders/run,
 *              switch "Certificate chases"), at the stages kept in
 *              os_settings "cert_chases".
 *
 * Both write one os_cert_agent_chases row per certificate, sent or not, so
 * the certificate can say "Chased Sam, 3 Nov by Josel; reminder sent 10 Nov"
 * and the office has one list of every follow-up.
 *
 * ── Only what is ours to chase ────────────────────────────────────────────
 *
 * A chase is only offered on a row the tracker itself puts on Outstanding or
 * Coming up, and the server finds that row again rather than trusting the
 * screen. So the house rules come for free: let only, rent collect, a leaver's
 * homes and homes not let are never in the tracker (lib/compliance isOurs);
 * only the certificates a home is required to hold (requiredCerts); nothing
 * the compliance team is already checking (lib/cert-hold).
 *
 * Nothing here writes to REX, PayProp or Propoly. The agent is matched from
 * held copies only.
 */

/* ── which agent ─────────────────────────────────────────────────────────── */

export type AgentLogin = { id: string; name: string; email: string };
export type AgentAnswer = {
  /** The agent's name as the records give it. Null = nobody on record. */
  name: string | null;
  /** Their OS login, which is where the email goes. */
  login: AgentLogin | null;
  /** Why there is nobody to email, in a sentence for the screen. */
  why: string | null;
};

const words = (s: string) => s.toLowerCase().replace(/[^a-z\s-]/g, "").split(/[\s-]+/).filter(Boolean);

/**
 * A name off a record, matched to one OS login (lib/works-property-agent's
 * rule, 9 Oct 2026, moved here so both read it once). The records spell names
 * their own way ("Lianna Denholm" for "Lianna Jane Denholm"), so first and
 * last name are enough. Two logins answering to one name is a guess: none.
 */
export function matchLogin<T extends { name: string }>(name: string, users: T[]): T | null {
  const want = words(name);
  if (want.length === 0) return null;
  const exact = users.filter((u) => words(u.name).join(" ") === want.join(" "));
  const loose = users.filter((u) => {
    const w = words(u.name);
    return w.length >= 2 && want.length >= 2 && w[0] === want[0] && w[w.length - 1] === want[want.length - 1];
  });
  return exact.length === 1 ? exact[0] : exact.length === 0 && loose.length === 1 ? loose[0] : null;
}

/**
 * Who to chase for each home, read once for a whole run.
 *
 * The home's agent the way Michael's view reads it: the compliance book's
 * agent (on the home's latest listing), else the name on the OS property
 * record. Measured on the live book 11 Nov 2026: 345 homes in scope, every one
 * names an agent, 259 match a login and 86 do not (Margaret Wilson's 55 the
 * most). A locked login is somebody who has gone, so it is not matched.
 */
export async function agentDirectory(): Promise<(propertyId: string, bookAgent: string | null | undefined) => AgentAnswer> {
  const named = new Map<string, string>();
  let users: AgentLogin[] = [];
  if (hasDb()) {
    const [props, people] = await Promise.all([
      q<{ id: string; rex_property_id: string | null; agent_name: string }>(
        `SELECT id, rex_property_id, agent_name FROM os_properties WHERE COALESCE(agent_name, '') <> ''`
      ).catch(() => []),
      q<AgentLogin>(`SELECT id, name, email FROM os_users WHERE email <> '' AND locked_at IS NULL`).catch(() => []),
    ]);
    /* Its own id first, then the REX id it carries. */
    for (const p of props) if (p.rex_property_id && !named.has(p.rex_property_id)) named.set(p.rex_property_id, p.agent_name.trim());
    for (const p of props) named.set(p.id, p.agent_name.trim());
    users = people.map((u) => ({ ...u, email: u.email.trim() }));
  }
  return (propertyId, bookAgent) => {
    const name = bookAgent?.trim() || named.get(propertyId) || null;
    if (!name) return { name: null, login: null, why: "This home has no agent on record, so there is nobody to chase." };
    const login = matchLogin(name, users);
    return login
      ? { name, login, why: null }
      : { name, login: null, why: `${name} has no TLE OS login, so there is no address to email. Take it up with them yourself.` };
  };
}

/* ── the automatic stages ────────────────────────────────────────────────── */

export interface ChaseSettings extends ChaseStages {
  updatedAt: string | null;
  updatedBy: string;
}

const DEFAULT_SETTINGS: ChaseSettings = { ...DEFAULT_STAGES, updatedAt: null, updatedBy: "" };
const SETTINGS_KEY = "cert_chases";

/** The stages the office has picked, or the defaults until somebody does. */
export async function chaseSettings(): Promise<ChaseSettings> {
  if (!hasDb()) return DEFAULT_SETTINGS;
  const rows = await q<{ value: Partial<ChaseStages> | null; updated_at: string; updated_by: string }>(
    `SELECT value, updated_at, updated_by FROM os_settings WHERE key = $1`,
    [SETTINGS_KEY]
  ).catch(() => []);
  const held = rows[0];
  if (!held) return DEFAULT_SETTINGS;
  const v = held.value ?? {};
  return {
    before: Array.isArray(v.before) ? STAGE_CHOICES.filter((s) => v.before!.includes(s)) : DEFAULT_SETTINGS.before,
    onExpiry: typeof v.onExpiry === "boolean" ? v.onExpiry : DEFAULT_SETTINGS.onExpiry,
    updatedAt: held.updated_at ? new Date(held.updated_at).toISOString() : null,
    updatedBy: held.updated_by ?? "",
  };
}

export async function saveChaseSettings(patch: { before?: unknown; onExpiry?: unknown }, by: string): Promise<ChaseSettings> {
  const cur = await chaseSettings();
  const before = Array.isArray(patch.before) ? STAGE_CHOICES.filter((s) => (patch.before as unknown[]).includes(s)) : cur.before;
  const onExpiry = typeof patch.onExpiry === "boolean" ? patch.onExpiry : cur.onExpiry;
  await q(
    `INSERT INTO os_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW(), updated_by = $3`,
    [SETTINGS_KEY, JSON.stringify({ before, onExpiry }), by]
  );
  return chaseSettings();
}

/* ── dates and words ─────────────────────────────────────────────────────── */


export const longDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** What the certificate is called in a sentence to an agent. */
const CALLED: Record<CertKey, string> = {
  gas: "gas safety certificate (CP12)",
  eicr: "EICR (electrical safety report)",
  epc: "EPC",
  licence: "HMO licence",
  fire: "fire risk assessment",
  pat: "PAT test",
  alarms: "smoke and CO alarm check",
  legionella: "legionella risk assessment",
};

/** The same, at the front of a subject line. */
const TITLED: Record<CertKey, string> = {
  gas: "Gas safety certificate",
  eicr: "EICR",
  epc: "EPC",
  licence: "HMO licence",
  fire: "Fire risk assessment",
  pat: "PAT test",
  alarms: "Smoke and CO alarm check",
  legionella: "Legionella risk assessment",
};

/** What is needed to put it right. */
const NEEDED: Record<CertKey, string> = {
  gas: "A Gas Safe registered engineer needs to carry out the gas safety check",
  eicr: "A qualified electrician needs to carry out a new EICR",
  epc: "An accredited assessor needs to do a new EPC",
  licence: "The licence renewal needs to go in to the council",
  fire: "A new fire risk assessment needs doing",
  pat: "The supplied appliances need PAT testing",
  alarms: "The smoke and CO alarms need testing, with a record of it",
  legionella: "A new legionella risk assessment needs doing",
};

/** Screen labels carry em dashes ("EICR — electrical safety"); a chase is read by a person. */
const plainLabel = (s: string) => s.replace(/\s+[—–]\s+/g, " - ").replace(/[—–]/g, "-");

export function certState(r: Pick<ChaseRow, "status" | "daysLeft">): "expired" | "missing" | "due" {
  return r.status === "expired" ? "expired" : r.status === "missing" ? "missing" : "due";
}

/** The chase as the office first sees it: theirs to change before it goes. */
export function draftChase(r: ChaseRow, agentName: string | null, me: { name: string }): { subject: string; message: string; expiry: string | null } {
  const key = r.cert as CertKey;
  const called = CALLED[key] ?? plainLabel(r.certLabel);
  const short = TITLED[key] ?? plainLabel(r.certLabel);
  const home = [r.property, r.locality].filter(Boolean).join(", ");
  const expiry = expiryOf(r.daysLeft);
  const state = certState(r);
  const days = r.daysLeft ?? 0;
  const when =
    state === "expired" && expiry
      ? `ran out on ${longDate(expiry)}`
      : state === "missing"
        ? expiry
          ? `ran out on ${longDate(expiry)} and we have no renewal on file`
          : "is not on file: we have no record of one at all"
        : expiry
          ? `runs out on ${longDate(expiry)}, in ${days} day${days === 1 ? "" : "s"}`
          : "is due for renewal";
  const subject =
    state === "expired" && expiry
      ? `${short} expired ${longDate(expiry)} - ${r.property}`
      : state === "missing"
        ? `${short} not on file - ${r.property}`
        : `${short} due ${expiry ? longDate(expiry) : "for renewal"} - ${r.property}`;
  const first = (agentName ?? "").trim().split(/\s+/)[0] || "there";
  const mine = (me.name ?? "").trim().split(/\s+/)[0] || "The compliance team";
  const message = [
    `Hi ${first},`,
    `The ${called} for ${home} ${when}.`,
    `${NEEDED[key] ?? "It needs renewing"}. Please speak to the landlord and get it booked in, then upload the new certificate to the home's file on TLE OS so it comes off the list.`,
    "Can you let me know when it's booked?",
    `Thanks,\n${mine}`,
  ].join("\n\n");
  return { subject, message, expiry };
}

/* ── the record ──────────────────────────────────────────────────────────── */

export interface ChaseRecord {
  id: string;
  at: string;
  propertyId: string;
  property: string;
  cert: string;
  certLabel: string;
  expiry: string | null;
  certState: string;
  agentName: string;
  agentEmail: string;
  how: "hand" | "auto";
  stage: number | null;
  byName: string;
  subject: string;
  message: string;
  sent: boolean;
  via: "mailbox" | "ours" | null;
  note: string;
}

type Row = {
  id: string; at: Date; property_id: string; property: string; cert: string; cert_label: string; expiry: string | null;
  cert_state: string; agent_name: string; agent_email: string; how: string; stage: number | null; by_name: string;
  subject: string; message: string; sent: boolean; via: string | null; note: string;
};

const COLS = `id, at, property_id, property, cert, cert_label, expiry::text AS expiry, cert_state, agent_name, agent_email,
  how, stage, by_name, subject, message, sent, via, note`;

const toRecord = (r: Row): ChaseRecord => ({
  id: r.id,
  at: new Date(r.at).toISOString(),
  propertyId: r.property_id,
  property: r.property,
  cert: r.cert,
  certLabel: r.cert_label,
  expiry: r.expiry,
  certState: r.cert_state,
  agentName: r.agent_name,
  agentEmail: r.agent_email,
  how: r.how === "auto" ? "auto" : "hand",
  stage: r.stage,
  byName: r.by_name,
  subject: r.subject,
  message: r.message,
  sent: r.sent,
  via: r.via === "mailbox" || r.via === "ours" ? r.via : null,
  note: r.note,
});

export interface NewChase {
  propertyId: string;
  property: string;
  cert: string;
  certLabel: string;
  expiry: string | null;
  certState: string;
  agentName: string;
  agentEmail: string;
  agentUserId: string | null;
  how: "hand" | "auto";
  stage?: number | null;
  stageKey?: string | null;
  byUserId?: string | null;
  byName: string;
  subject: string;
  message: string;
  sent: boolean;
  via: "mailbox" | "ours" | null;
  note?: string;
}

/** Written whether or not it went. Null only when an automatic stage was already recorded. */
export async function recordChase(c: NewChase): Promise<string | null> {
  const rows = await q<{ id: string }>(
    `INSERT INTO os_cert_agent_chases
       (id, property_id, property, cert, cert_label, expiry, cert_state, agent_name, agent_email, agent_user_id,
        how, stage, stage_key, by_user_id, by_name, subject, message, sent, via, note)
     VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (stage_key) DO NOTHING
     RETURNING id`,
    [
      randomUUID(), c.propertyId, c.property, c.cert, c.certLabel, c.expiry, c.certState, c.agentName, c.agentEmail,
      c.agentUserId, c.how, c.stage ?? null, c.stageKey ?? null, c.byUserId ?? null, c.byName, c.subject.slice(0, 300),
      c.message.slice(0, 20_000), c.sent, c.via, (c.note ?? "").slice(0, 500),
    ]
  );
  return rows[0]?.id ?? null;
}

/** Automatic stages already sent. Throws rather than guessing "none": a guess of "none" sends everything again. */
export async function stagesSent(): Promise<Set<string>> {
  if (!hasDb()) throw new Error("No database, so it cannot tell which reminders have already gone.");
  const rows = await q<{ stage_key: string }>(`SELECT stage_key FROM os_cert_agent_chases WHERE stage_key IS NOT NULL`);
  return new Set(rows.map((r) => r.stage_key));
}


/** One certificate's chases, newest first. */
export async function chasesFor(propertyId: string, cert: string): Promise<ChaseRecord[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_cert_agent_chases WHERE property_id = $1 AND cert = $2 ORDER BY at DESC LIMIT 50`,
    [propertyId, cert]
  );
  return rows.map(toRecord);
}

/** The short history a certificate row shows, keyed propertyId:cert. */
export type ChaseBrief = Pick<ChaseRecord, "at" | "how" | "agentName" | "byName" | "sent" | "stage">;

export async function chaseBriefs(sinceDays = 400): Promise<Record<string, ChaseBrief[]>> {
  const out: Record<string, ChaseBrief[]> = {};
  if (!hasDb()) return out;
  const rows = await q<{ property_id: string; cert: string; at: Date; how: string; agent_name: string; by_name: string; sent: boolean; stage: number | null }>(
    `SELECT property_id, cert, at, how, agent_name, by_name, sent, stage FROM os_cert_agent_chases
      WHERE at > NOW() - make_interval(days => $1) ORDER BY at DESC LIMIT 5000`,
    [sinceDays]
  );
  for (const r of rows) {
    const k = `${r.property_id}:${r.cert}`;
    const list = (out[k] ??= []);
    if (list.length < 6) {
      list.push({ at: new Date(r.at).toISOString(), how: r.how === "auto" ? "auto" : "hand", agentName: r.agent_name, byName: r.by_name, sent: r.sent, stage: r.stage });
    }
  }
  return out;
}

export interface TrailFilter {
  agent?: string;
  /** Words to find in the address. */
  home?: string;
  from?: string;
  to?: string;
  how?: "hand" | "auto" | "";
  cert?: string;
}

/** The office's list of every chase, newest first. */
export async function chaseTrail(f: TrailFilter, limit = 2000): Promise<ChaseRecord[]> {
  if (!hasDb()) return [];
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (f.agent) add("LOWER(agent_name) = LOWER(?)", f.agent);
  if (f.home) add("property ILIKE ?", `%${f.home.replace(/[%_]/g, "")}%`);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) add("at >= (?::date AT TIME ZONE 'Europe/London')", f.from);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) add("at < ((?::date + 1) AT TIME ZONE 'Europe/London')", f.to);
  if (f.how === "hand" || f.how === "auto") add("how = ?", f.how);
  if (f.cert) add("cert = ?", f.cert);
  args.push(limit);
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_cert_agent_chases ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC LIMIT $${args.length}`,
    args
  );
  return rows.map(toRecord);
}

/** Every agent ever chased, for the filter. */
export async function chasedAgents(): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ agent_name: string }>(
    `SELECT DISTINCT agent_name FROM os_cert_agent_chases WHERE agent_name <> '' ORDER BY agent_name`
  ).catch(() => []);
  return rows.map((r) => r.agent_name);
}

/* ── the row, found again on the server ──────────────────────────────────── */

/**
 * The tracker as Property Compliance reads it. Without REX on the live site
 * that is an error, never a stand-in. On a laptop with no REX the book last
 * held in the database stands in (a local preview's own made-up book), else
 * the sample; either way `live` is false and it says so.
 */
export async function currentTracker(): Promise<{ tracker: TrackerBook; live: boolean; reason?: string; ageMs?: number; stale?: boolean }> {
  if (rexConfigured()) {
    const { book, ageMs, stale } = await getComplianceBook();
    return { tracker: buildTracker(book.properties), live: true, ageMs, ...(stale ? { stale: true } : {}) };
  }
  if (process.env.NODE_ENV === "production") throw new Error("REX isn't connected here, so there is no compliance book to track.");
  const held = await heldComplianceBook().catch(() => null);
  return held && held.book.properties.length
    ? { tracker: buildTracker(held.book.properties), live: false, reason: "REX isn't connected here - the book last held in this database is standing in." }
    : { tracker: buildTracker(COMP_BOOK), live: false, reason: "REX isn't connected here - the sample book is standing in." };
}

/**
 * The certificate as the tracker has it, if it is one the office may chase:
 * on Outstanding (expired or no record) or Coming up (inside 30 days). The
 * screen sends only the ids; everything else is read here.
 */
export function chaseableRow(t: TrackerBook, propertyId: string, cert: string): ChaseRow | null {
  const hit = (r: ChaseRow) => r.propertyId === propertyId && r.cert === cert;
  return t.outstanding.find(hit) ?? t.upcoming.find(hit) ?? null;
}

/* ── sent by hand ────────────────────────────────────────────────────────── */

/**
 * Chase the agent, from the office person's own mailbox where it is
 * connected. Staff to staff only: the agent's address is their OS login, so
 * the OS sender's internal-only guard (lib/resend) holds on the fall-back,
 * and the brake (SENDING_LOCKED) stops both roads. Nothing is BCC'd to REX.
 *
 * Recorded either way; one sentence back for the screen.
 */
export async function sendHandChase(p: {
  me: OsUser;
  row: ChaseRow;
  agent: AgentLogin;
  agentName: string;
  subject: string;
  message: string;
}): Promise<{ sent: boolean; said: string; record: ChaseRecord | null }> {
  const { me, row, agent } = p;
  const subject = p.subject.trim().slice(0, 200);
  const message = p.message.trim().slice(0, 10_000);
  const expiry = expiryOf(row.daysLeft);

  /* A double press: the same person, the same certificate, inside a minute. */
  const recent = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM os_cert_agent_chases
      WHERE property_id = $1 AND cert = $2 AND how = 'hand' AND by_user_id = $3 AND sent AND at > NOW() - INTERVAL '1 minute'`,
    [row.propertyId, row.cert, me.id]
  ).catch(() => [{ n: "0" }]);
  if (Number(recent[0]?.n ?? 0) > 0) {
    return { sent: false, said: `That chase went to ${agent.name.split(/\s+/)[0]} a moment ago.`, record: null };
  }

  let sent = false;
  let via: "mailbox" | "ours" | null = null;
  let note = "";
  if (sendingLocked()) {
    note = "Sending is locked on this environment";
  } else {
    const html = proseEmail(message);
    const mailbox = await msConnectionFor(me.id).then((c) => c.connected).catch(() => false);
    if (mailbox) {
      try {
        await msSendMail(me.id, {
          to: { email: agent.email, name: agent.name },
          subject,
          body: html,
          about: { address: [row.property, row.locality].filter(Boolean).join(", "), propertyId: row.propertyId },
        });
        sent = true;
        via = "mailbox";
      } catch {
        /* Outlook refused or the token has gone stale: our sender below. */
      }
    }
    if (!sent) {
      try {
        await sendEmail({ to: agent.email, subject, html, text: message, replyTo: me.email || undefined });
        sent = true;
        via = "ours";
      } catch (e) {
        note = (e instanceof ResendBlocked || e instanceof Error ? e.message : "it failed").replace(/\.+$/, "");
      }
    }
  }

  const id = await recordChase({
    propertyId: row.propertyId,
    property: [row.property, row.locality].filter(Boolean).join(", "),
    cert: row.cert,
    certLabel: plainLabel(row.certLabel),
    expiry,
    certState: certState(row),
    agentName: p.agentName || agent.name,
    agentEmail: agent.email,
    agentUserId: agent.id,
    how: "hand",
    byUserId: me.id,
    byName: me.name || me.email,
    subject,
    message,
    sent,
    via,
    note,
  });
  const [saved] = await q<Row>(`SELECT ${COLS} FROM os_cert_agent_chases WHERE id = $1`, [id]);
  const first = agent.name.split(/\s+/)[0] || agent.name;
  return {
    sent,
    record: saved ? toRecord(saved) : null,
    said: sent
      ? via === "mailbox"
        ? `Chased ${first} from your Outlook. It is recorded on the certificate.`
        : `Chased ${first} from TLE OS, with your address to reply to. It is recorded on the certificate.`
      : `The email to ${first} did not go: ${note || "it failed"}. The attempt is recorded on the certificate.`,
  };
}

export { plainLabel };
