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

export type SystemKey = "rex" | "payprop" | "storage" | "sends" | "foundations";

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
    area: "Listings & publishing",
    item: "Read the whole rental book (294 current rentals, photos included)",
    state: "live",
    note: "Done 9 Aug — the listings page is real, all 294 of them with live photos, rents, EPC dates and availability. Days on market is genuine for the 128 published and honestly blank for the 166 drafts, which have never been on a portal. 23 listings quote rent WEEKLY and are labelled as such; a third of the book has no rent set at all and says so.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Publish a listing to Rightmove / Zoopla / OnTheMarket",
    state: "untested",
    note: "The full pipeline exists and is exposed to us: ListingPublication/publish, setActivePublicationChannels, ListingPortalUploads/queue. Rightmove, Zoopla and OnTheMarket are active portal profiles on the account, and current listings are feeding live (checked against a real Rightmove link). No write has ever been fired — first publish should be a supervised test on a throwaway draft.",
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
    item: "Create / edit listings and properties from the OS",
    state: "untested",
    note: "listings and properties both expose create + update to our session (settled 3 Aug via describe). Same rule: exists, never executed.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "Upload photos and floorplans into REX",
    state: "untested",
    note: "The undocumented Upload service (uploadListingImage, uploadFileFromUrl, 16 methods) is exposed to us. This is also the R2→REX photo route.",
  },
  {
    system: "rex",
    area: "Listings & publishing",
    item: "56% of the current rental book is unpublished drafts",
    state: "manual",
    note: "165 of 293 current rentals sit in draft, invisible on every portal. A business decision, not a technical one — worth a review before any bulk publish.",
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
    item: "Read certificates out of REX (EICR, gas, terms of business)",
    state: "proven",
    note: "The portal already does this daily: compliance entries carry the file at file.url. EICR and ToB are 100% attached, gas 66%, EPC 0% (EPC lives as a listing date field instead).",
  },
  {
    system: "rex",
    area: "Compliance",
    item: "Write certificates back into REX compliance entries",
    state: "untested",
    note: "compliance-entries exposes create + update; documents flow in via the Upload service. Exists, never executed.",
  },
  {
    system: "rex",
    area: "Compliance",
    item: "E-signatures (tenancy agreements) fired from the OS",
    state: "untested",
    note: "esign-requests/create is exposed, and REX has DocuSign/HelloSign third-party service classes. A supervised test away.",
  },
  {
    system: "rex",
    area: "Diary & viewings",
    item: "The OS diary reading real REX calendars",
    state: "proven",
    note: "Calendars, CalendarEvents and Appointments services all answer. The OS diary/booker currently runs on sample data — this is the swap.",
  },
  {
    system: "rex",
    area: "Diary & viewings",
    item: "Booking a viewing writing back to REX",
    state: "untested",
    note: "CalendarEvents and a BookViewingWizard service (createLead + saveApplicantStep) exist — REX has its own booking flow we can drive.",
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
    note: "Found 9 Aug, and it changes the plan: REX exposes MailMerge/createAndSend ('create a mail merge and send it instantly'), and the account already has a working sender configured ('Default Email Provider for Rex'). So no SMTP account, no Resend bill, no new sending domain — and every send lands on the contact's REX timeline, which a separate mailer would never do. Needs one supervised test send to a colleague.",
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
