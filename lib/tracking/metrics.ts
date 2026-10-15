import type { SectionKey } from "@/lib/tracking/sections";

/**
 * What each part of the OS produces, person by person (15 Oct 2026, Admin >
 * Tracking): valuations sent, listings published, repairs raised, and the
 * equivalent for every other part.
 *
 * Every figure is one query over a table the OS already keeps, between $1 and
 * $2 (the period, `to` exclusive). Each returns the same columns, so every
 * figure can be drilled down to the records behind it:
 *
 *   at       when it happened
 *   who      the person, as the table keeps them: an account id, an email
 *            or a name (lib/tracking/report resolves all three)
 *   title    what the record is, in words
 *   href     where it opens in the OS, if anywhere
 *   email    the customer's email, address  the home's address,
 *   ids      the record's ids, test  a flag the table keeps - all used to
 *            leave test files out (lib/tracking/report: isTestRow)
 *
 * `source` is said on screen under the figure, so James can see where a number
 * comes from. `since` is the first day a figure can be trusted from, where the
 * record only started being kept recently.
 */

export interface MetricDef {
  key: string;
  section: SectionKey;
  label: string;
  /** Plain English, on screen. */
  source: string;
  sql: string;
  /** Who it is credited to when nobody is named (automatic sends, customers). */
  nobody?: string;
  /** The OS does it by itself (a reminder text, the morning briefing): shown
      and credited, but nobody counts as having used the part because of it. */
  automatic?: boolean;
  /** One of the headline figures at the top of Tracking. */
  headline?: boolean;
  /** "Counts from <date>": the day this was first recorded. */
  since?: string;
}

const PERIOD = (col: string) => `${col} >= $1 AND ${col} < $2`;

/** A read-log figure: the calls of one kind somebody made (lib/read-log, from 10 Oct 2026). */
const calls = (pathRe: string, title: string) => `
  SELECT at, user_id AS who, ${title} AS title, NULL::text AS href, NULL::text AS email, NULL::text AS address,
         ARRAY[path || CASE WHEN query <> '' THEN '?' || query ELSE '' END] AS ids, FALSE AS test
    FROM os_read_log
   WHERE ${PERIOD("at")} AND method <> 'GET' AND viewing_as IS NULL AND path ~ '${pathRe}'`;

const READ_LOG = "From the read log, which keeps every save and send made in the OS";
const READ_LOG_SINCE = "2026-10-10";

export const METRICS: MetricDef[] = [
  /* ── Leads ─────────────────────────────────────────────────────────── */
  {
    key: "lead-touches", section: "leads", label: "Notes and calls logged", headline: false,
    source: "Notes, calls and messages written on a lead (os_lead_touches)",
    sql: `SELECT t.at, t.by_id AS who, COALESCE(NULLIF(l.name, ''), 'A lead') || ' - ' || t.kind AS title,
                 '/leads?open=' || t.lead_id AS href, l.email, l.address, ARRAY[t.lead_id] AS ids, FALSE AS test
            FROM os_lead_touches t LEFT JOIN os_leads l ON l.id = t.lead_id WHERE ${PERIOD("t.at")}`,
  },
  {
    key: "contacts-made", section: "leads", label: "New contacts added",
    source: "Landlords and tenants added by hand (os_contacts)",
    sql: `SELECT created_at AS at, created_by AS who, COALESCE(NULLIF(name, ''), email, 'A contact') || ' (' || kind || ')' AS title,
                 '/leads?open=os-' || id::text AS href, email, address, ARRAY[id::text, 'os-' || id::text, rex_id] AS ids, is_test AS test
            FROM os_contacts WHERE ${PERIOD("created_at")} AND created_by LIKE '%@%'`,
  },
  {
    key: "lead-documents", section: "leads", label: "Documents added to leads",
    source: "Files uploaded on a lead's Documents tab (os_lead_documents)",
    sql: `SELECT d.at, d.by_id AS who, d.name || COALESCE(' - ' || NULLIF(l.name, ''), '') AS title,
                 '/leads?open=' || d.lead_id AS href, l.email, l.address, ARRAY[d.lead_id] AS ids, FALSE AS test
            FROM os_lead_documents d LEFT JOIN os_leads l ON l.id = d.lead_id WHERE ${PERIOD("d.at")}`,
  },
  {
    key: "leads-archived", section: "leads", label: "Leads archived",
    source: "Leads taken off the board (os_hidden_leads)",
    sql: `SELECT h.hidden_at AS at, h.hidden_by AS who, COALESCE(NULLIF(l.name, ''), 'A lead') AS title,
                 '/leads?open=' || h.id AS href, l.email, l.address, ARRAY[h.id] AS ids, h.hidden_by ILIKE '%test%' AS test
            FROM os_hidden_leads h LEFT JOIN os_leads l ON l.id = h.id WHERE ${PERIOD("h.hidden_at")}`,
  },
  {
    key: "homes-emailed", section: "leads", label: "Homes emailed to tenants",
    source: READ_LOG, since: READ_LOG_SINCE,
    sql: calls("^/api/leads/email-properties$", "'Homes emailed to a tenant'"),
  },

  /* ── Market Appraisals ─────────────────────────────────────────────── */
  {
    key: "appraisals-booked", section: "appraisals", label: "Appraisals booked",
    source: "Market appraisals made in the OS (os_market_appraisals)",
    sql: `SELECT created_at AS at, agent AS who, COALESCE(NULLIF(landlord, ''), 'A landlord') || ', ' || address AS title,
                 '/market-appraisals/' || id AS href, NULL::text AS email, address, ARRAY[id, lead_id] AS ids, FALSE AS test
            FROM os_market_appraisals WHERE ${PERIOD("created_at")}`,
  },
  {
    key: "pre-decks", section: "appraisals", label: "Pre-appraisal brochures sent",
    source: "Decks made for a landlord before the visit (os_presentations)",
    sql: `SELECT p.created_at AS at, p.author_id AS who,
                 COALESCE(NULLIF(a.landlord, ''), 'A landlord') || COALESCE(', ' || a.address, '') || CASE WHEN p.first_opened_at IS NOT NULL THEN ' - opened' ELSE ' - not opened yet' END AS title,
                 '/market-appraisals/lead-' || p.ref AS href, NULL::text AS email, a.address, ARRAY[p.ref, 'lead-' || p.ref] AS ids, FALSE AS test
            FROM os_presentations p LEFT JOIN os_market_appraisals a ON a.id = 'lead-' || p.ref
           WHERE p.kind = 'pre-appraisal' AND ${PERIOD("p.created_at")}`,
  },
  {
    key: "valuations-sent", section: "appraisals", label: "Valuations sent", headline: true,
    source: "Post-appraisal decks sent to the landlord with the valuation (os_presentations)",
    sql: `SELECT p.created_at AS at, p.author_id AS who,
                 COALESCE(NULLIF(a.landlord, ''), 'A landlord') || COALESCE(', ' || a.address, '') || CASE WHEN p.first_opened_at IS NOT NULL THEN ' - opened' ELSE ' - not opened yet' END AS title,
                 '/market-appraisals/lead-' || p.ref AS href, NULL::text AS email, a.address, ARRAY[p.ref, 'lead-' || p.ref] AS ids, FALSE AS test
            FROM os_presentations p LEFT JOIN os_market_appraisals a ON a.id = 'lead-' || p.ref
           WHERE p.kind = 'post-appraisal' AND ${PERIOD("p.created_at")}`,
  },
  {
    key: "decks-presented", section: "appraisals", label: "Appraisal decks presented",
    source: "The deck made for the visit itself (os_presentations)",
    sql: `SELECT p.created_at AS at, p.author_id AS who, COALESCE(NULLIF(a.landlord, ''), 'A landlord') || COALESCE(', ' || a.address, '') AS title,
                 '/market-appraisals/lead-' || p.ref AS href, NULL::text AS email, a.address, ARRAY[p.ref, 'lead-' || p.ref] AS ids, FALSE AS test
            FROM os_presentations p LEFT JOIN os_market_appraisals a ON a.id = 'lead-' || p.ref
           WHERE p.kind = 'appraisal' AND ${PERIOD("p.created_at")}`,
  },
  {
    key: "terms-sent", section: "appraisals", label: "Terms sent to sign",
    source: "Terms of business sent from an appraisal (os_market_appraisals)",
    sql: `SELECT terms_sent_at AS at, agent AS who, COALESCE(NULLIF(landlord, ''), 'A landlord') || ', ' || address AS title,
                 '/market-appraisals/' || id AS href, NULL::text AS email, address, ARRAY[id, lead_id] AS ids, FALSE AS test
            FROM os_market_appraisals WHERE ${PERIOD("terms_sent_at")}`,
  },
  {
    key: "terms-signed", section: "appraisals", label: "Terms signed by landlords",
    source: "Contracts signed in DocuSeal and stored (os_signed_documents)",
    sql: `SELECT s.completed_at AS at, a.agent AS who, COALESCE(NULLIF(s.signer_name, ''), 'A landlord') || ' - ' || s.template_name AS title,
                 '/market-appraisals/' || s.appraisal_id AS href, s.signer_email AS email, a.address, ARRAY[s.appraisal_id] AS ids, FALSE AS test
            FROM os_signed_documents s LEFT JOIN os_market_appraisals a ON a.id = s.appraisal_id WHERE ${PERIOD("s.completed_at")}`,
  },
  {
    key: "videos", section: "appraisals", label: "Personal videos recorded",
    source: READ_LOG, since: READ_LOG_SINCE,
    sql: calls("^/api/video$", "'A video for a landlord'"),
  },

  /* ── Listings ──────────────────────────────────────────────────────── */
  {
    key: "listings-published", section: "listings", label: "Listings published", headline: true,
    source: "Listings put live from the OS (audit trail)",
    sql: `SELECT at, actor_id AS who, 'Listing ' || split_part(detail, ':', 1) AS title,
                 '/listings/' || split_part(detail, ':', 1) AS href, NULL::text AS email, NULL::text AS address, ARRAY[split_part(detail, ':', 1)] AS ids, FALSE AS test
            FROM os_audit WHERE kind = 'listing_publication' AND detail LIKE '%-> published%' AND ${PERIOD("at")}`,
  },
  {
    key: "listings-edited", section: "listings", label: "Listing edits saved",
    source: "Each save of a listing's advert, photos or rooms (audit trail)",
    sql: `SELECT at, actor_id AS who, 'Listing ' || split_part(detail, ':', 1) || ' - ' || left(split_part(detail, ':', 2), 90) AS title,
                 '/listings/' || split_part(detail, ':', 1) AS href, NULL::text AS email, NULL::text AS address, ARRAY[split_part(detail, ':', 1)] AS ids, FALSE AS test
            FROM os_audit WHERE kind = 'listing_edited' AND ${PERIOD("at")}`,
  },
  {
    key: "listings-started", section: "listings", label: "New listings started",
    source: "The new listing screens, started (os_property_drafts)",
    sql: `SELECT created_at AS at, COALESCE(started_by_id, started_by) AS who, 'A new ' || kind || COALESCE(' - ' || NULLIF(data->>'address', ''), '') AS title,
                 NULL::text AS href, NULL::text AS email, data->>'address' AS address, ARRAY[listing_id, property_id] AS ids, FALSE AS test
            FROM os_property_drafts WHERE ${PERIOD("created_at")}`,
  },
  {
    key: "offers-decided", section: "listings", label: "Offers accepted or declined",
    source: "Decisions on an offer, on the listing (os_offer_decisions)",
    sql: `SELECT decided_at AS at, by_email AS who, initcap(decision) || ' - offer ' || ref AS title,
                 '/listings/' || listing_id AS href, NULL::text AS email, NULL::text AS address, ARRAY[listing_id, ref] AS ids, FALSE AS test
            FROM os_offer_decisions WHERE ${PERIOD("decided_at")}`,
  },
  {
    key: "offers-made", section: "listings", label: "Offers made for a tenant",
    source: READ_LOG, since: READ_LOG_SINCE,
    sql: calls("^/api/offers/agent$", "'An offer made on a tenant''s behalf'"),
  },

  /* ── Diary and Viewings ────────────────────────────────────────────── */
  {
    key: "viewings-booked", section: "viewings", label: "Viewings booked",
    source: "Viewings and viewing slots put in the diary from the OS (os_appointments)",
    sql: `SELECT created_at AS at, author_id AS who, title || ' - ' || to_char(starts_at AT TIME ZONE 'Europe/London', 'DD Mon HH24:MI') AS title,
                 CASE WHEN lead_id IS NOT NULL THEN '/leads?open=' || lead_id END AS href, contact_email AS email, where_at AS address, ARRAY[lead_id, id] AS ids, FALSE AS test
            FROM os_appointments WHERE kind IN ('viewing', 'slot') AND ${PERIOD("created_at")}`,
  },
  {
    key: "diary-other", section: "viewings", label: "Other diary entries",
    source: "Inspections, travel and other entries made in the diary (os_appointments)",
    sql: `SELECT created_at AS at, author_id AS who, initcap(kind) || ': ' || title AS title, NULL::text AS href, contact_email AS email,
                 where_at AS address, ARRAY[lead_id, id] AS ids, FALSE AS test
            FROM os_appointments WHERE kind NOT IN ('viewing', 'slot') AND ${PERIOD("created_at")}`,
  },
  {
    key: "confirmations", section: "viewings", label: "Booking confirmations sent",
    source: READ_LOG, since: READ_LOG_SINCE,
    sql: calls("^/api/confirmations$", "'A booking confirmation, drafted or sent'"),
  },
  {
    key: "viewing-texts", section: "viewings", label: "Reminder texts sent", nobody: "Sent automatically", automatic: true,
    source: "Texts sent to tenants an hour before a viewing, by the viewing's agent (os_sms_log)",
    sql: `SELECT sent_at AS at, agent AS who, COALESCE(NULLIF(to_name, ''), 'A tenant') || ' - viewing reminder' AS title, NULL::text AS href,
                 NULL::text AS email, NULL::text AS address, ARRAY[viewing_id] AS ids, FALSE AS test
            FROM os_sms_log WHERE outcome = 'sent' AND ${PERIOD("sent_at")}`,
  },

  /* ── Applications ──────────────────────────────────────────────────── */
  {
    key: "passports-sent", section: "applications", label: "Passports sent",
    source: "Passport invites emailed to tenants (os_tenant_passports)",
    sql: `SELECT invited_at AS at, COALESCE(agent_id, invited_by) AS who, COALESCE(NULLIF(name, ''), email) AS title, NULL::text AS href,
                 email, NULL::text AS address, ARRAY[token, contact_id] AS ids, contact_id = 'demo' AS test
            FROM os_tenant_passports WHERE ${PERIOD("invited_at")}`,
  },
  {
    key: "handovers", section: "applications", label: "Lets handed over to Propoly",
    source: "Deals pushed to Propoly by a person (os_handovers; the automatic shadow scan is left out)",
    sql: `SELECT started_at AS at, triggered_by AS who, 'Application ' || application_id || ' - ' || status AS title,
                 CASE WHEN application_id ~ '^-?[0-9]+$' THEN '/applications/' || application_id END AS href, NULL::text AS email, NULL::text AS address,
                 ARRAY[application_id] AS ids, FALSE AS test
            FROM os_handovers WHERE triggered_by NOT ILIKE '%scan%' AND ${PERIOD("started_at")}`,
  },
  {
    key: "swaps", section: "applications", label: "Tenant swaps",
    source: "Swaps keyed on a let (os_tenant_swaps)",
    sql: `SELECT created_at AS at, by_email AS who, property AS title, '/listings/' || listing_id AS href, NULL::text AS email, property AS address,
                 ARRAY[listing_id, id] AS ids, FALSE AS test
            FROM os_tenant_swaps WHERE cancelled_at IS NULL AND ${PERIOD("created_at")}`,
  },
  {
    key: "customer-updates", section: "applications", label: "Customer updates sent",
    source: "Landlord and tenant updates an agent pushed on a let (os_customer_updates)",
    sql: `SELECT done_at AS at, agent_email AS who, headline || ' - ' || property AS title,
                 CASE WHEN application_id ~ '^-?[0-9]+$' THEN '/applications/' || application_id END AS href, NULL::text AS email, property AS address,
                 ARRAY[application_id, deal_id] AS ids, FALSE AS test
            FROM os_customer_updates WHERE ${PERIOD("done_at")}`,
  },

  /* ── Tenant Passport (the funnel is lib/tracking/passport) ─────────── */
  {
    key: "passports-finished", section: "passport", label: "Passports finished",
    source: "Passports a tenant finished, credited to the agent who sent it (os_tenant_passports)",
    sql: `SELECT submitted_at AS at, COALESCE(agent_id, invited_by) AS who, COALESCE(NULLIF(name, ''), email) AS title, NULL::text AS href,
                 email, NULL::text AS address, ARRAY[token, contact_id] AS ids, contact_id = 'demo' AS test
            FROM os_tenant_passports WHERE ${PERIOD("submitted_at")}`,
  },

  /* ── Pre-tenancy ───────────────────────────────────────────────────── */
  {
    key: "plc-packs", section: "pretenancy", label: "PLC packs started",
    source: "Pre-let compliance packs an agent started (os_plc_cases)",
    sql: `SELECT created_at AS at, agent_email AS who, address AS title, '/pre-tenancy/plc' AS href, NULL::text AS email, address,
                 ARRAY[id, application_ref] AS ids, (application_ref ~ '^-' OR application_ref ILIKE 'TEST-%') AS test
            FROM os_plc_cases WHERE ${PERIOD("created_at")}`,
  },
  {
    key: "plc-decided", section: "pretenancy", label: "PLC packs decided",
    source: "Packs approved or sent back (os_plc_cases)",
    sql: `SELECT decided_at AS at, decided_by AS who, address || ' - ' || state AS title, '/pre-tenancy/plc' AS href, NULL::text AS email, address,
                 ARRAY[id, application_ref] AS ids, (application_ref ~ '^-' OR application_ref ILIKE 'TEST-%') AS test
            FROM os_plc_cases WHERE ${PERIOD("decided_at")}`,
  },

  /* ── Portfolio ─────────────────────────────────────────────────────── */
  {
    key: "inspections", section: "portfolio", label: "Inspections booked",
    source: "Inspections raised on a managed home (os_inspections)",
    sql: `SELECT created_at AS at, raised_by AS who, initcap(kind) || ' - ' || property_name AS title, '/inspections' AS href, tenant_email AS email,
                 property_name AS address, ARRAY[id, listing_id] AS ids, rehearsal AS test
            FROM os_inspections WHERE ${PERIOD("created_at")}`,
  },
  {
    key: "inspections-done", section: "portfolio", label: "Inspections carried out",
    source: "Visits recorded as done (os_inspections)",
    sql: `SELECT visited_at AS at, COALESCE(NULLIF(inspector, ''), raised_by) AS who, property_name AS title, '/inspections' AS href, tenant_email AS email,
                 property_name AS address, ARRAY[id, listing_id] AS ids, rehearsal AS test
            FROM os_inspections WHERE ${PERIOD("visited_at")}`,
  },
  {
    key: "tenancy-reviews", section: "portfolio", label: "Tenancy reviews done",
    source: "Rent reviews finished (os_tenancy_reviews)",
    sql: `SELECT done_at AS at, done_by AS who, property_name || ' - ' || outcome AS title, '/tenancy-reviews' AS href, NULL::text AS email,
                 property_name AS address, ARRAY[id, os_property_id] AS ids, FALSE AS test
            FROM os_tenancy_reviews WHERE ${PERIOD("done_at")}`,
  },
  {
    key: "notices", section: "portfolio", label: "Section 13 and Section 8 notices",
    source: "Rent review and notice files started (os_section_notices)",
    sql: `SELECT created_at AS at, agent_id AS who, CASE WHEN kind = 's8' THEN 'Section 8' ELSE 'Section 13' END || ' - ' || property_label AS title,
                 '/portfolio/' || listing_id AS href, NULL::text AS email, property_label AS address, ARRAY[id, listing_id] AS ids, is_test AS test
            FROM os_section_notices WHERE ${PERIOD("created_at")}`,
  },

  /* ── Maintenance ───────────────────────────────────────────────────── */
  {
    key: "repairs-raised", section: "maintenance", label: "Maintenance issues raised", headline: true,
    source: "Repairs and jobs raised in the OS (os_works_orders)",
    sql: `SELECT created_at AS at, raised_by AS who, title || ' - ' || property_name AS title, '/maintenance' AS href, tenant_email AS email,
                 property_name AS address, ARRAY[id, property_id] AS ids, rehearsal AS test
            FROM os_works_orders WHERE ${PERIOD("created_at")}`,
  },
  {
    key: "repair-updates", section: "maintenance", label: "Job updates",
    source: "Every step recorded on a job (os_works_order_events)",
    sql: `SELECT e.at, e.by_name AS who, COALESCE(o.title, 'A job') || ' - ' || e.kind AS title, '/maintenance' AS href, o.tenant_email AS email,
                 o.property_name AS address, ARRAY[e.order_id] AS ids, COALESCE(o.rehearsal, FALSE) AS test
            FROM os_works_order_events e LEFT JOIN os_works_orders o ON o.id = e.order_id WHERE ${PERIOD("e.at")}`,
  },
  {
    key: "invoices", section: "maintenance", label: "Invoices raised",
    source: "Invoices made in the OS (os_invoices)",
    sql: `SELECT created_at AS at, created_by AS who, number || ' - ' || COALESCE(NULLIF(to_name, ''), property) AS title,
                 '/maintenance/invoices/' || id AS href, to_email AS email, property AS address, ARRAY[id, order_id] AS ids, FALSE AS test
            FROM os_invoices WHERE ${PERIOD("created_at")}`,
  },

  /* ── Compliance ────────────────────────────────────────────────────── */
  {
    key: "certs-uploaded", section: "compliance", label: "Certificates uploaded",
    source: "Certificates people added (os_certificates; bulk imports from Propoly, REX PM and the EPC register left out)",
    sql: `SELECT added_at AS at, added_by AS who, upper(type_id) || ' - ' || COALESCE(NULLIF(property_name, ''), 'a home') AS title, '/compliance' AS href,
                 NULL::text AS email, property_name AS address, ARRAY[id, property_id] AS ids, FALSE AS test
            FROM os_certificates WHERE source !~* '(download|pulled|register|import|sync)' AND ${PERIOD("added_at")}`,
  },
  {
    key: "certs-checked", section: "compliance", label: "Certificates checked",
    source: "Michael's and the office's verify decisions (os_compliance_checks)",
    sql: `SELECT at, by_name AS who, kind || ' - ' || state AS title, '/compliance-desk/verify' AS href, NULL::text AS email, NULL::text AS address,
                 ARRAY[subject_id] AS ids, FALSE AS test
            FROM os_compliance_checks WHERE ${PERIOD("at")}`,
  },
  {
    key: "engineers-confirmed", section: "compliance", label: "Engineer numbers confirmed",
    source: "Gas Safe, NICEIC and NAPIT numbers checked on the register (os_cert_register)",
    sql: `SELECT confirmed_at AS at, confirmed_by AS who, scheme || ' ' || confirmed_number || COALESCE(' - ' || NULLIF(engineer, ''), '') AS title,
                 '/compliance-desk/verify' AS href, NULL::text AS email, NULL::text AS address, ARRAY[subject_id] AS ids, FALSE AS test
            FROM os_cert_register WHERE ${PERIOD("confirmed_at")}`,
  },
  {
    key: "certs-shared", section: "compliance", label: "Certificates sent to customers", nobody: "Sent automatically", automatic: true,
    source: "Certificates emailed to landlords and tenants (os_certificate_sends)",
    sql: `SELECT at, NULL::text AS who, upper(type_id) || ' to ' || role || ' - ' || address AS title, '/compliance' AS href, NULL::text AS email, address,
                 ARRAY[certificate_id, property_id] AS ids, FALSE AS test
            FROM os_certificate_sends WHERE sent AND ${PERIOD("at")}`,
  },

  /* ── Huddles ───────────────────────────────────────────────────────── */
  {
    key: "huddle-messages", section: "huddles", label: "Messages posted",
    source: "Messages in the team's huddles (os_team_messages; what was said is not shown)",
    sql: `SELECT m.created_at AS at, m.author_id AS who, 'In ' || COALESCE(NULLIF(r.name, ''), initcap(r.kind)) AS title, '/huddles' AS href,
                 NULL::text AS email, NULL::text AS address, ARRAY[m.room_id] AS ids, FALSE AS test
            FROM os_team_messages m LEFT JOIN os_team_rooms r ON r.id = m.room_id WHERE ${PERIOD("m.created_at")}`,
  },
  {
    key: "huddles-started", section: "huddles", label: "Huddles started",
    source: "New huddles (os_team_rooms)",
    sql: `SELECT created_at AS at, created_by AS who, COALESCE(NULLIF(name, ''), initcap(kind)) AS title, '/huddles' AS href,
                 NULL::text AS email, NULL::text AS address, ARRAY[id] AS ids, FALSE AS test
            FROM os_team_rooms WHERE ${PERIOD("created_at")}`,
  },

  /* ── Steve ─────────────────────────────────────────────────────────── */
  {
    key: "steve-questions", section: "steve", label: "Questions asked",
    source: "What people asked Steve (os_assistant_log)",
    sql: `SELECT created_at AS at, user_id AS who, left(text, 140) AS title, NULL::text AS href, NULL::text AS email, NULL::text AS address,
                 ARRAY[thread] AS ids, FALSE AS test
            FROM os_assistant_log WHERE role = 'agent' AND kind = 'ask' AND ${PERIOD("created_at")}`,
  },
  {
    key: "briefings", section: "steve", label: "Morning briefings given", automatic: true,
    source: "Steve's briefing, given on somebody's first visit of the day (read log)", since: READ_LOG_SINCE,
    sql: calls("^/api/assistant/brief$", "'The morning briefing'"),
  },
  {
    key: "reports", section: "steve", label: "Problems and ideas reported",
    source: "Reports sent through Steve (os_bugs; ones the OS logged itself left out)",
    sql: `SELECT created_at AS at, reporter_id AS who, initcap(kind) || ': ' || left(body, 120) AS title, '/admin/tickets?open=' || id AS href,
                 NULL::text AS email, NULL::text AS address, ARRAY[id] AS ids, FALSE AS test
            FROM os_bugs WHERE kind <> 'auto' AND ${PERIOD("created_at")}`,
  },

  /* ── Landlord Portal ───────────────────────────────────────────────── */
  {
    key: "landlord-decks-opened", section: "landlord", label: "Decks opened by landlords",
    source: "The first time a landlord opened a deck, credited to the agent who sent it (os_presentations)",
    sql: `SELECT p.first_opened_at AS at, p.author_id AS who,
                 initcap(replace(p.kind, '-', ' ')) || ' - ' || COALESCE(NULLIF(a.landlord, ''), 'a landlord') || ' (' || p.opens || ' open' || CASE WHEN p.opens = 1 THEN '' ELSE 's' END || ')' AS title,
                 '/market-appraisals/lead-' || p.ref AS href, NULL::text AS email, a.address, ARRAY[p.ref, 'lead-' || p.ref] AS ids, FALSE AS test
            FROM os_presentations p LEFT JOIN os_market_appraisals a ON a.id = 'lead-' || p.ref WHERE ${PERIOD("p.first_opened_at")}`,
  },
  {
    key: "landlords-joined", section: "landlord", label: "Landlords signed in for the first time", nobody: "The landlord",
    source: "Landlord portal accounts made live (os_portal_accounts)",
    sql: `SELECT activated_at AS at, NULL::text AS who, COALESCE(NULLIF(name, ''), email) AS title, NULL::text AS href, email, NULL::text AS address,
                 ARRAY[id, rex_contact_id] AS ids, FALSE AS test
            FROM os_portal_accounts WHERE kind = 'landlord' AND ${PERIOD("activated_at")}`,
  },
  {
    key: "landlord-messages", section: "landlord", label: "Messages from landlords",
    source: "Landlords writing through their portal, credited to the appraisal's agent (os_landlord_messages)",
    sql: `SELECT m.sent_at AS at, a.agent AS who, COALESCE(NULLIF(a.landlord, ''), 'A landlord') || COALESCE(', ' || a.address, '') AS title,
                 '/market-appraisals/' || m.appraisal_id AS href, NULL::text AS email, a.address, ARRAY[m.appraisal_id] AS ids, FALSE AS test
            FROM os_landlord_messages m LEFT JOIN os_market_appraisals a ON a.id = m.appraisal_id
           WHERE m.direction = 'landlord' AND ${PERIOD("m.sent_at")}`,
  },
  {
    key: "landlord-replies", section: "landlord", label: "Replies to landlords",
    source: "Agents answering a landlord's message (os_landlord_messages)",
    sql: `SELECT m.sent_at AS at, a.agent AS who, COALESCE(NULLIF(a.landlord, ''), 'A landlord') || COALESCE(', ' || a.address, '') AS title,
                 '/market-appraisals/' || m.appraisal_id AS href, NULL::text AS email, a.address, ARRAY[m.appraisal_id] AS ids, FALSE AS test
            FROM os_landlord_messages m LEFT JOIN os_market_appraisals a ON a.id = m.appraisal_id
           WHERE m.direction = 'agent' AND ${PERIOD("m.sent_at")}`,
  },
  {
    key: "landlord-documents", section: "landlord", label: "Documents landlords uploaded", nobody: "The landlord",
    source: "Files a landlord added in their portal (os_landlord_documents)",
    sql: `SELECT uploaded_at AS at, NULL::text AS who, kind || ' - ' || name AS title, CASE WHEN appraisal_id IS NOT NULL THEN '/market-appraisals/' || appraisal_id END AS href,
                 NULL::text AS email, NULL::text AS address, ARRAY[appraisal_id, account_id] AS ids, FALSE AS test
            FROM os_landlord_documents WHERE ${PERIOD("uploaded_at")}`,
  },

  /* ── Tenant Portal ─────────────────────────────────────────────────── */
  {
    key: "tenants-joined", section: "tenant", label: "Tenants signed in for the first time", nobody: "The tenant",
    source: "Tenant portal accounts made live, mostly at the end of a passport (os_portal_accounts)",
    sql: `SELECT activated_at AS at, NULL::text AS who, COALESCE(NULLIF(name, ''), email) AS title, NULL::text AS href, email, NULL::text AS address,
                 ARRAY[id] AS ids, FALSE AS test
            FROM os_portal_accounts WHERE kind = 'tenant' AND ${PERIOD("activated_at")}`,
  },
  {
    key: "tenant-enquiries", section: "tenant", label: "Enquiries from Find a home",
    source: "Tenants enquiring on a home from their portal, credited to the agent it went to (os_tenant_enquiries)",
    sql: `SELECT created_at AS at, sent_to AS who, COALESCE(NULLIF(name, ''), email) || ' - ' || address AS title, '/listings/' || listing_id AS href,
                 email, address, ARRAY[listing_id, contact_id] AS ids, FALSE AS test
            FROM os_tenant_enquiries WHERE ${PERIOD("created_at")}`,
  },
  {
    key: "tenant-messages", section: "tenant", label: "Messages with tenants",
    source: "Messages either way in the tenant portal, credited to the agent (os_tenant_messages; what was said is not shown)",
    sql: `SELECT sent_at AS at, COALESCE(author_id, agent_email) AS who, CASE WHEN direction = 'tenant' THEN 'From the tenant' ELSE 'To the tenant' END AS title,
                 NULL::text AS href, NULL::text AS email, NULL::text AS address, ARRAY[account_id] AS ids, FALSE AS test
            FROM os_tenant_messages WHERE ${PERIOD("sent_at")}`,
  },
  {
    key: "tenant-documents", section: "tenant", label: "Documents tenants uploaded", nobody: "The tenant",
    source: "Files a tenant added in their portal (os_tenant_documents)",
    sql: `SELECT uploaded_at AS at, NULL::text AS who, kind || ' - ' || name AS title, NULL::text AS href, NULL::text AS email, NULL::text AS address,
                 ARRAY[deal_id, account_id] AS ids, FALSE AS test
            FROM os_tenant_documents WHERE ${PERIOD("uploaded_at")}`,
  },

  /* ── Emails and Events ─────────────────────────────────────────────── */
  {
    key: "newsletters", section: "marketing", label: "Newsletters and event emails sent",
    source: "Newsletters published from Emails and events (os_newsletters)",
    sql: `SELECT n.published_at AS at, n.published_by AS who,
                 n.name || ' - ' || (SELECT count(*) FROM os_newsletter_sends s WHERE s.newsletter_id = n.id) || ' recipients' AS title,
                 '/marketing-hub/emails/' || n.id AS href, NULL::text AS email, NULL::text AS address, ARRAY[n.id] AS ids, FALSE AS test
            FROM os_newsletters n WHERE ${PERIOD("n.published_at")}`,
  },

  /* ── Search ────────────────────────────────────────────────────────── */
  {
    key: "searches", section: "search", label: "Searches",
    source: "Searches made, at most one a minute per person (read log)", since: READ_LOG_SINCE,
    /* One a minute at most: the search box asks again as somebody types. */
    sql: `SELECT DISTINCT ON (user_id, date_trunc('minute', at)) at, user_id AS who,
                 COALESCE(NULLIF(substring(query FROM 'q=([^&]*)'), ''), 'A search') AS title, NULL::text AS href,
                 NULL::text AS email, NULL::text AS address, ARRAY[]::text[] AS ids, FALSE AS test
            FROM os_read_log WHERE ${PERIOD("at")} AND viewing_as IS NULL AND path LIKE '/api/search%'
           ORDER BY user_id, date_trunc('minute', at), at DESC`,
  },
];

export const METRICS_BY_SECTION = (key: SectionKey) => METRICS.filter((m) => m.section === key);
