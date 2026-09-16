# Where the OS's data has a second copy

Tracker n04, written 16 Sep 2026. **What happens to a piece of data if our own Postgres is lost.**

James, 13 Sep: the OS owns the data, and REX becomes the mirror and the fallback. That only
holds for data REX actually receives. This is the list of what does, what could, and what never
can - so the backup is known to be the only copy of the last group, and nobody assumes REX has
something it was never sent.

Measured by reading every write in `lib/` and `app/api/` and checking it against the production
REX write allow-list, 16 Sep 2026. Re-measure before launch; the code moves daily.

---

## 1. The headline

- **Most of what the OS holds exists only in our Postgres.** About 150 tables are written; a
  dozen code paths also send something to REX, and two send to Propoly.
- **That is expected, not a fault.** Works orders, inspections, invoices, portal accounts,
  passports, the PLC decisions, campaigns and Bond are the OS's own product. REX has nowhere to
  put them.
- **So the backup is the second copy for all of it.** Railway snapshots daily, weekly and monthly,
  plus a nightly `pg_dump` to Cloudflare R2 (EU), restored and counted once on 15 Sep. When the
  database moves (n01, `scripts/db-move/`), **the nightly dump must be pointed at the new
  database the same day**, or the only copy of everything in section 3 stops being backed up
  without anybody noticing.

---

## 2. Data that does reach REX (or Propoly)

These mirror, but only when the method is on `REX_ALLOW_WRITES` in production and, where there
is one, its switch is on. Checked against production on 16 Sep.

| Data | Our table | Goes to REX as | Reaches REX today? |
|---|---|---|---|
| Contacts saved in the OS | `os_contacts` | `Contacts/create`, `Contacts/update` | **Yes** - both allowed, switch on |
| Certificates filed outside a pack | `os_certificates` | `ComplianceEntries/create`, `update`, `Upload/uploadFileFromUrl` | **Yes** - allowed, switch on |
| An approved PLC pack's certificates | `os_plc_cases` | the same three | **Yes** for the certificates. The checks and the decision do not go - see section 3 |
| Appraisal and viewing bookings | `os_market_appraisals`, `os_case_state` | `CalendarEvents/create`, `update` | **Yes** - the booking slot only |
| Listing marketing, features, material info | `os_listing_marketing` | `Listings/update`, `Properties/update` | **Yes** |
| Photos, floor plans, the write-up | - | `Listings/update`, `Upload/uploadFileFromUrl` | **Yes** |
| New listings | - | `Listings/create` | **Yes** |
| Going live on the portals | - | `ListingPublication/publish`, `setActivePublicationChannels` | **Yes** |
| Signed documents from DocuSeal | `os_signed_documents` | `Upload/uploadFileFromUrl` onto the listing | **Yes** - the PDF |
| The offer-accepted handover | `os_handovers` (the log) | `Listings/update`, `CustomFields/setFieldValues`; Propoly landlord, property, relationship | **Partly** - `CustomFields/setFieldValues` is being added by James; the handover switch is off |

---

## 3. Data that exists only in our Postgres

If the database and every backup were lost, **this is gone**. Grouped by whether REX could ever
hold it.

### REX has a place for it - we just do not send it

Worth deciding, one at a time, whether each should mirror. Each is a small build once decided.

| Data | Our table | Where it could go in REX |
|---|---|---|
| Viewing feedback | `os_viewing_feedback` | REX's Feedback service - we already read from it |
| Calls, emails and touches logged on a lead | `os_lead_touches`, `os_lead_facts` | Notes on the contact |
| Comments on an application | `os_application_comments` | Notes on the application - write-locked today |
| Appointments made in the OS | `os_appointments` | `CalendarEvents/create`, which is already allowed |
| Deal notes and tasks | `deal_notes`, `deal_tasks` | Notes on the listing |

### REX has no place for it - the backup is the only second copy

| Area | Tables |
|---|---|
| Property management | `os_works_orders`, `os_works_order_events`, `os_contractors`, `os_inspections`, `os_inspection_findings`, `os_invoices`; the invoicing and bank details in `os_settings` |
| Customer portals | `os_portal_accounts`, `os_tenant_passports`, `os_landlord_documents`, `os_tenant_documents`, `os_landlord_messages`, `os_landlord_offer_approvals` |
| Compliance | the checks and decisions in `os_plc_cases`, `os_agent_requirements`, `os_agent_compliance` |
| Appraisals | the valuation and outcome in `os_market_appraisals`; property answers and contract-send state in `os_case_state`; `os_presentations` |
| Marketing | `os_campaigns`, `os_campaign_enrolments`, `os_scheduled_sends`, `os_email_templates`, `os_message_templates`, `os_process_maps` |
| Bond | `os_bond_campaigns`, `os_bond_campaign_steps`, `os_bond_campaign_sends`, `os_bond_qr_links`, `os_bond_qr_responses`; the stage, assignee and notes on `os_radar_prospects`, `os_bond_landlords`, `os_bond_nudges` |
| People and settings | `os_users`, `os_invites`, `os_teg_people`, `os_attr_defs`, `os_attr_values`, `os_listing_archive`, `os_news_posts`, `property_notes`, `forecasts`, `actual_overrides`, `assistant_knowledge` |
| History nobody can rebuild | `os_listing_events` (every rent and status change we have seen), `os_deal_events` (every Propoly stage move), `os_leads` for any enquiry REX has since dropped |

### Can be rebuilt, so losing it costs time rather than data

Caches, logs and public feeds: `os_cache`, `os_rex_people`, `os_epc`, `os_sales`,
`os_hmo_licences`, `os_planning_applications`, the `*_sync` tables, `os_listing_capture`,
`os_audit`, `os_page_views`, `os_bugs`, `os_sent_emails`, the testing tables. `os_epc` is 187 MB
of the 282 MB and is a public register we can download again.

---

## 4. Writes the code makes that production refuses today

Found while building this list. Not faults in themselves - each is locked on purpose until
someone arms it - but each is a screen that will say "locked" the first time a pilot agent
reaches it.

| REX method | What asks for it | Also behind a switch |
|---|---|---|
| `Properties/create` | Adding a listing for a property REX does not already hold (`app/api/listings/create`) | `rex_property_create` - off |
| `TenancyApplications/create`, `update` | Starting an application from the OS; linking a tenancy | - |
| `EsignRequests/create` | Sending a contract through REX e-sign | - |
| `SecurityObjectPermissions/grantPermission`, `requestPermission` | Asking for access to a record another agent owns | - |
| `MailMerge/queueMergeUsingObjects` | Nurture campaigns | waits on who nurture comes from |
| `CustomFields/setFieldValues` | The handover's Propoly reference on the listing | `handover_live` - off; James is adding the method |

**The first one matters for the pilot.** A listing for a property REX already holds is created
fine; a brand-new property is refused twice over, by the switch and by the allow-list.

---

## 5. What to do with this

1. **Point the nightly backup at the new database the day it moves.** Everything in section 3
   depends on it. This is in `scripts/db-move/RUNBOOK.md`.
2. **Decide the five "REX has a place for it" rows**, one at a time. Viewing feedback is the
   obvious first: REX already has a Feedback service and the team used to read it there.
3. **Arm `Properties/create`** (and its switch) before an agent adds a listing for a property REX
   has never seen, or tell the listings chat it stays locked for the pilot.
4. **Re-measure this before launch.** The inventory is a snapshot of 16 Sep.
