/**
 * The wiring sheet — the honest ledger of what the OS can and cannot do
 * against the real systems, kept as data so updating it is editing one list.
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

export interface WiringRow {
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

export const WIRING: WiringRow[] = [
  // ── Listings & publishing ──
  {
    area: "Listings & publishing",
    item: "Read the whole rental book (293 current rentals, photos included)",
    state: "live",
    note: "Listings/search with the rental category filter. The OS listings page currently uses a static export of exactly this call — swapping to live is a small change.",
  },
  {
    area: "Listings & publishing",
    item: "Publish a listing to Rightmove / Zoopla / OnTheMarket",
    state: "untested",
    note: "The full pipeline exists and is exposed to us: ListingPublication/publish, setActivePublicationChannels, ListingPortalUploads/queue. Rightmove, Zoopla and OnTheMarket are active portal profiles on the account, and current listings are feeding live (checked against a real Rightmove link). No write has ever been fired — first publish should be a supervised test on a throwaway draft.",
  },
  {
    area: "Listings & publishing",
    item: "Pre-publish checks (what's missing before it can go live)",
    state: "proven",
    note: "ListingPublication/getErrorsPreventingPublication returns the exact blockers per listing — this becomes the OS's 'ready to publish?' checklist for free.",
  },
  {
    area: "Listings & publishing",
    item: "Create / edit listings and properties from the OS",
    state: "untested",
    note: "listings and properties both expose create + update to our session (settled 3 Aug via describe). Same rule: exists, never executed.",
  },
  {
    area: "Listings & publishing",
    item: "Upload photos and floorplans into REX",
    state: "untested",
    note: "The undocumented Upload service (uploadListingImage, uploadFileFromUrl, 16 methods) is exposed to us. This is also the R2→REX photo route.",
  },
  {
    area: "Listings & publishing",
    item: "56% of the current rental book is unpublished drafts",
    state: "manual",
    note: "165 of 293 current rentals sit in draft, invisible on every portal. A business decision, not a technical one — worth a review before any bulk publish.",
  },

  // ── Leads ──
  {
    area: "Leads",
    item: "Rightmove / Zoopla / OnTheMarket enquiries arriving in REX",
    state: "live",
    note: "87,000+ leads on record, newest minutes old. Each carries the applicant's name, email, phone, message, and the listing it's about. The portal sources are set to auto-process.",
  },
  {
    area: "Leads",
    item: "Pull those leads into the OS leads page",
    state: "proven",
    note: "Leads/search reads them cleanly with full contact + listing joins. Wiring the OS leads screen to this is next on the list.",
  },
  {
    area: "Leads",
    item: "Real-time push — a lead lands in REX, the OS hears instantly",
    state: "proven",
    note: "AdminWebhooks supports leads.created (73 events incl. listings.updated, tenancy_applications.created). One webhook already exists on the account (a 2022 Zapier one), so the mechanism is in use. Needs: an OS endpoint + creating the webhook (a write).",
  },
  {
    area: "Leads",
    item: "Work a lead from the OS (assign, complete, archive, mark spam)",
    state: "untested",
    note: "Leads exposes update, toggleCompletionState, archive, toggleSpamMarker to our session. Exists, never executed.",
  },

  // ── Compliance & documents ──
  {
    area: "Compliance & documents",
    item: "Read certificates out of REX (EICR, gas, terms of business)",
    state: "proven",
    note: "The portal already does this daily: compliance entries carry the file at file.url. EICR and ToB are 100% attached, gas 66%, EPC 0% (EPC lives as a listing date field instead).",
  },
  {
    area: "Compliance & documents",
    item: "Certificate vault in our own storage (R2)",
    state: "live",
    note: "Attach-certificate on the compliance drawer uploads for real; files come back on 5-minute signed links. Next brick: a listing endpoint so attached files persist across refresh.",
  },
  {
    area: "Compliance & documents",
    item: "Write certificates back into REX compliance entries",
    state: "untested",
    note: "compliance-entries exposes create + update; documents flow in via the Upload service. Exists, never executed.",
  },
  {
    area: "Compliance & documents",
    item: "E-signatures (tenancy agreements) fired from the OS",
    state: "untested",
    note: "esign-requests/create is exposed, and REX has DocuSign/HelloSign third-party service classes. A supervised test away.",
  },

  // ── Diary & viewings ──
  {
    area: "Diary & viewings",
    item: "The OS diary reading real REX calendars",
    state: "proven",
    note: "Calendars, CalendarEvents and Appointments services all answer. The OS diary/booker currently runs on sample data — this is the swap.",
  },
  {
    area: "Diary & viewings",
    item: "Booking a viewing writing back to REX",
    state: "untested",
    note: "CalendarEvents and a BookViewingWizard service (createLead + saveApplicantStep) exist — REX has its own booking flow we can drive.",
  },

  // ── Money ──
  {
    area: "Money",
    item: "Fees, arrears and landlord payments from PayProp",
    state: "blocked",
    note: "The portal reads PayProp today, but the OS has no PayProp key yet — and the deeper reports (damage deposits, unreconciled money) need scopes/OAuth PayProp still hasn't granted. Ask stays with PayProp support.",
  },

  // ── Foundations ──
  {
    area: "Foundations",
    item: "Real sign-in (per-person accounts) and a database",
    state: "blocked",
    note: "Nothing OS-side persists beyond the browser yet — notes, layouts and portal accounts are localStorage. This is the agreed next foundational block; everything above gets easier once it lands.",
  },
  {
    area: "Foundations",
    item: "Sending real email / WhatsApp from the OS",
    state: "blocked",
    note: "Every send in the OS is a rehearsal — the buttons compose the right message but nothing leaves. Needs an email sender (SMTP/Resend) and WhatsApp (REX has a WhatsAppMessages service worth probing first).",
  },
  {
    area: "Foundations",
    item: "Tenant & landlord portals on real customer accounts",
    state: "blocked",
    note: "Both portals are built and walk-through-able, but run on demo people until sign-in + database exist.",
  },
];
