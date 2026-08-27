import "server-only";
import { Pool } from "pg";

/**
 * The OS's memory.
 *
 * Everything in the product has lived in the browser until now — notes,
 * dashboard layouts, profiles, the customer portal accounts. That was right
 * for a wireframe and wrong for a product: a cleared browser was a wiped
 * company, and nothing could ever be shared between two people.
 *
 * Same shape as the portal's store, deliberately: DATABASE_URL set → Postgres;
 * unset → the OS carries on in demo mode with the browser holding state, so
 * the offline demo never breaks and `next build` needs no database.
 */

export function hasDb(): boolean {
  return !!process.env.DATABASE_URL;
}

/** Railway's internal network and localhost don't want SSL; everything else does. */
function needsSsl(url: string): boolean {
  return !/railway\.internal|localhost|127\.0\.0\.1/.test(url);
}

// Cached on globalThis so dev hot-reloads don't leak a pool per edit.
declare global {
  // eslint-disable-next-line no-var
  var __osPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __osSchemaReady: Promise<void> | undefined;
}

function getPool(): Pool {
  if (!globalThis.__osPool) {
    const url = process.env.DATABASE_URL!;
    globalThis.__osPool = new Pool({
      connectionString: url,
      max: 5,
      ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalThis.__osPool;
}

/**
 * The schema.
 *
 * Written CREATE-IF-NOT-EXISTS and additive-only, so deploying is never a
 * migration event — the same statements run harmlessly on every boot.
 */
const SCHEMA = `
-- The people who work here. password_hash is scrypt salt:hash, never a password.
CREATE TABLE IF NOT EXISTS os_users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL DEFAULT 'agent',
  password_hash  TEXT NOT NULL,
  photo          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ,
  -- THE IDENTITY SPINE. Their REX AccountUser id, which is what every figure
  -- in the OS is scoped by: listings, leads, appraisals, applications. Without
  -- it a person can sign in but the OS has no way to show them THEIR work, so
  -- it would show them everybody's.
  rex_user_id    TEXT
);
ALTER TABLE os_users ADD COLUMN IF NOT EXISTS rex_user_id TEXT;
CREATE INDEX IF NOT EXISTS os_users_rex ON os_users (rex_user_id);

-- Pending email verifications. The token is NEVER stored — only its SHA-256,
-- so a read of this table cannot be turned into a sign-in. One live row per
-- address: asking again replaces rather than accumulates, so the link somebody
-- is looking at is always the one that works.
CREATE TABLE IF NOT EXISTS os_email_verifications (
  email          TEXT NOT NULL,
  token_hash     TEXT NOT NULL UNIQUE,
  -- 'join' or 'reset'. A token minted for one must never be spendable on the
  -- other: a join link is issued to somebody with NO account, a reset link to
  -- somebody WITH one, and letting them cross means a stale join link could
  -- set the password on a live account.
  purpose        TEXT NOT NULL DEFAULT 'join',
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE os_email_verifications ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'join';
CREATE INDEX IF NOT EXISTS os_email_verifications_email ON os_email_verifications (email);

-- What happened, and who did it.
--
-- Sign-ins, failed sign-ins, password resets, and every "view as" an owner
-- opens. Append-only by convention: nothing in the product updates or deletes
-- a row, because the value of an audit trail is entirely in not being editable
-- by the thing it audits.
CREATE TABLE IF NOT EXISTS os_audit (
  id             TEXT PRIMARY KEY,
  -- sign_in | sign_in_failed | password_reset | view_as_start | view_as_end
  kind           TEXT NOT NULL,
  -- Who did it. Null for a failed sign-in, where there may be no such person.
  actor_id       TEXT,
  actor_email    TEXT NOT NULL DEFAULT '',
  -- Who it was done TO. Only set for view_as.
  subject_id     TEXT,
  subject_email  TEXT NOT NULL DEFAULT '',
  detail         TEXT NOT NULL DEFAULT '',
  ip             TEXT NOT NULL DEFAULT '',
  at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_audit_at ON os_audit (at DESC);
CREATE INDEX IF NOT EXISTS os_audit_kind ON os_audit (kind, at DESC);

-- The system to-do list. James's tracker for everything still to build, kept
-- IN the product rather than in a document, because a list you have to open
-- another app to read is a list nobody reads.
CREATE TABLE IF NOT EXISTS os_todos (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  detail         TEXT NOT NULL DEFAULT '',
  area           TEXT NOT NULL DEFAULT 'general',
  -- open | doing | done
  state          TEXT NOT NULL DEFAULT 'open',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS os_todos_state ON os_todos (state, created_at DESC);

-- Anything that belongs to one person and should follow them between
-- machines: dashboard layout, theme, profile fields. One row per person per
-- key, value is whatever that feature stores.
CREATE TABLE IF NOT EXISTS os_user_prefs (
  user_id        TEXT NOT NULL,
  key            TEXT NOT NULL,
  value          JSONB NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- Notes the team writes against a record (a property, a lead, a viewing).
CREATE TABLE IF NOT EXISTS os_notes (
  id             TEXT PRIMARY KEY,
  record_type    TEXT NOT NULL,
  record_id      TEXT NOT NULL,
  body           TEXT NOT NULL,
  author_id      TEXT,
  author_name    TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_notes_record_idx ON os_notes (record_type, record_id, created_at DESC);

-- The OS's own working state on a record REX has no field for: the appraisal
-- sub-case on a lead, the landlord-property-tenant link on a listing.
--
-- One table rather than one per feature, and a jsonb payload rather than a
-- column per field, because these shapes are still moving weekly — a new key
-- on the appraisal case should not be a migration. What must NOT drift is the
-- key: (kind, record_id) is the identity, so a save is an upsert and a record
-- can never end up with two competing states.
CREATE TABLE IF NOT EXISTS os_case_state (
  kind           TEXT NOT NULL,
  record_id      TEXT NOT NULL,
  payload        JSONB NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (kind, record_id)
);

-- Who is on which campaign.
--
-- Its own table, not a field on the case, because the questions are asked
-- from the CAMPAIGN's end: who is on the win-back, who is due a step this
-- week, what did the fee-objection sequence actually recover. A field on a
-- lead answers none of those without reading every lead.
--
-- One active enrolment per record per campaign, enforced rather than trusted:
-- an agent re-picking the same campaign should not start the drip twice.
CREATE TABLE IF NOT EXISTS os_campaign_enrolments (
  id             TEXT PRIMARY KEY,
  campaign_id    TEXT NOT NULL,
  record_type    TEXT NOT NULL DEFAULT 'lead',
  record_id      TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  reason         TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'active',
  stopped_reason TEXT NOT NULL DEFAULT '',
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at     TIMESTAMPTZ,
  -- How far through the steps they are. The scheduler moves this; nothing
  -- else should.
  last_step_sent INTEGER NOT NULL DEFAULT -1,
  last_sent_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS os_campaign_enrolments_active
  ON os_campaign_enrolments (campaign_id, record_type, record_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS os_campaign_enrolments_campaign
  ON os_campaign_enrolments (campaign_id, status);

-- Every step the scheduler accounted for. This is the audit trail: what went
-- out, what a person still has to do, and what was skipped because it had
-- gone stale. Kept separate from the enrolment so a row is never overwritten.
CREATE TABLE IF NOT EXISTS os_campaign_sends (
  id           TEXT PRIMARY KEY,
  enrolment_id TEXT NOT NULL,
  campaign_id  TEXT NOT NULL,
  step_index   INTEGER NOT NULL,
  step_day     INTEGER NOT NULL,
  channel      TEXT NOT NULL,
  subject      TEXT NOT NULL DEFAULT '',
  -- sent | for_human | overtaken | failed
  outcome      TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- A step can be accounted for ONCE. Two overlapping cron runs, a retried
-- deploy, a double-click on Run now — none of them can send twice, because
-- the database refuses the second row rather than the code remembering to.
-- 'failed' is left out: a failure must be free to happen again.
CREATE UNIQUE INDEX IF NOT EXISTS os_campaign_sends_once
  ON os_campaign_sends (enrolment_id, step_index)
  WHERE outcome IN ('sent', 'for_human', 'overtaken');
CREATE INDEX IF NOT EXISTS os_campaign_sends_recent ON os_campaign_sends (at DESC);

-- The copy for a campaign step, written in the editor.
--
-- An OVERLAY on the campaign in code, never a replacement: the step's day,
-- channel and audience stay where they can be read at a glance, and only the
-- words live here. Deleting a row reverts the step to whatever the code says,
-- which is the cheapest possible undo.
CREATE TABLE IF NOT EXISTS os_email_templates (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  step_index  INTEGER NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  blocks      JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS os_email_templates_step
  ON os_email_templates (campaign_id, step_index);

-- One person's REX sign-in.
--
-- The TOKEN only, encrypted, and never the password: we forward the password
-- to REX once at sign-in and forget it in the same function. Holding staff
-- passwords would let us re-authenticate silently and skip the weekly prompt,
-- which is a real security boundary traded for one click a week.
--
-- REX lets the caller choose token_lifetime up to two weeks (measured). We
-- ask for seven days, so a weekly rotation always lands well inside it.
CREATE TABLE IF NOT EXISTS os_rex_tokens (
  user_id     TEXT PRIMARY KEY,
  rex_email   TEXT NOT NULL,
  token_enc   TEXT NOT NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Campaigns marketing built here, alongside the ones that ship in code.
--
-- The built-in set stays in lib/campaigns.ts: it is the house's own thinking
-- about why a landlord walks away, it wants reviewing in a diff, and it must
-- exist on an environment with no database at all. This table is for the ones
-- marketing writes afterwards, which nobody should need a deploy for.
CREATE TABLE IF NOT EXISTS os_campaigns (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  audience    TEXT NOT NULL DEFAULT 'nurture',
  reasons     JSONB NOT NULL DEFAULT '[]',
  aim         TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'draft',
  steps       JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT NOT NULL DEFAULT ''
);

-- Customers with a portal account (tenants and landlords). Separate table
-- from os_users on purpose: a customer must never be one bad join away from
-- an office login.
CREATE TABLE IF NOT EXISTS os_portal_accounts (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,
  email          TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  password_hash  TEXT,
  rex_contact_id TEXT,
  invited_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at   TIMESTAMPTZ,
  profile        JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS os_portal_accounts_email_kind ON os_portal_accounts (email, kind);

-- Appointments and reminders made IN THE OS. These are ours alone: REX is
-- locked read-only, so nothing here has been pushed to the team's live
-- diary. Kept so the work isn't lost while that stays true, and so the sync
-- has something to send the day writes are switched on.
CREATE TABLE IF NOT EXISTS os_appointments (
  id             TEXT PRIMARY KEY,
  starts_at      TIMESTAMPTZ NOT NULL,
  mins           INTEGER NOT NULL DEFAULT 30,
  kind           TEXT NOT NULL DEFAULT 'other',
  title          TEXT NOT NULL,
  where_at       TEXT NOT NULL DEFAULT '',
  who            TEXT NOT NULL DEFAULT '',
  author_id      TEXT,
  author_name    TEXT NOT NULL DEFAULT '',
  /** Has this ever reached REX / 365? Nothing has, yet. */
  synced_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_appointments_when ON os_appointments (starts_at);

-- Presentations sent to landlords — the pre-appraisal deck they open from a
-- link in the confirmation email.
--
-- the deck column is a SNAPSHOT, deliberately: everything the viewer needs, frozen at
-- send. A landlord opening the link on a Sunday must not depend on REX being
-- up or on anyone's token still being valid, and what they saw stays visible
-- to us afterwards. The row is the record of what was sent, not a pointer to
-- data that has since moved on.
--
-- The token is the only credential. It is a 160-bit random string, never
-- guessable and never sequential, because this page is public by necessity —
-- see app/present/[token] for what is and isn't exposed through it.
CREATE TABLE IF NOT EXISTS os_presentations (
  token           TEXT PRIMARY KEY,
  kind            TEXT NOT NULL DEFAULT 'pre-appraisal',
  /** The lead or case this belongs to, so a record can show its own sends. */
  ref             TEXT NOT NULL DEFAULT '',
  deck            JSONB NOT NULL,
  author_id       TEXT,
  author_name     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  /** Opens are the whole point: an unopened deck is a follow-up call. */
  first_opened_at TIMESTAMPTZ,
  last_opened_at  TIMESTAMPTZ,
  opens           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS os_presentations_ref ON os_presentations (ref, created_at DESC);

-- Terms of business sent for signature, watched.
--
-- REX owns the request; this table exists ONLY so we can tell when one
-- CHANGES. REX has no e-sign webhook (the nearest events are contracts.*,
-- which fire on a different record), so completion has to be noticed by
-- polling — and a poll can only say "this is complete", never "this just
-- completed", unless something remembers what it looked like last time.
--
-- That is the whole job of this table: last_status is what we told somebody
-- about, notified_at is when we did. Nothing here is a copy of REX's data.
CREATE TABLE IF NOT EXISTS os_esign_watch (
  rex_id         BIGINT PRIMARY KEY,
  listing_id     BIGINT,
  /** The lead or case it belongs to, so the right record can be updated. */
  ref            TEXT NOT NULL DEFAULT '',
  template_name  TEXT NOT NULL DEFAULT '',
  sent_by        TEXT NOT NULL DEFAULT '',
  sent_by_id     TEXT,
  last_status    TEXT NOT NULL DEFAULT '',
  completed_at   TIMESTAMPTZ,
  notified_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS os_esign_watch_open
  ON os_esign_watch (last_status) WHERE last_status <> 'completed';
CREATE INDEX IF NOT EXISTS os_esign_watch_ref ON os_esign_watch (ref);

-- Emails written now and sent later.
--
-- The pre-appraisal is the one email in the run that is BETTER late: two days
-- before the visit, when it is close enough to matter and there is still time
-- to dig out the EPC. Sending it in the same hour as the booking confirmation
-- means two emails in an afternoon and one of them gets skimmed.
--
-- The BODY is stored, not a recipe for it. A queue entry that rebuilds its own
-- wording at send time can fail hours after anybody is watching, and the agent
-- who queued it never saw what actually went. What is here is what goes.
--
-- sent_at and error are the record of the attempt. A row is never deleted by
-- the runner: 'cancelled' and 'failed' are answers, and a queue that empties
-- itself cannot be asked what it did.
CREATE TABLE IF NOT EXISTS os_scheduled_sends (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL DEFAULT 'pre-appraisal',
  ref            TEXT NOT NULL DEFAULT '',
  to_email       TEXT NOT NULL,
  contact_id     TEXT,
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  send_at        TIMESTAMPTZ NOT NULL,
  state          TEXT NOT NULL DEFAULT 'queued',
  queued_by      TEXT NOT NULL DEFAULT '',
  queued_by_id   TEXT,
  sent_at        TIMESTAMPTZ,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_scheduled_sends_due
  ON os_scheduled_sends (send_at) WHERE state = 'queued';
CREATE INDEX IF NOT EXISTS os_scheduled_sends_ref ON os_scheduled_sends (ref);

-- Results of slow REX/PayProp walks, so a deploy doesn't cost minutes of
-- empty screens before the first figure appears.
CREATE TABLE IF NOT EXISTS os_cache (
  key            TEXT PRIMARY KEY,
  payload        JSONB NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/** Created lazily on first query; the promise is reset on failure so a
 *  transient outage retries rather than poisoning the process. */
function ensureSchema(): Promise<void> {
  if (!globalThis.__osSchemaReady) {
    globalThis.__osSchemaReady = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err) => {
        globalThis.__osSchemaReady = undefined;
        throw err;
      });
  }
  return globalThis.__osSchemaReady;
}

/* --------------------------------------------------------------------------
   ⚠️ THIS DATABASE IS SHARED WITH THE TLE PORTAL.

   Measured 9 Aug 2026: the DATABASE_URL given to the OS points at the
   portal's LIVE production database. All fifteen portal tables are in it —
   real staff accounts and password hashes, PayProp OAuth refresh tokens,
   deal data, forecasts, encrypted mailbox credentials.

   That is survivable, and arguably useful (a shared payprop_tokens row is
   the one clean route to the UK PayProp agency). It is only survivable
   while two rules hold:

     1. Every table the OS creates is prefixed `os_`.
     2. The OS never mutates a table it doesn't own.

   Rule 2 is enforced below rather than trusted, because the failure mode is
   not a bug in the OS — it is the portal losing live company data.
-------------------------------------------------------------------------- */

const MUTATION = /^\s*(insert\s+into|update|delete\s+from|drop\s+table|alter\s+table|truncate(?:\s+table)?)\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/i;

/** Tables the OS owns outright. Anything else is the portal's. */
function ownedByOs(table: string): boolean {
  return table.startsWith("os_");
}

/**
 * Query helper — ensures the schema exists, then runs the query.
 *
 * Refuses to mutate anything outside the OS's own tables. Reads are allowed
 * (that's how the OS would ever share the PayProp token), but a write to a
 * portal table has to be a deliberate act through `qShared`, not a typo.
 */
export async function q<Row extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<Row[]> {
  const m = MUTATION.exec(text);
  if (m && !ownedByOs(m[2].toLowerCase())) {
    throw new Error(
      `Refusing to ${m[1].toLowerCase()} "${m[2]}" — this database is shared with the TLE portal ` +
        `and that table belongs to it. If this is genuinely intended, use qShared() and say why.`
    );
  }
  return run<Row>(text, params);
}

/**
 * The deliberate escape hatch, for the rare case where the OS must write to
 * something the portal owns (updating the shared PayProp refresh token being
 * the obvious one). Separate name so it shows up in a diff and in review.
 */
export async function qShared<Row extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] | undefined,
  because: string
): Promise<Row[]> {
  if (!because) throw new Error("qShared needs a reason.");
  return run<Row>(text, params);
}

async function run<Row extends Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<Row[]> {
  if (!hasDb()) throw new Error("No database on this environment.");
  await ensureSchema();
  const res = await getPool().query(text, params as unknown[] as never[]);
  return res.rows as Row[];
}

/** For the health check: connect, create the schema, report what's there. */
export async function dbStatus(): Promise<{
  connected: boolean;
  error?: string;
  tables?: string[];
  users?: number;
  serverVersion?: string;
}> {
  if (!hasDb()) return { connected: false, error: "DATABASE_URL is not set on this environment." };
  try {
    const version = await q<{ version: string }>("SELECT version()");
    const tables = await q<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    const users = await q<{ n: string }>("SELECT COUNT(*)::text AS n FROM os_users");
    return {
      connected: true,
      // Just the product name and number — the full string carries build and
      // platform detail there's no reason to publish.
      serverVersion: (version[0]?.version ?? "").split(" ").slice(0, 2).join(" "),
      tables: tables.map((t) => t.tablename),
      users: Number(users[0]?.n ?? 0),
    };
  } catch (e) {
    return { connected: false, error: e instanceof Error ? e.message : "Could not reach the database." };
  }
}
