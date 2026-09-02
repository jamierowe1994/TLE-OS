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
 *
 * ⚠️ NO BACKTICKS ANYWHERE BELOW, INCLUDING IN COMMENTS.
 *
 * This is one long template literal, so the first backtick inside it ENDS the
 * string. The rest of the file then parses as nonsense and the failure is
 * reported far from the cause: `npm run build` says "Expected a semicolon" at
 * whatever line happens to follow. It has bitten twice, both times in a
 * `-- comment` where somebody quoted a column or a value out of habit.
 *
 * Use plain quotes or angle brackets instead: "awaiting valuation",
 * lead-<leadId>. Several people append tables here at once; this is the one
 * rule that breaks everybody's build rather than just your own.
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

-- THE PILOT. Who has been invited to try the platform before launch.
--
-- Replaces the hard-coded FOUNDING_OWNERS list: an invite is a row somebody
-- created deliberately, which is a far better answer to "who may have an
-- account" than a constant that needs a deploy to change.
CREATE TABLE IF NOT EXISTS os_invites (
  email          TEXT PRIMARY KEY,
  name           TEXT NOT NULL DEFAULT '',
  rex_user_id    TEXT,
  invited_by     TEXT NOT NULL DEFAULT '',
  invited_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When the invite email actually went. Null means created but never sent.
  sent_at        TIMESTAMPTZ,
  accepted_at    TIMESTAMPTZ
);

-- The role they get when they redeem.
--
-- Without this every invite produced an "agent", a role holding no
-- capabilities at all — so Susan, who runs the business, redeemed her link on
-- 29 Aug and could not open a single business screen. Nothing was wrong with
-- her account; nobody could have given it the right role in the first place.
--
-- Null means "whatever the default is", which keeps every invite made before
-- this column existed behaving exactly as it did.
ALTER TABLE os_invites ADD COLUMN IF NOT EXISTS role TEXT;

-- WHAT THE PILOT ACTUALLY USES.
--
-- One row per person per page per day, counted. Not one row per view: five
-- agents over six weeks would be a hundred thousand rows to answer a question
-- ("is anyone opening Compliance?") that a daily count answers exactly as well.
--
-- The point is the ABSENCE as much as the presence — a tab nobody has ever
-- opened is the finding, and that can only be seen by comparing this against
-- the full list of tabs.
CREATE TABLE IF NOT EXISTS os_page_views (
  user_id        TEXT NOT NULL,
  path           TEXT NOT NULL,
  day            DATE NOT NULL,
  views          INTEGER NOT NULL DEFAULT 1,
  last_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, path, day)
);
CREATE INDEX IF NOT EXISTS os_page_views_path ON os_page_views (path);

-- Every email that actually left, as it left.
--
-- James, 29 Aug: "I should be able to click on the email to Francesca and be
-- able to click it to open it to see if it's actually what's been sent."
--
-- WHY THE HTML IS STORED RATHER THAN RE-RENDERED
--
-- Re-rendering the template on demand answers a different question. It shows
-- what that email would look like TODAY, and presents it as what somebody
-- received a fortnight ago. Every template here has changed several times in
-- one afternoon; the copy, the animation and the whole shell were replaced
-- between one invite and the next. A record that quietly updates itself is
-- not a record.
--
-- THE LINK IS REDACTED BEFORE IT IS STORED
--
-- An invite email contains a live one-time join token. Keeping it here would
-- put a working credential in a table that any owner can read, so somebody
-- could open the log and use it to claim an account before its owner did.
-- The href is replaced at write time; the button still renders, and it can no
-- longer be spent. This is a record of how an email LOOKED, not a way back
-- into it.
CREATE TABLE IF NOT EXISTS os_sent_emails (
  id          TEXT PRIMARY KEY,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  html        TEXT NOT NULL DEFAULT '',
  -- Who caused it, when it is a person rather than a schedule.
  actor_email TEXT NOT NULL DEFAULT '',
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_sent_emails_at ON os_sent_emails (sent_at DESC);
CREATE INDEX IF NOT EXISTS os_sent_emails_to ON os_sent_emails (lower(to_email));

-- BUGS AND FAULTS, reported by the pilot from the button in the corner.
--
-- The context column holds what the reporter should not have to type: the page
-- they were on, their browser, the viewport. Half of bug triage is working out
-- where somebody was standing, and asking them is how a report becomes a
-- conversation instead of a fix.
CREATE TABLE IF NOT EXISTS os_bugs (
  id             TEXT PRIMARY KEY,
  reporter_id    TEXT,
  reporter_email TEXT NOT NULL DEFAULT '',
  body           TEXT NOT NULL,
  path           TEXT NOT NULL DEFAULT '',
  context        JSONB,
  -- open | ack | fixed | wontfix
  state          TEXT NOT NULL DEFAULT 'open',
  -- bug | idea | confusing  — "I did not understand this" is worth catching
  -- separately from "this is broken", and a pilot produces far more of it.
  kind           TEXT NOT NULL DEFAULT 'bug',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_bugs_state ON os_bugs (state, created_at DESC);

-- The screen as it looked when they reported it.
--
-- A separate table, not a column on os_bugs, and that is the whole point: a
-- JPEG is tens of kilobytes and the reports list reads every row. Hanging it
-- off the bug would make opening the list drag every picture with it, so the
-- list stays light and a picture is fetched only when somebody looks at one.
--
-- Deleted after 30 days. It captures whatever was on screen, which on this
-- product means landlord names, tenant details and arrears — a bigger data
-- footprint than anything else the OS keeps. Long enough to investigate what
-- the pilot reports, short enough that it never becomes an archive nobody
-- remembers holding.
CREATE TABLE IF NOT EXISTS os_bug_shots (
  bug_id     TEXT PRIMARY KEY,
  shot       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_bug_shots_at ON os_bug_shots (created_at);

-- CUSTOM ATTRIBUTES — fields a person invents for themselves.
--
-- Two tables, because a definition and a value are different lifetimes. Rename
-- a field and every value it holds should follow; delete a lead and its values
-- go with it while the definition stays.
--
-- Deliberately PER PERSON (owner_id). James: "they will stay personal to that
-- account." One agent tracking "Boiler serviced?" must not put that column on
-- everybody else's leads — that is how a CRM ends up with forty fields nobody
-- filled in.
CREATE TABLE IF NOT EXISTS os_attr_defs (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL,
  -- leads | listings | viewings | market_appraisals | tenant_passport
  entity         TEXT NOT NULL,
  label          TEXT NOT NULL,
  -- text | yesno | select
  kind           TEXT NOT NULL DEFAULT 'text',
  -- For 'select' only. JSON array of strings.
  options        JSONB,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_attr_defs_owner ON os_attr_defs (owner_id, entity, position);
-- Only meaningful for the tenant_passport entity, where the person answering
-- is a tenant filling in a form rather than an agent noting something down.
-- Defaults false: a question nobody marked as required is optional.
ALTER TABLE os_attr_defs ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT FALSE;

-- The values. record_id is whatever that entity is keyed on — a REX id, a
-- sample id — kept as TEXT so it never has to care.
CREATE TABLE IF NOT EXISTS os_attr_values (
  def_id         TEXT NOT NULL,
  record_id      TEXT NOT NULL,
  value          TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (def_id, record_id)
);
CREATE INDEX IF NOT EXISTS os_attr_values_def ON os_attr_values (def_id, value);

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

-- Market appraisals the OS has actually booked.
--
-- Its own table rather than a case on the lead, because an appraisal outlives
-- the lead's questions: it is looked up by ITS id from the file page and the
-- presentation builder, listed on its own screen, and filtered by stage. A
-- jsonb blob hanging off a lead answers none of those without reading every
-- lead.
--
-- The id is derived from the lead (lead-<leadId>) rather than random, which
-- makes booking IDEMPOTENT: an agent who books, goes back and books again
-- moves the appointment rather than growing a second appraisal for the same
-- property. The handover URL is stable for the same reason.
--
-- The stage is stored, unlike "awaiting valuation" which stays derived. A
-- stage is somewhere a record SITS and only a person can move it; the flag is
-- a fact about the clock, so computing it on read means nothing can forget it.
CREATE TABLE IF NOT EXISTS os_market_appraisals (
  id             TEXT PRIMARY KEY,
  lead_id        TEXT,
  landlord       TEXT NOT NULL,
  address        TEXT NOT NULL,
  postcode       TEXT NOT NULL DEFAULT '',
  agent          TEXT,
  appointment_at TIMESTAMPTZ,
  stage          TEXT NOT NULL DEFAULT 'booked',
  valuation      INTEGER,
  present_token  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_market_appraisals_stage_idx
  ON os_market_appraisals (stage, appointment_at);

-- THE TERMS AGREED AT THE VISIT, added 31 Aug 2026.
--
-- The valuation column shipped on its own and had no writer at all for weeks,
-- which is how a column ends up permanently NULL. These arrive together with
-- the form that fills them, because the post-appraisal deck cannot state an
-- offer without them.
--
-- ADD COLUMN IF NOT EXISTS rather than a new table: it is one row per appraisal
-- either way, and a join to say "and the fee was 10%" buys nothing.
-- fee_pct is NUMERIC, not INTEGER — 9.5% is a real number an agent will quote.
-- THE REX PROPERTY THIS APPRAISAL IS ABOUT, captured by a person.
--
-- Signing the terms creates a REX listing, and a listing hangs off a property.
-- Resolving that property by matching an address is the one thing this project
-- has been bitten by hardest -- Homesearch confidently returned "18 Knoll Rise"
-- for "18 Ashworth Rise", and a startsWith postcode check put Luton
-- comparables on a Liverpool flat. Those were READS. Getting it wrong here
-- attaches a landlord's signed contract to somebody else's house in the live
-- CRM six businesses share.
--
-- So it is never inferred. REX's own Properties/autocomplete does the matching
-- and an agent picks from the results, once, deliberately.
ALTER TABLE os_market_appraisals ADD COLUMN IF NOT EXISTS rex_property_id TEXT;
ALTER TABLE os_market_appraisals ADD COLUMN IF NOT EXISTS service_level   TEXT;
ALTER TABLE os_market_appraisals ADD COLUMN IF NOT EXISTS fee_pct         NUMERIC;
ALTER TABLE os_market_appraisals ADD COLUMN IF NOT EXISTS setup_fee       INTEGER;
ALTER TABLE os_market_appraisals ADD COLUMN IF NOT EXISTS valuation_note  TEXT;
ALTER TABLE os_market_appraisals ADD COLUMN IF NOT EXISTS valued_at       TIMESTAMPTZ;
ALTER TABLE os_market_appraisals ADD COLUMN IF NOT EXISTS valued_by       TEXT;

-- WHAT KIRSTIE HAS ALREADY BEEN TOLD.
--
-- One row per (deal, stage) alert that has actually been sent. Without it the
-- digest is a machine that mails the same twelve problems every morning until
-- somebody builds a filter for it, which is the same as not having it.
--
-- Keyed on the alert key rather than a surrogate id, so recording a send is an
-- upsert and a re-run of the same day cannot double-send. The key is stable by
-- construction: deal id + stage key, decided in lib/business/deal-alerts.
--
-- cleared_at rather than a delete. A deposit that goes missing, gets registered
-- and goes missing again is two separate things worth being told about, and the
-- history of which is which is worth more than the row it saves.
-- THE MARKET, WATCHED DAILY, BECAUSE NOBODY SELLS THE ANSWER.
--
-- Homesearch has no completed-let source and no let date. Measured 30 Aug 2026:
-- NN5 let 2,570 properties in twelve months while the listings feed holds 214
-- rows for the whole district, because a finished let LEAVES the feed. Every
-- comparable-lets endpoint 404s. So the only way to know WHEN something let is
-- to look every day and notice it change.
--
-- One row per listing per sector we watch. status is the latest seen; the two
-- timestamps are the ones worth having:
--   let_agreed_at - first day we saw it flip to let agreed. A real date.
--   gone_at       - first day it was absent from a run that otherwise worked.
--
-- gone_at is deliberately NOT set from an empty or failed sweep: a sector that
-- returns nothing because Homesearch 429d would otherwise mark its entire book
-- as vanished, and the history would be permanently wrong with no way to tell.
-- See the run route - it writes nothing at all on a sector that comes back empty.
--
-- days_advertised is left to be computed on read from first_seen, not stored,
-- because a stored derived column drifts the day the inputs are corrected.
CREATE TABLE IF NOT EXISTS os_listing_capture (
  listing_key    TEXT PRIMARY KEY,
  sector         TEXT NOT NULL,
  postcode       TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  beds           INTEGER,
  property_type  TEXT,
  rent           INTEGER,
  agent          TEXT,
  lat            DOUBLE PRECISION,
  lon            DOUBLE PRECISION,
  status         TEXT NOT NULL DEFAULT '',
  listed_on      DATE,
  first_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  let_agreed_at  TIMESTAMPTZ,
  gone_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS os_listing_capture_sector_idx
  ON os_listing_capture (sector, status);
CREATE INDEX IF NOT EXISTS os_listing_capture_letagreed_idx
  ON os_listing_capture (let_agreed_at);

-- WHICH SECTORS WE WATCH.
--
-- Explicit rather than derived, because the sweep costs Homesearch calls and a
-- rule like <every sector we have ever appraised in> grows without anybody
-- deciding to. Seeded from appraisal postcodes, then edited by hand.
-- SIGNED CONTRACTS. The OS is the store of record; REX is a copy.
--
-- James, 31 Aug: "the main storage hub is OS, and then we push it to REX as a
-- backup." That ordering is load-bearing and it is why rex_pushed_at is
-- nullable rather than the row waiting on it -- the file is safe in R2 the
-- moment this row exists, and a REX outage costs us a backup rather than the
-- contract.
--
-- THE URL IS NOT STORED, and that is not an oversight. DocuSeal's document
-- URLs expire after 40 minutes; their own docs say "do not store document URLs
-- in your database". We keep the submission id and fetch a fresh URL whenever
-- one is needed, and the bytes themselves live in R2 under r2_key.
--
-- submitter_id is the PRIMARY KEY because webhooks retry. Two deliveries of
-- the same completion must produce one document, not two.
CREATE TABLE IF NOT EXISTS os_signed_documents (
  submitter_id   BIGINT PRIMARY KEY,
  submission_id  BIGINT,
  appraisal_id   TEXT NOT NULL DEFAULT '',
  template_name  TEXT NOT NULL DEFAULT '',
  signer_name    TEXT NOT NULL DEFAULT '',
  signer_email   TEXT NOT NULL DEFAULT '',
  r2_key         TEXT NOT NULL DEFAULT '',
  bytes          INTEGER,
  completed_at   TIMESTAMPTZ,
  stored_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The backup. Null means not copied yet; the error says why it failed, so a
  -- silent gap and a known failure never look the same.
  rex_pushed_at  TIMESTAMPTZ,
  rex_document_id TEXT,
  rex_error      TEXT
);
CREATE INDEX IF NOT EXISTS os_signed_documents_appraisal_idx
  ON os_signed_documents (appraisal_id, stored_at DESC);
CREATE INDEX IF NOT EXISTS os_signed_documents_unpushed_idx
  ON os_signed_documents (rex_pushed_at) WHERE rex_pushed_at IS NULL;

CREATE TABLE IF NOT EXISTS os_capture_sectors (
  sector      TEXT PRIMARY KEY,
  added_by    TEXT NOT NULL DEFAULT '',
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  last_seen_n INTEGER
);

CREATE TABLE IF NOT EXISTS os_deal_alerts_sent (
  alert_key      TEXT PRIMARY KEY,
  deal_id        TEXT NOT NULL,
  stage_key      TEXT NOT NULL,
  tone           TEXT NOT NULL DEFAULT 'attention',
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS os_deal_alerts_sent_deal ON os_deal_alerts_sent (deal_id);

-- WHICH CERTIFICATE CHASES HAVE ALREADY GONE OUT.
--
-- Keyed on the queue's own key, propertyId:cert:band, which is stable by
-- construction (see lib/compliance-tracker buildQueue). One row per band means
-- a certificate is chased once at 30 days, once at 14, once at 7 — and never
-- twice for the same band however often the runner is called.
--
-- Chasing BY BAND rather than by exact day is the tracker's design and this
-- table is what makes it safe: a certificate with 22 days left sits in the
-- 30-day band and stays there, so a run that is missed for a week does not
-- mean that chase never happens. Without a sent-log the same band would then
-- be sent every single morning until it crossed into the next one.
--
-- No cleared_at. A band is crossed once and never re-entered: days remaining
-- only ever falls. A renewed certificate gets a NEW expiry date and therefore
-- new keys, so the history stays readable rather than being reset.
CREATE TABLE IF NOT EXISTS os_compliance_chases_sent (
  chase_key      TEXT PRIMARY KEY,
  property_id    TEXT NOT NULL,
  cert           TEXT NOT NULL,
  band           INTEGER NOT NULL,
  sent_to        TEXT NOT NULL DEFAULT '',
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_compliance_chases_property
  ON os_compliance_chases_sent (property_id);

-- THE SWITCHES. What is armed, decided in the product rather than in Railway.
--
-- James, 29 Aug: "rather than me having to go in and do variables, I should
-- have toggles in my settings where I can turn it on and off... at the moment
-- I'm going to have to sit down on the day it goes live and type in a tonne of
-- variables."
--
-- An environment variable was never chosen for safety on purpose; it was simply
-- where a flag goes when there is no product yet. It happens to be awkward, and
-- awkwardness was doing real work: you cannot arm a send from your phone by
-- accident. Moving these into the product removes that, so the friction moves
-- with them - see CONFIRM in lib/switches, which is typed and checked on the
-- SERVER, not merely in a dialog.
--
-- A row exists only once somebody has touched a switch. Until then the old
-- environment variable still decides, so this table changes nothing on the day
-- it ships and everything stays exactly as armed as it was.
CREATE TABLE IF NOT EXISTS os_switches (
  key            TEXT PRIMARY KEY,
  is_on          BOOLEAN NOT NULL DEFAULT FALSE,
  changed_by     TEXT NOT NULL DEFAULT '',
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- People added in the OS, and what became of them in REX.
--
-- The New Lead panel had a Save button that called an optional callback the
-- only caller never passed. Pressing it showed "Saved to Leads" and wrote
-- nothing anywhere: not here, not REX, not even React state. This table is
-- what it should always have been writing to.
--
-- WHY THE PORTAL ROW COMES FIRST, AND REX SECOND.
--
-- REX is the live system six businesses run on, so a write into it is gated
-- twice over and will often be refused. If Save depended on that write, Save
-- would fail for reasons that have nothing to do with the person typing, and
-- their twenty minutes on the phone would be gone. So the row is written here
-- unconditionally, and rex_state records honestly what happened next:
--
--   held    saved here; the REX push was not armed, so nothing was attempted
--   sent    created in REX, and rex_id is its contact id
--   failed  attempted and refused, with the reason in rex_detail
--   linked  they carried on an existing REX contact rather than making one
--
-- "held" is the important one. It means the work is not lost and can be sent
-- the moment the lock comes off, which is the whole reason not to make Save
-- and push the same act.
CREATE TABLE IF NOT EXISTS os_contacts (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL DEFAULT 'tenant',
  name           TEXT NOT NULL DEFAULT '',
  name_first     TEXT NOT NULL DEFAULT '',
  name_last      TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  mobile         TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  postcode       TEXT NOT NULL DEFAULT '',
  source         TEXT NOT NULL DEFAULT '',
  enquiry        TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rex_id         TEXT,
  rex_state      TEXT NOT NULL DEFAULT 'held',
  rex_detail     TEXT NOT NULL DEFAULT '',
  rex_at         TIMESTAMPTZ,
  rex_by         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS os_contacts_state ON os_contacts (rex_state, created_at DESC);

-- The tenant passport: their details, filled in once.
--
-- Keyed on a TOKEN, not on an account, because there is no tenant sign-in yet
-- (os_portal_accounts is declared above and used by nothing). The link in the
-- email is the credential, exactly as the pre-appraisal deck at
-- /present/<token> already works. That means a tenant can start their passport
-- the moment they get the email rather than after inventing a password, which
-- is the whole reason the drop-off happens where it does.
--
-- Consequence, stated plainly: anyone holding the link can read and write it.
-- That is acceptable for a form somebody fills in about themselves and would
-- not be for anything they can spend or cancel. When accounts arrive this
-- gains a contact_id and the token becomes one way in rather than the only one.
--
-- data is JSONB because the questions are still moving. What must NOT drift is
-- the token: it is the identity, and it is in an email that cannot be recalled.
CREATE TABLE IF NOT EXISTS os_tenant_passports (
  token          TEXT PRIMARY KEY,
  contact_id     TEXT,
  name           TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  data           JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS os_tenant_passports_contact ON os_tenant_passports (contact_id);
-- Whose passport this is, as an os_users.id. It decides which custom
-- questions the tenant is asked: an agent's questions follow their own
-- properties and appear on nobody else's passports. Nullable, because every
-- passport minted before this column existed has no agent, and the honest
-- answer for those is "none" rather than a guess.
ALTER TABLE os_tenant_passports ADD COLUMN IF NOT EXISTS agent_id TEXT;

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
-- THE WORDS AN AGENT SENDS BY HAND.
--
-- Distinct from os_email_templates below, which is keyed on
-- (campaign_id, step_index) and is an overlay for campaign copy — a row there
-- means nothing without a campaign behind it. This is the ordinary case: a
-- landlord in front of you and one email to write now.
--
-- Built-ins live in lib/message-templates.ts, not here. A row with the same id
-- OVERRIDES one, and deleting the row reverts it, which is why the built-ins
-- are never written in on first read.
CREATE TABLE IF NOT EXISTS os_message_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  -- landlord | tenant | any
  audience    TEXT NOT NULL DEFAULT 'any',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT NOT NULL DEFAULT ''
);

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

-- The agent's Microsoft 365 mailbox, so an email to a landlord comes from
-- them and the reply threads onto it in their own Outlook.
--
-- A REFRESH token, not an access token, and no expiry column: Microsoft's
-- refresh tokens rotate on use and last as long as they keep being used, so
-- there is no weekly prompt to schedule. The row existing IS the connection;
-- deleting it is how somebody disconnects.
--
-- Sealed with AES-GCM under a key derived from AUTH_SECRET, same as the REX
-- token above but a different salt so one cannot open the other. This is a
-- bearer credential for a person's MAILBOX, which is a worse thing to leak
-- than a CRM session, and it must never sit in a backup in plain text.
CREATE TABLE IF NOT EXISTS os_ms_tokens (
  user_id      TEXT PRIMARY KEY,
  ms_email     TEXT NOT NULL,
  refresh_enc  TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
-- The pre-appraisal is the one email in the run that is BETTER late: the day
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

-- The assistant's standing brief: who he is and how he behaves.
--
-- James, 29 Aug: "I need to give some general context about what he's here to
-- do and how he can help… how he should talk, how he should respond to things,
-- what his language should be like, what he's here to do."
--
-- Deliberately SEPARATE from assistant_knowledge, which holds facts about the
-- business. This is the standing instruction — the difference between what he
-- knows and who he is. Keeping them apart matters for two reasons: the brief
-- wants to be edited as one continuous piece of writing rather than chopped
-- into titled entries, and it goes into the prompt FIRST, ahead of the facts,
-- because instructions have to be read before the material they apply to.
--
-- One row, always. Versioning would be a nice-to-have; a second row would be a
-- bug, so the primary key is a constant.
CREATE TABLE IF NOT EXISTS os_assistant_brief (
  id          TEXT PRIMARY KEY DEFAULT 'brief',
  body        TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Everything anyone says to the assistant, and everything he says back.
--
-- James, 29 Aug: "each agent will have a stored log, and we'll save all of that
-- information… because we can use that for training data. Everything that any
-- agent asks it, we should log into a log category, which I should then be able
-- to go into and see what they've been talking about."
--
-- Two uses, and they pull in different directions, so both are served here
-- rather than picking one:
--   · the AGENT needs their own thread back when they reopen the panel
--   · JAMES needs to read across everybody to see where people get stuck
--
-- The thread column groups one sitting; role is who spoke. Keeping the
-- assistant's replies as rows too, not just the questions, is what makes this
-- training data rather than a list of complaints: a question is only half an
-- exchange, and what we said back is the half that might have been wrong.
CREATE TABLE IF NOT EXISTS os_assistant_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  user_email  TEXT NOT NULL DEFAULT '',
  thread      TEXT NOT NULL DEFAULT '',
  -- agent | assistant
  role        TEXT NOT NULL DEFAULT 'agent',
  text        TEXT NOT NULL,
  path        TEXT NOT NULL DEFAULT '',
  -- ask | onboarding-name | onboarding-help — so the initiation answers can be
  -- read separately from the questions, and neither pollutes the other.
  kind        TEXT NOT NULL DEFAULT 'ask',
  -- What the exchange cost. Kept per line rather than aggregated so the daily
  -- ceiling and the per-person view read from the same rows — a separate
  -- counter is a second source of truth that drifts.
  in_tokens   INTEGER NOT NULL DEFAULT 0,
  out_tokens  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE os_assistant_log ADD COLUMN IF NOT EXISTS in_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE os_assistant_log ADD COLUMN IF NOT EXISTS out_tokens INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS os_assistant_log_user ON os_assistant_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS os_assistant_log_time ON os_assistant_log (created_at DESC);

-- People, as the TEG Team Hub knows them.
--
-- The Hub (a Base44 app) is the group's register of everyone who joins: brand,
-- contact details, compliance, partner package and bio. It is the master for
-- facts about a PERSON, the way Propoly is master for a deal — so the OS reads
-- it and never writes back.
--
-- Why a local copy at all, rather than calling the Hub when a page needs a bio:
--
--   1. A landlord-facing page must not fail because a third-party app is down
--      or slow. A bio is decoration; it can be stale, it cannot be a hard
--      dependency of a page that has to render.
--   2. It is one HTTP call for ~49 people instead of one per profile view.
--   3. James is filling these in by hand over time and wants a ping to re-pull.
--      A sync target makes "ping" mean something specific.
--
-- Keyed on the lower-cased email, because that is the only field the Hub
-- declares unique (and it declares it case-INSENSITIVE, while the stored data
-- genuinely mixes case — Amrit.Bhogal@TheLettingExperts.co.uk sits next to
-- sean.mcmahon@thelettingexperts.co.uk). Never compare these raw.
--
-- rex_id is the better join where it exists but is only populated on the ~20
-- records that came from Rex, so it is an indexed column rather than the key.
--
-- payload keeps the whole record. The Hub has ~120 fields and will grow; this
-- way a new one we want later needs no migration, just a read.
CREATE TABLE IF NOT EXISTS os_teg_people (
  email            TEXT PRIMARY KEY,
  rex_id           TEXT,
  name             TEXT,
  job_title        TEXT,
  person_type      TEXT,
  partner_package  TEXT,
  bio              TEXT,
  photo_url        TEXT,
  status           TEXT,
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_teg_people_rex_id ON os_teg_people (rex_id);
-- Their home address, from the Hub. PERSONAL DATA: read for the signed-in
-- person's OWN record only, to prefill the travel-time origin on their
-- profile. It is deliberately absent from the columns the admin people list
-- selects -- see lib/teg-people.ts.
ALTER TABLE os_teg_people ADD COLUMN IF NOT EXISTS home_address TEXT;

-- The PLC handover: an accepted application on its way through compliance.
--
-- One row per submission, not per document and not per check. The pack is the
-- unit people talk about -- "where is 41 Harewood up to" -- and splitting it
-- across three tables would make the one question anybody asks a join.
--
-- documents and findings are JSONB rather than child tables on purpose. Both
-- are written whole, read whole, and never queried across cases; the shapes
-- live in lib/plc.ts where the checks themselves are defined, so a new check
-- is one entry in a list rather than a migration.
--
-- state is TEXT with no CHECK constraint. The legal orderings live in
-- PLC_TRANSITIONS and are enforced in the store, where the refusal can say
-- WHY -- a database constraint here would give an agent a 500 and no sentence.
--
-- decided_by holds a name, not a user id. The row is the audit record of a
-- legal judgement, and it has to stay readable after somebody leaves and their
-- account is gone.
CREATE TABLE IF NOT EXISTS os_plc_cases (
  id              TEXT PRIMARY KEY,
  application_ref TEXT NOT NULL,
  address         TEXT NOT NULL,
  agent_name      TEXT NOT NULL,
  agent_email     TEXT NOT NULL DEFAULT '',
  state           TEXT NOT NULL DEFAULT 'assembling',
  move_in_date    DATE,
  agent_note      TEXT NOT NULL DEFAULT '',
  documents       JSONB NOT NULL DEFAULT '[]'::jsonb,
  findings        JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at    TIMESTAMPTZ,
  scanned_at      TIMESTAMPTZ,
  decided_at      TIMESTAMPTZ,
  decided_by      TEXT,
  decision_note   TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Kirstie's queue is "everything not finished, oldest first", so it is the
-- state and the submission time that get indexed rather than the address.
CREATE INDEX IF NOT EXISTS os_plc_cases_state ON os_plc_cases (state, submitted_at);
CREATE INDEX IF NOT EXISTS os_plc_cases_agent ON os_plc_cases (lower(agent_email), created_at DESC);

-- The shadow log: what the rules recommended, and what the person decided.
--
-- One row per case, written twice -- once when the scan finishes, once when
-- somebody decides. Separate from os_plc_cases on purpose: a case is a live
-- record that gets reopened, re-scanned and edited, while this is a measurement
-- that must survive all of that unchanged. Keeping the prediction on the case
-- would mean the thing being measured could overwrite its own score.
--
-- agreement is computed and stored rather than derived on read, so a later
-- change to the comparison rules cannot silently rewrite history.
--
-- No CHECK constraints and no foreign key. Recording must never be able to
-- fail a decision -- see lib/plc-shadow, which swallows its own errors for the
-- same reason the audit trail does.
CREATE TABLE IF NOT EXISTS os_plc_shadow (
  case_id       TEXT PRIMARY KEY,
  address       TEXT NOT NULL DEFAULT '',
  recommended   TEXT,
  headline      TEXT NOT NULL DEFAULT '',
  per_check     JSONB NOT NULL DEFAULT '[]'::jsonb,
  scanned_at    TIMESTAMPTZ,
  decision      TEXT,
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT NOT NULL DEFAULT '',
  agreement     TEXT
);
CREATE INDEX IF NOT EXISTS os_plc_shadow_agreement ON os_plc_shadow (agreement, decided_at DESC);
-- How long the pack sat with compliance. Copied onto this row rather than
-- joined from os_plc_cases, because a case can be reopened and resubmitted and
-- the turnaround being measured is the one for THIS decision.
ALTER TABLE os_plc_shadow ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
-- Stored, not computed on read. The figure gets quoted to agents ("we have got
-- it down to 24 hours"), so it must mean the same thing next year as it does
-- today even if the two timestamps around it are ever changed.
ALTER TABLE os_plc_shadow ADD COLUMN IF NOT EXISTS hours_to_decide NUMERIC;

-- ── Landlord Radar (docs/LANDLORD-RADAR.md) ─────────────────────────────────
-- The capture learns the property behind the listing, and the district the
-- Radar sweep asked for. Additive, so the original sector sweep is untouched.
ALTER TABLE os_listing_capture ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE os_listing_capture ADD COLUMN IF NOT EXISTS uprn TEXT;
ALTER TABLE os_listing_capture ADD COLUMN IF NOT EXISTS hs_id TEXT;
ALTER TABLE os_listing_capture ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE os_listing_capture ADD COLUMN IF NOT EXISTS reduced_at DATE;
-- UPRN where the feed gives one, otherwise address-derived. See propertyKeyOf.
ALTER TABLE os_listing_capture ADD COLUMN IF NOT EXISTS property_key TEXT;
-- Rows from before the district column existed: the outcode of their sector.
UPDATE os_listing_capture SET district = split_part(sector, ' ', 1) WHERE district IS NULL;
CREATE INDEX IF NOT EXISTS os_listing_capture_district_idx
  ON os_listing_capture (district, status);
CREATE INDEX IF NOT EXISTS os_listing_capture_property_idx
  ON os_listing_capture (property_key);

-- What changed, when. The capture upserts in place, so without this a rent
-- reduction is simply the new rent by the next morning. seen, back, gone,
-- rent, status, agent. Values are text so one table holds all of them.
CREATE TABLE IF NOT EXISTS os_listing_events (
  id           BIGSERIAL PRIMARY KEY,
  listing_key  TEXT NOT NULL,
  property_key TEXT,
  district     TEXT,
  event        TEXT NOT NULL,
  from_value   TEXT,
  to_value     TEXT,
  at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_listing_events_listing_idx
  ON os_listing_events (listing_key, at DESC);
CREATE INDEX IF NOT EXISTS os_listing_events_district_idx
  ON os_listing_events (district, event, at DESC);

-- The patch Radar watches, by district. NN and MK to start.
CREATE TABLE IF NOT EXISTS os_radar_districts (
  district    TEXT PRIMARY KEY,
  added_by    TEXT NOT NULL DEFAULT '',
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  last_seen_n INTEGER
);

-- One row per PROPERTY the signals have flagged, keyed the same way as the
-- capture. Signals and score are recomputed after every sweep; stage, assignee
-- and notes are the human side and survive the recompute. No person is named
-- here: this is properties, agents and prices only, by design.
CREATE TABLE IF NOT EXISTS os_radar_prospects (
  property_key   TEXT PRIMARY KEY,
  listing_key    TEXT,
  uprn           TEXT,
  address        TEXT NOT NULL DEFAULT '',
  street         TEXT,
  postcode       TEXT NOT NULL DEFAULT '',
  sector         TEXT,
  district       TEXT,
  beds           INTEGER,
  property_type  TEXT,
  rent           INTEGER,
  agent          TEXT,
  status         TEXT,
  listed_on      DATE,
  signals        JSONB NOT NULL DEFAULT '[]'::jsonb,
  score          INTEGER NOT NULL DEFAULT 0,
  stage          TEXT NOT NULL DEFAULT 'new',
  assigned_to    TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  first_flagged  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_signal_at TIMESTAMPTZ,
  last_action_at TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_radar_prospects_score_idx
  ON os_radar_prospects (score DESC, last_signal_at DESC);
-- Where it is, for the map. From the feed; 1,561 of the first 1,583 flagged had one.
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;

-- ── Bond (the prospecting workspace over Radar) ───────────────────────────
-- Pinning a street-only listing to one front door: the candidates in the
-- postcode, which one we settled on, and how sure we are. See lib/bond.
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS resolved_hs_id TEXT;
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS resolved_address TEXT;
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS resolved_uprn TEXT;
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS address_confidence INTEGER;
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS address_candidates JSONB;
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- What people did in Bond, so Today can show it. Never a person outside
-- the company: actor is the colleague, the property is the subject.
CREATE TABLE IF NOT EXISTS os_bond_activity (
  id           BIGSERIAL PRIMARY KEY,
  actor        TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL,
  property_key TEXT,
  address      TEXT NOT NULL DEFAULT '',
  detail       TEXT NOT NULL DEFAULT '',
  at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_bond_activity_at_idx ON os_bond_activity (at DESC);

-- Land Registry lookups. A row is a REQUEST; status says what came of it.
-- Nothing is written here until a provider is connected (lib/bond).
CREATE TABLE IF NOT EXISTS os_bond_owner_lookups (
  id                     BIGSERIAL PRIMARY KEY,
  property_key           TEXT NOT NULL,
  address                TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL DEFAULT 'requested',
  provider               TEXT,
  title_number           TEXT,
  owner_name             TEXT,
  correspondence_address TEXT,
  cost_pence             INTEGER,
  requested_by           TEXT NOT NULL DEFAULT '',
  requested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS os_bond_owner_lookups_property_idx ON os_bond_owner_lookups (property_key, requested_at DESC);

-- Postcards. Same shape: a request, then what the print house said.
CREATE TABLE IF NOT EXISTS os_bond_postcards (
  id            BIGSERIAL PRIMARY KEY,
  property_key  TEXT NOT NULL,
  property      TEXT NOT NULL DEFAULT '',
  to_name       TEXT,
  to_address    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'queued',
  provider      TEXT,
  provider_ref  TEXT,
  cost_pence    INTEGER,
  requested_by  TEXT NOT NULL DEFAULT '',
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS os_bond_postcards_at_idx ON os_bond_postcards (requested_at DESC);

-- Company-owned titles in the patch, from HM Land Registry's free monthly
-- files (UK companies, overseas companies). Only rows whose postcode is in a
-- watched district are kept; the rest of the 3.7 million are streamed past.
-- No private individual is ever in these files: the Land Registry strips them.
CREATE TABLE IF NOT EXISTS os_company_titles (
  title_number     TEXT PRIMARY KEY,
  source           TEXT NOT NULL,
  tenure           TEXT,
  property_address TEXT NOT NULL DEFAULT '',
  postcode         TEXT NOT NULL DEFAULT '',
  district         TEXT,
  house_number     TEXT,
  proprietor_name  TEXT NOT NULL DEFAULT '',
  company_number   TEXT,
  category         TEXT,
  proprietor_address TEXT NOT NULL DEFAULT '',
  proprietor_country TEXT,
  other_proprietors  INTEGER NOT NULL DEFAULT 0,
  price_paid       INTEGER,
  proprietor_added DATE,
  seen_in          TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_company_titles_postcode_idx ON os_company_titles (postcode, house_number);
CREATE INDEX IF NOT EXISTS os_company_titles_company_idx ON os_company_titles (company_number);

-- One row per sync run, so the Owners room can say when the files were last
-- read and whether a run is still going.
CREATE TABLE IF NOT EXISTS os_company_sync (
  id          BIGSERIAL PRIMARY KEY,
  dataset     TEXT NOT NULL,
  file_name   TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'running',
  rows_read   INTEGER NOT NULL DEFAULT 0,
  rows_kept   INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- The company behind a flagged property, when one of the titles matched.
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS owner_company_name TEXT;
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS owner_company_number TEXT;
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS owner_company_address TEXT;
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS owner_title_number TEXT;

-- Both markets in one capture. A row is a listing to let or a listing for
-- sale; the property behind it is the same, which is the whole point.
ALTER TABLE os_listing_capture ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'let';
CREATE INDEX IF NOT EXISTS os_listing_capture_market_idx ON os_listing_capture (district, market, status);
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'let';
ALTER TABLE os_radar_prospects ADD COLUMN IF NOT EXISTS asking_price INTEGER;

-- Completed sales in the patch, from HM Land Registry Price Paid Data: free,
-- no account, published monthly. Only the districts we watch are kept. A sale
-- followed by a listing to let is a brand new landlord.
CREATE TABLE IF NOT EXISTS os_sales (
  transaction_id TEXT PRIMARY KEY,
  price          INTEGER NOT NULL,
  sold_on        DATE NOT NULL,
  postcode       TEXT NOT NULL,
  district       TEXT,
  property_type  TEXT,
  new_build      BOOLEAN NOT NULL DEFAULT FALSE,
  tenure         TEXT,
  paon           TEXT NOT NULL DEFAULT '',
  saon           TEXT NOT NULL DEFAULT '',
  street         TEXT NOT NULL DEFAULT '',
  town           TEXT NOT NULL DEFAULT '',
  house_number   TEXT,
  category       TEXT,
  record_status  TEXT,
  seen_in        TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS os_sales_postcode_idx ON os_sales (postcode, house_number, sold_on DESC);
CREATE INDEX IF NOT EXISTS os_sales_sold_idx ON os_sales (sold_on DESC);
-- One row per Radar run. The run takes minutes now that both feeds are read
-- and the edge closes a request at 100 seconds, so the route answers at once
-- and this is where the answer goes.
CREATE TABLE IF NOT EXISTS os_radar_runs (
  id          BIGSERIAL PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'running',
  swept       INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  seen        INTEGER NOT NULL DEFAULT 0,
  new_rows    INTEGER NOT NULL DEFAULT 0,
  events      INTEGER NOT NULL DEFAULT 0,
  active      INTEGER,
  quiet       INTEGER,
  digest      TEXT,
  error       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS os_sales_sync (
  id          BIGSERIAL PRIMARY KEY,
  file_name   TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'running',
  rows_read   INTEGER NOT NULL DEFAULT 0,
  rows_kept   INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
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
