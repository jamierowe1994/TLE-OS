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
  last_seen_at   TIMESTAMPTZ
);

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
