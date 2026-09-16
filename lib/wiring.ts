/**
 * The wiring sheet — the honest ledger of what the OS can and cannot do
 * against the real systems, kept as data so updating it is editing one list.
 *
 * Organised PER SYSTEM: each system gets its own section on the sheet, its
 * own live health check, and its own rows — wired up (or not) individually.
 *
 * States:
 *   live    — working in this build, on real credentials
 *   proven  — capability confirmed against the live API (read-only probes);
 *             the OS just hasn't wired a screen to it yet
 *   untested— the method exists and is exposed to our session, but no write
 *             has ever been performed — needs one careful supervised test
 *   blocked — confirmed not possible on current access; the note says who
 *             can unblock it
 *   manual  — stays human for now, by design
 */

export type WiringState = "live" | "proven" | "untested" | "blocked" | "manual";

export type SystemKey = "rex" | "propoly" | "payprop" | "storage" | "sends" | "foundations";

export interface WiringRow {
  system: SystemKey;
  area: string;
  item: string;
  state: WiringState;
  note: string;
}

export const WIRING_STATES: Record<WiringState, { label: string; tone: string }> = {
  live: { label: "Working now", tone: "#4c9a6e" },
  proven: { label: "Confirmed — not wired yet", tone: "#7a9a4c" },
  untested: { label: "Exists — needs one careful test", tone: "#c9a24c" },
  blocked: { label: "Blocked", tone: "#c05f5f" },
  manual: { label: "Stays manual for now", tone: "#8a867f" },
};

/** The systems, in sheet order. `endpoint` is the live health check the sheet
 *  calls for that system; null means there's nothing to probe (yet). */
export const SYSTEMS: {
  key: SystemKey;
  label: string;
  blurb: string;
  endpoint: string | null;
}[] = [
  {
    key: "rex",
    label: "REX",
    blurb: "The CRM — listings, leads, compliance records, diary.",
    endpoint: "/api/rex/wiring",
  },
  {
    /* Absent from this sheet until 30 Aug 2026, which is the strangest gap in
       it: Propoly is the declared source of truth for deals and it generates
       the contracts. The sheet listed the CRM and the money and left out the
       system both of them describe. */
    key: "propoly",
    label: "Propoly",
    blurb:
      "The source of truth — deals, tenancy progression, the contracts themselves. Read-only for us today; the sheet shows what its own API document says we could write.",
    endpoint: "/api/propoly/wiring",
  },
  {
    key: "payprop",
    label: "PayProp",
    blurb: "The money — rent, fees, arrears. Two agencies: Scotland and the rest of the UK, blind to each other.",
    endpoint: "/api/payprop/wiring",
  },
  {
    key: "storage",
    label: "Storage (R2)",
    blurb: "Our own vault for certificates, documents and photos.",
    endpoint: "/api/r2/health",
  },
  {
    key: "sends",
    label: "Email & WhatsApp",
    blurb: "Getting messages out of the building.",
    endpoint: null,
  },
  {
    key: "foundations",
    label: "Foundations",
    blurb: "Sign-in, database, the customer portals.",
    endpoint: "/api/db/health",
  },
];

export const WIRING: WiringRow[] = [
  // ═══ REX ═══
  {
    system: "rex",
    area: "The safety catch",
    item: "🔓 Eleven REX writes are open, named one at a time. Everything else is still refused",
    state: "live",
    note: "Locked 9 Aug at James's instruction, and enforced rather than promised: every REX call goes through one function, and that function will only carry a method it recognises as read-only. It's an allowlist, so anything new or unrecognised is refused by default — a button wired up by mistake cannot reach a real record. Verified against 36 of REX's actual write methods (publish, create, update, upload, archive, purge, toggle, send…): all refused; 11 reads still pass. The catch has since been lifted for eleven named calls, each after a supervised test (checked 16 Sep 2026): Listings/update, Properties/update, Contacts/create, Contacts/update, ComplianceEntries/create, ComplianceEntries/update, Upload/uploadFileFromUrl, ListingPublication/publish, ListingPublication/setActivePublicationChannels, CalendarEvents/create and CalendarEvents/update. Every other write is still refused by the same allowlist. Opening another means naming that exact method in REX_ALLOW_WRITES; there is deliberately no blanket 'on', and clearing the variable re-locks everything.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Read the whole rental book (275 current rentals, photos included)",
    state: "live",
    note: "Done 9 Aug — the listings page is real, 275 of them on 16 Sep 2026 with live photos, rents, EPC dates and availability. Days on market is genuine for the 105 published and honestly blank for the 170 drafts, which have never been on a portal. 23 listings quote rent WEEKLY and are labelled as such; a third of the book has no rent set at all and says so.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Edit a live advert and have it reach Rightmove, Zoopla and OnTheMarket",
    state: "live",
    note: "Proven end to end on 29 Aug 2026, on a real property (Flat 1, 4 Hermosa Road) with James watching. Editing the write-up in Marketing and pressing Save writes to REX, REX queues its own portal upload within seconds, the job completes in about 4 seconds across all three portals, and the change is visible on Rightmove in ABOUT FIVE MINUTES. Budget 5-10 minutes when telling anyone. Nothing else is needed after Save — no separate publish step, no chasing.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Publish a DRAFT listing to the portals for the first time",
    state: "live",
    note: "DONE 15 Sep 2026, supervised: James pushed Rhiannon's relet at 4 Williams Court, Cullompton live from the listing record, and it was feeding Rightmove, Zoopla and OnTheMarket inside two minutes with its key features, floor plan and EPC. ListingPublication/publish does it; taking it off again drops the outward channels with setActivePublicationChannels, because REX has no way back to draft. The button has its own switch under Listings on Admin → Switches, and the OS refuses to publish until the Marketing tab is complete — its own required fields first, then REX's own pre-publish and portal-feed checks.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Pre-publish checks (what's missing before it can go live)",
    state: "proven",
    note: "ListingPublication/getErrorsPreventingPublication returns the exact blockers per listing — this becomes the OS's 'ready to publish?' checklist for free.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Create contacts in REX from the OS",
    state: "live",
    note: "Built 30 Aug. A contact saved in the New Lead panel is written to the OS first and REX second, and the two are reported separately — so a locked write can never lose somebody's typing. The REX half needs THREE things at once: Contacts/create named in REX_ALLOW_WRITES, the Create contacts in REX switch armed on Admin -> Switches, and the person to have linked their own REX account on Profile. There is no fallback to the office login: a contact created under the shared account would put the wrong name in REX's audit trail forever. Every contact made this way is tagged 'Added in TLE OS', so one search finds all of them if a batch ever needs undoing. LIVE: four contacts created in REX this way (last 13 Sep 2026) and eighteen edits written back, all recorded in the audit log.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Create a listing from the OS",
    state: "live",
    note: "DONE 16 Sep 2026: + Add new listing makes the listing here rather than opening REX. James created listing 843342 on 4 Williams Court - address picked from the ones already on file, Apartment, £900, available 2 Nov, Managed, Long term - and every field matched a listing made in REX: right office, right category, right type, created by and filed under him rather than the office. It arrives as a draft with nothing published. The first one went in with no deposit (the five weeks was only a hint), which is now filled in for them.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Create a PROPERTY - a brand new address - from the OS",
    state: "untested",
    note: "The other half, and still closed: lib/rex-properties has the payload copied off a real record, but Properties/create is not on the write allowlist and the Create properties switch is off. Adding a listing at an address REX already holds does not need it; a genuinely new build does. Open it for one supervised test on a clearly-marked address when a new-build actually turns up.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Who the edit is recorded as",
    state: "proven",
    note: "The save carries the editing person's own REX token, falling back to the office service account when there isn't one — four people have linked their REX account so far. Proven 15 Sep: James's save stamped the PROPERTY as James Rowe, and the publish before it recorded him as the publisher. The LISTING shows 'System User' a second or two later ON A PUBLISHED ONE, because REX's own portal-upload job re-saves it after any change and takes the name with it; that is REX's stamp, not our fallback. A draft keeps the person's name: listing 843342, created and edited in the OS on 16 Sep, reads as James Rowe throughout. The OS keeps its own log of who changed what either way.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Upload photos and floorplans into REX",
    state: "live",
    note: "DONE 16 Sep 2026, both of them, on listing 843342: Add photos and Add floor plan put the file in our own storage, hand REX a signed link with Upload/uploadFileFromUrl, and the returned file joins the listing's images or floor plans. The photo became the main image and the floor plan the floor plan, and REX's own pre-publish check went quiet afterwards. Limits are 50 photos and 5 floor plans on a listing.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Most of the current rental book is unpublished drafts",
    state: "manual",
    note: "170 of 275 current rentals sit in draft, invisible on every portal (measured 16 Sep 2026). The OS now files the ones older than two months into Listings > Archived rather than showing them as live work - see lib/listing-archive.ts. Publishing them is still a business decision, not a technical one.",
  },
  {
    system: "rex",
    area: "Leads",
    item: "Rightmove / Zoopla / OnTheMarket enquiries arriving in REX",
    state: "live",
    note: "87,000+ leads on record, newest minutes old. Each carries the applicant's name, email, phone, message, and the listing it's about. The portal sources are set to auto-process.",
  },
  {
    system: "rex",
    area: "Leads",
    item: "Pull those leads into the OS leads page",
    state: "live",
    note: "Done 9 Aug — the leads page is real. It walks the 500 newest enquiries, keeps the lettings ones (237 at last refresh) and sets aside the sales book, saying on screen how many and why. Cached so it opens instantly. Names, numbers, the property they asked about, its photo, the agent it's assigned to, and their own message — all live.",
  },
  {
    system: "rex",
    area: "Leads",
    item: "Real-time push — a lead lands in REX, the OS hears instantly",
    state: "proven",
    note: "AdminWebhooks supports leads.created (73 events incl. listings.updated, tenancy_applications.created). One webhook already exists on the account (a 2022 Zapier one), so the mechanism is in use. Needs: an OS endpoint + creating the webhook (a write).",
  },
  {
    system: "rex",
    area: "Leads",
    item: "Work a lead from the OS (assign, complete, archive, mark spam)",
    state: "untested",
    note: "Leads exposes update, toggleCompletionState, archive, toggleSpamMarker to our session. Exists, never executed.",
  },
  {
    system: "rex",
    area: "Compliance",
    item: "Read certificates out of REX (EICR, gas, EPC, HMO licences)",
    state: "live",
    note: "Done 9 Aug — the compliance page is real: 527 certificate records across 294 homes, 212 with the document itself attached, all eight certificate types mapped. Certificates hang off the PROPERTY, not the listing — querying by listing id returns almost nothing and looks like a compliant book. The page states what it doesn't know: 257 homes with no record, and 236 with no gas record, which is unknown rather than exempt.",
  },
  {
    system: "rex",
    area: "Compliance",
    item: "Write certificates back into REX compliance entries",
    state: "live",
    note: "Live since 5 Sep 2026 and used in anger: 2,433 certificates filed by the OS, 1,962 of them written into REX as compliance entries with the document attached (the backlog run of 6 Sep). Learned the hard way — the file must go inside the type's own details block, a top-level file_uri is silently ignored, and an update will not attach a file to an entry that already exists. Gated by the Certificates into REX switch as well as the allowlist.",
  },
  {
    system: "rex",
    area: "Compliance",
    item: "E-signatures (tenancy agreements) fired from the OS",
    state: "untested",
    note: "REX's esign-requests/create is exposed but is NOT on the allowlist, so nothing can fire it. It has also been overtaken: landlord contracts are signed through DocuSeal instead (production template, webhook proven), and the tenancy agreement itself is still Propoly's. Leave this closed unless REX's own e-sign is wanted for something DocuSeal cannot do.",
  },
  {
    system: "rex",
    area: "Diary & viewings",
    item: "The OS diary reading real REX calendars",
    state: "live",
    note: "Done 9 Aug — 323 real appointments across 13 lettings agents, five weeks either side of today, feeding the viewings page, the week grid, the calendar and the dashboard. Filtered to OUR calendars (the account holds six businesses'; the sales side outnumbers lettings five to one). Private entries show as Busy with no detail. Where REX can't tell us something — whether confirmations went, whether anyone lives there — the screen says Not known rather than guessing.",
  },
  {
    system: "rex",
    area: "Diary & viewings",
    item: "Booking a viewing writing back to REX",
    state: "untested",
    note: "BUILT 15 Sep 2026 and waiting on its first real booking: CalendarEvents/create and /update are on the allowlist and a viewing booked in the OS is written into the agent's REX diary. Three viewings have been booked in the OS so far and none of them carries a REX event id yet, so the write has not actually run. One supervised booking settles it.",
  },

  // ═══ PayProp ═══
  {
    system: "payprop",
    area: "Reading the money",
    item: "Scotland agency — properties, tenants, tenancies, categories",
    state: "live",
    note: "The Scotland API key reads the managed book directly (84 properties, 374 tenants at last census). API keys don't rotate, so the portal and the OS can share this one safely.",
  },
  {
    system: "payprop",
    area: "Reading the money",
    item: "UK agency — the bigger book",
    state: "blocked",
    note: "No UK API key exists — not here, not in the portal. The portal runs this agency on OAuth, which two apps can't share (PayProp mints a new refresh token on every refresh, and the client has one registered redirect URL — the portal's). Unblock: the UK agency admin issues an API key at uk.payprop.com/c/settings/api, then it goes in as PAYPROP_API_KEY_UK. Beware: the last thing in that variable was the PROPOLY key by mistake — PayProp keys are 60-character padded base64, Propoly's is 40 unpadded.",
  },
  {
    system: "payprop",
    area: "Reading the money",
    item: "Fees & arrears widgets on real figures",
    state: "proven",
    note: "The portal computes fee generation and arrears from all-payments and tenant balances today. Once a key is on this environment the Finances board swaps from sample to real.",
  },
  {
    system: "payprop",
    area: "Deeper reports",
    item: "Damage deposits, unreconciled money, account statements",
    state: "blocked",
    note: "Lives in PayProp v2.0, which API keys cannot reach at all (OAuth-only) — and report/damage-deposits is 403 on both existing keys. The ask sits with PayProp support: v2 OAuth credentials + the missing scopes.",
  },
  {
    system: "payprop",
    area: "Deeper reports",
    item: "Webhooks (PayProp pushing events to us)",
    state: "blocked",
    note: "PayProp webhooks post to ONE URL per agency — if it's pointed at the OS, nothing else gets them. Fine once the OS is the receiving end; needs deciding, then PayProp support sets it.",
  },

  // ═══ Storage ═══
  {
    system: "storage",
    area: "The vault",
    item: "Certificate & document vault in our own storage",
    state: "live",
    note: "Attach-certificate on the compliance drawer and the landlord portal's proof-of-ownership upload both store for real; files come back on 5-minute signed links. EU-hosted bucket.",
  },
  {
    system: "storage",
    area: "The vault",
    item: "Uploaded files persisting across refresh",
    state: "live",
    note: "Fixed 9 Aug: /api/r2/list asks the vault what's filed against one record, and the compliance drawer loads it on open. Scoped to a single record's prefix — a route that can enumerate the whole bucket is one that leaks the filing cabinet.",
  },

  // ═══ Email & WhatsApp ═══
  {
    system: "sends",
    area: "Getting messages out",
    item: "Sending real email — through REX itself",
    state: "untested",
    note: "The account already has a working sender ('Default Email Provider for Rex'), so no SMTP account, no Resend bill, no new sending domain — and every send lands on the contact's REX timeline, which a separate mailer never would. The PAYLOAD is now proven rather than assumed: MailMerge has no subject, body or recipients field; recipients are merge_objects of record ids and free text goes in per-object custom as { subject, body }, sent via queueMergeUsingObjects. Confirmed 29 Aug by rendering a real merge against a real landlord with getMergedStringSet, which is read-only and needs no unlock. Until 29 Aug all four send call sites in the OS passed a shape REX does not have; none had ever run, so none had ever failed. Still needs one supervised send to a colleague, and REX_ALLOW_WRITES=\"MailMerge/queueMergeUsingObjects\".",
  },
  {
    system: "sends",
    area: "Getting messages out",
    item: "Email to a landlord, from the agent's own Microsoft mailbox",
    state: "untested",
    note: "Decided 30 Aug, and it overrides the row above for anything landlord-facing. REX sends WITH an agent's address on it but never THROUGH their mailbox: the sent copy is not in their Sent Items, so the landlord's reply has nothing to thread onto and half the conversation ends up in each system. Microsoft Graph sends from the mailbox itself, and the message is BCC'd to that agent's own REX email dropbox (3517.<rexUserId>@emaildrop.uk.rexsoftware.com, asked for rather than constructed) so the timeline is kept. Ported from the working integration in TEG-Paid-Ads-platform — same Azure app, same tenant, delegated only, with Mail.Read added so the thread can be read back. Two mailboxes are connected so far (James, 10 Sep; Michael, 15 Sep) and a lead now shows that person's own emails read back from Outlook; a viewing email sent from the agent's mailbox is built and still to be seen landing in a real Sent Items. Needs the TLE OS redirect URI and Mail.Read adding to that app registration, then each person connects their own mailbox from Admin → Pre-launch → Emails. Nothing sends as somebody who has not connected.",
  },
  {
    system: "sends",
    area: "Getting messages out",
    item: "Previewing an email exactly as REX will send it",
    state: "live",
    note: "MailMerge/getMergedStringSet renders a merge without sending it — real contact, real property, merge tags resolved — and because its name begins with 'get' it passes the read-only allowlist untouched. So a full preview costs nothing and needs no permission. Steve refuses to send anything whose merge tags came back empty, which is how 'Dear ,' reaches a landlord.",
  },
  {
    system: "sends",
    area: "Getting messages out",
    item: "Text messages (SMS)",
    state: "untested",
    note: "Also already configured: the account's SMS provider is live ('SMS Expert'), with per-user choice enabled. Texting an applicant a viewing confirmation is available today — same rule, one supervised test first.",
  },
  {
    system: "sends",
    area: "Getting messages out",
    item: "Sending real WhatsApp",
    state: "blocked",
    note: "REX has the plumbing (ThirdPartyServiceWhatsApp + WhatsAppMessages) but it is NOT connected — no message has ever passed through it. Connecting needs Meta's embedded signup against a WhatsApp Business number, which is a business action, not a code one: REX gives us the signup URL to walk through.",
  },
  {
    system: "sends",
    area: "Getting messages out",
    item: "Reading the team's mailboxes (IMAP)",
    state: "proven",
    note: "The portal already does this per person — each agent adds their own address and an app password, and their mail appears against the record. Portable to the OS whenever it earns its place; needs no purchase, just each agent's app password.",
  },

  // ═══ Foundations ═══
  {
    system: "foundations",
    area: "The ground floor",
    item: "Real sign-in (per-person accounts) and a database",
    state: "live",
    note: "Both done 9 Aug. Postgres is up and the schema builds itself; sign-in runs on it at Your account — scrypt passwords, signed 30-day sessions, first person becomes owner and further accounts are created from inside. It sits ALONGSIDE the office access code rather than replacing it, so a bad deploy can never lock the team out of their own product. Still to come: moving notes, layouts and profiles off the browser onto the account that now owns them.",
  },
  {
    system: "foundations",
    area: "The ground floor",
    item: "⚠️ The OS shares the portal's live database",
    state: "manual",
    note: "The DATABASE_URL points at the TLE portal's production database — all fifteen of its tables are there, including real staff accounts, PayProp OAuth tokens and deal data. Nothing has been harmed: every OS table is os_-prefixed and additive. The OS now REFUSES at the query layer to write to any table it doesn't own, so a bug here can't cost the portal data. Worth a decision though: share deliberately (it's the clean route to the UK PayProp token) or split the OS onto its own database.",
  },
  {
    system: "foundations",
    area: "The ground floor",
    item: "Tenant & landlord portals on real customer accounts",
    state: "blocked",
    note: "Both portals are built and walk-through-able, but run on demo people until sign-in + database exist.",
  },
];
