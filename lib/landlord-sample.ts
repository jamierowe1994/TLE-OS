import rexSample from "@/lib/rex-sample.json";
import { SAMPLE_DECK } from "@/lib/present";
import { STAGES, stepsForStage, type LandlordView, type Stage, type ViewStep } from "@/lib/landlord-view";
import type { DocsView } from "@/lib/landlord-documents-view";
import type { MaintView } from "@/lib/landlord-maintenance-view";

/**
 * THE SAMPLE. Raj Chauhan, two invented properties, every figure typed in.
 *
 * Kept for walking people through what the portal will do once every
 * section is live, and drawn with the same dashboard the live home uses, so
 * what Susan decides on is what a landlord gets. The live portal at
 * /landlord shows a real landlord only what is real today.
 *
 * THE HARNESS (James, 12 Sep 2026): "create a bit of a harness so I can see
 * what it would look like both pre-let and post-let." rajAt(stage) builds
 * Raj at any stop - the home, the documents and the maintenance follow it -
 * and the demo pages take ?stage=<id>, with a strip of the stops at the top
 * to click between them. Nothing here is a switch inside the components:
 * they draw whatever the view says, the same as they would for a real
 * landlord.
 */

export const HARNESS_STAGES: Array<{ id: Stage; label: string; blurb: string }> = [
  { id: "valuation", label: "Valuation", blurb: "Sam has been round. The figure is in, the terms are on their way." },
  { id: "instruction", label: "Instruction", blurb: "The terms are ready to sign. Nothing moves until they are." },
  { id: "compliance", label: "Compliance", blurb: "Signed. The certificates and documents a let needs are being gathered." },
  { id: "marketing", label: "Marketing", blurb: "Photographed, written up and live on the portals." },
  { id: "viewings", label: "Viewings / Offers", blurb: "Tenants are through the door. Two offers, one with Raj." },
  { id: "let", label: "Let agreed", blurb: "Sophie's offer is accepted. Referencing and the tenancy are under way." },
  { id: "managed", label: "Managed", blurb: "Sophie is in. The portal is the management profile: tenancy, maintenance, renewals." },
];

export const isStage = (v: string | null | undefined): v is Stage => HARNESS_STAGES.some((s) => s.id === v);

type Listing = { id: string; name: string; locality: string; rent: number | null; image: string | null };
const LISTINGS = rexSample.listings as Listing[];
export const img = (name: string) => LISTINGS.find((l) => l.name.includes(name))?.image ?? null;
const PHOTOS = ["Recreation Terrace", "Walesby", "Brindley", "Chapter Road"].map(img).filter((x): x is string => Boolean(x));

const AGENT = { name: "Sam Whitaker", title: "Property Expert, Nottingham", phone: "0115 123 4567", email: "sam@thelettingexperts.co.uk", photo: null };

const rank = (stage: Stage) => (stage === "managed" ? STAGES.length : STAGES.findIndex((s) => s.id === stage));

/** The journey dates, one per stop, so a done stop shows the day it was done. */
const DONE_ON: Record<Stage, string> = {
  valuation: "12 May 2026",
  instruction: "14 May 2026",
  compliance: "26 May 2026",
  marketing: "2 June 2026",
  viewings: "20 June 2026",
  let: "1 Oct 2025",
  managed: "",
};

/**
 * The drafted contract behind the demo's Sign tile. A standing DocuSeal draft
 * on the live template, filled with Raj's figures, that emails nobody. Rebuild
 * it with scripts/build-tob-template.mjs and a submission if the template is
 * ever replaced; a dead link here shows the document, not an error.
 */
const DEMO_CONTRACT = "https://docuseal.eu/s/a92ZBR5FYrAwCK";

/** Everything the portal can show for Raj at one stop. */
export function rajAt(stage: Stage): { view: LandlordView; docs: DocsView; maintenance: MaintView } {
  const at = rank(stage);
  const done = (s: Stage) => rank(s) < at;
  const managed = stage === "managed";
  const let_ = stage === "let" || managed;
  const marketing = at >= rank("marketing");

  /* ── the journey ── */
  const journey: LandlordView["journey"] = STAGES.map((s, i) => ({
    id: s.id,
    label: s.label,
    sub: i < at ? DONE_ON[s.id] : i === at ? "In progress" : "Upcoming",
    state: i < at ? "done" : i === at ? "current" : "upcoming",
  }));

  /* ── the steps, every one a real place to go ── */
  const all: Record<ViewStep["id"], ViewStep> = {
    presentation: { id: "presentation", label: "View presentation", sub: "See how we'll let your property for you", href: "#", icon: "analytics", action: "presentation" },
    /**
     * THE REAL CONTRACT, filled in, so it can actually be looked at.
     *
     * James, 14 Sep 2026: "at the moment it's not showing any contract getting
     * drafted, which means I can't view what it looks like, if the positions
     * are right, all of that kind of stuff." The tile went to "#" - a step
     * that demonstrated nothing.
     *
     * It opens a standing DocuSeal draft of the September England terms with
     * Raj's figures in it, so what is on screen is the document as a landlord
     * meets it: the ten boxes on page 2, both signature blocks, the waiver.
     * Nobody is emailed - it was minted with send_email false, against
     * @sandbox.invalid, which by lib/sandbox's rule can never resolve.
     *
     * If it is ever completed or archived the link still opens, showing the
     * document in whatever state it reached, which is still a truer answer
     * than a hash.
     */
    sign: { id: "sign", label: "Sign your contract", sub: "Review and sign your management terms", href: DEMO_CONTRACT, icon: "pencil", action: "sign", done: done("instruction") },
    compliance: {
      id: "compliance",
      label: "Upload compliance documents",
      sub: done("compliance") ? "Everything we need is in" : stage === "compliance" ? "3 of 5 still to send" : "Add EICR, EPC and other essentials",
      href: "/landlord/demo/documents",
      icon: "upload",
      done: done("compliance"),
    },
    message: { id: "message", label: "Message your agent", sub: "Ask questions or share information", href: "/landlord/demo/messages", icon: "message" },
    listing: { id: "listing", label: "See your listing", sub: marketing ? "Live on Rightmove, Zoopla and OnTheMarket" : "Once marketing starts", href: marketing ? "#listing" : null, icon: "home" },
    viewings: {
      id: "viewings",
      label: stage === "viewings" ? "Review the offers" : "Viewings and offers",
      sub: stage === "viewings" ? "Two offers in, one waiting on you" : stage === "marketing" ? "2 viewings booked this week" : "Who has been, and what they said",
      href: marketing ? "#offers" : null,
      icon: "key",
    },
    tenancy: { id: "tenancy", label: "Sign the tenancy agreement", sub: "Sophie has signed. Your signature completes it", href: "#", icon: "file-contract", external: true },
    maintenance: { id: "maintenance", label: "Maintenance", sub: "1 job waiting on you, 2 in hand", href: "/landlord/demo/maintenance", icon: "setting" },
    renewal: { id: "renewal", label: "Tenancy renewal", sub: "Due 30 September 2026 - we'll be in touch in July", href: "#tenancy", icon: "calendar" },
    certificates: { id: "certificates", label: "Certificates", sub: "Gas safety due in 40 days - renewal being arranged", href: "/landlord/demo/documents", icon: "shield" },
  };

  /* ── the documents on the home page ── */
  const documents: LandlordView["documents"] = managed
    ? [
        { title: "Gas safety (CP12)", sub: "Expires 22 October 2026  •  renewal being arranged", state: "pending", href: "#" },
        { title: "EICR - electrical safety", sub: "Expires 18 September 2029", state: "uploaded", href: "#" },
        { title: "Energy Performance Certificate", sub: "Rating C  •  expires 2 June 2031", state: "uploaded", href: "#" },
        { title: "Tenancy agreement", sub: "Signed  •  24 September 2025", state: "uploaded", href: "#" },
      ]
    : [
        { title: "Terms of business", sub: done("instruction") ? "Signed  •  14 May 2026" : "Ready to sign", state: done("instruction") ? "uploaded" : "pending", href: "#" },
        { title: "Electrical safety report (EICR)", sub: "Uploaded  •  12 May 2026", state: "uploaded", href: "#" },
        { title: "Proof of ownership", sub: "Uploaded  •  12 May 2026", state: "uploaded", href: "#" },
        { title: "Energy Performance Certificate (EPC)", sub: done("compliance") ? "Uploaded  •  22 May 2026" : "Missing", state: done("compliance") ? "uploaded" : "missing", href: done("compliance") ? "#" : null },
        { title: "Photo ID", sub: done("compliance") ? "Uploaded  •  20 May 2026" : "Missing", state: done("compliance") ? "uploaded" : "missing", href: done("compliance") ? "#" : null },
      ];
  const have = documents.filter((d) => d.state === "uploaded").length;

  /* ── the activity, newest first, only what has happened by this stop ── */
  const activity: LandlordView["activity"] = [
    ...(managed ? [{ title: "Rent received", sub: "September's rent, paid on time", date: "1 Sep 2026", icon: "coin" }] : []),
    ...(managed ? [{ title: "Property visit", sub: "Good condition - kept well, nothing to raise", date: "12 Mar 2026", icon: "checklist" }] : []),
    ...(let_ ? [{ title: "Offer accepted", sub: "Sophie Turner, moving in 1 October", date: "20 Jun 2026", icon: "key" }] : []),
    ...(at >= rank("viewings") ? [{ title: "Viewing feedback", sub: "Loved the garden, asked about parking", date: "13 Jun 2026", icon: "message" }] : []),
    ...(marketing ? [{ title: "Listing live", sub: "On Rightmove, Zoopla and OnTheMarket", date: "2 Jun 2026", icon: "megaphone" }] : []),
    ...(marketing ? [{ title: "Photographs taken", sub: "Twelve photos, professionally shot", date: "28 May 2026", icon: "home" }] : []),
    ...(done("compliance") ? [{ title: "Certificates in", sub: "Everything the let needs is on file", date: "26 May 2026", icon: "shield" }] : []),
    ...(done("instruction") ? [{ title: "Terms signed", sub: "Your management agreement", date: "14 May 2026", icon: "pencil" }] : []),
    { title: "Presentation shared", sub: "Sam shared the presentation with you", date: "12 May 2026", icon: "message" },
    { title: "Property valued", sub: "We've agreed your asking rent", date: "12 May 2026", icon: "pencil" },
  ].slice(0, 6);

  const readiness = managed ? 100 : Math.round(((at + have / documents.length) / STAGES.length) * 100);

  const view: LandlordView = {
    greeting: "Hello, Raj",
    /* The showroom deck as the post-appraisal, so "View presentation" opens
       the book here. A real landlord's view will carry their own deck. */
    presentation: { ...SAMPLE_DECK, kind: "post-appraisal", style: "house" },
    intro: managed
      ? "Your property is let and looked after. Here's how it's doing."
      : let_
        ? "You have a tenant. Here's what's happening before they move in."
        : "Your property journey is underway. Here's what you need to know.",
    stage,
    journey,
    property: {
      address: "8 Recreation Terrace, Nottingham",
      postcode: "NG2 3AB",
      state: managed ? "Tenanted" : let_ ? "Let agreed" : marketing ? "On the market" : "Being let",
      facts: ["Terraced house", "2 bed", "1 bath"],
      rent: { figure: "£850", unit: "per month", caption: managed ? "Rent" : "Asking rent" },
      valuedOn: "12 May 2026",
      reference: "NCL 3AB",
      image: marketing ? img("Recreation Terrace") : null,
      lat: 52.9548,
      lng: -1.1581,
    },
    steps: stepsForStage(stage, all, {
      /* The harness has a deck on every stop from the valuation on, and the
         point of the sample is to show what a landlord meets - so it shows the
         BEFORE state at the valuation, where the presentation has landed and
         has not been read, and the after state from instruction on. That is
         the change James asked to be able to see. */
      presentationOpened: stage !== "valuation",
    }),
    documents,
    /* The listing matters from marketing to let agreed; once the tenant is in it is history. */
    marketing: marketing && !managed
      ? {
          live: true,
          liveSince: "2 June 2026",
          portals: [
            { name: "Rightmove", href: "#" },
            { name: "Zoopla", href: "#" },
            { name: "OnTheMarket", href: "#" },
          ],
          photos: PHOTOS,
          note: let_ ? "Marketing paused - let agreed" : "Twelve professional photographs, taken 28 May",
        }
      : null,
    viewings: marketing && !managed
      ? [
          ...(stage === "marketing"
            ? [
                { id: "v1", when: "Sat 6 Jun, 10:30", who: "A couple, relocating for work", state: "booked" as const, feedback: null },
                { id: "v2", when: "Sat 6 Jun, 11:15", who: "A young professional", state: "booked" as const, feedback: null },
              ]
            : [
                { id: "v1", when: "Sat 6 Jun, 10:30", who: "A couple, relocating for work", state: "done" as const, feedback: "Loved the garden, asked about parking." },
                { id: "v2", when: "Sat 6 Jun, 11:15", who: "A young professional", state: "done" as const, feedback: "Liked it, wants a September move." },
                { id: "v3", when: "Sat 13 Jun, 10:00", who: "Sophie, a nurse at the QMC", state: "done" as const, feedback: "Wants to offer. Asked about a small dog." },
                ...(stage === "viewings" ? [{ id: "v4", when: "Sat 20 Jun, 10:30", who: "A family of three", state: "booked" as const, feedback: null }] : []),
              ]),
        ]
      : undefined,
    offers:
      at >= rank("viewings")
        ? [
            { id: "o1", amount: "£850 per month", status: let_ ? "accepted" : "with-you", statusLabel: let_ ? "Accepted" : "With you", who: "1 adult, no children, a small dog", applicants: "Sophie", moveIn: "2026-10-01", received: "2026-06-14", conditions: "Would like to bring a small, older dog" },
            { id: "o2", amount: "£825 per month", status: let_ ? "unsuccessful" : "received", statusLabel: let_ ? "Unsuccessful" : "Received", who: "2 adults, no children, no pets", applicants: "Daniel and Priya", moveIn: "2026-09-01", received: "2026-06-08", conditions: null },
          ]
        : undefined,
    progress:
      stage === "let"
        ? {
            property: "8 Recreation Terrace",
            tenants: "Sophie Turner",
            moveIn: "2026-10-01",
            rentPcm: 850,
            stageKey: "referencing",
            stages: [
              { key: "holding", label: "Holding fee", state: "done" },
              { key: "referencing", label: "Referencing", state: "current" },
              { key: "plc", label: "Pre-let checks", state: "upcoming" },
              { key: "deposit", label: "Deposit", state: "upcoming" },
              { key: "agreement", label: "Tenancy agreement", state: "upcoming" },
              { key: "rent", label: "First rent", state: "upcoming" },
              { key: "movein", label: "Move-in day", state: "upcoming" },
            ],
            now: "Sophie's references are being checked: her employer, her last landlord and her credit file.",
            next: "Once they are back we draw up the tenancy agreement for you both to sign, and take the deposit.",
          }
        : null,
    tenancy: managed
      ? {
          tenant: "Sophie Turner",
          started: "1 October 2025",
          ends: "30 September 2026",
          renewal: "Renewal due 30 September 2026. We'll talk you through the options in July.",
          renewalDue: "2026-09-30",
          rent: "£850 per month",
          rentStatus: "Paid on time, every month",
          deposit: "£980, protected with the DPS",
          agreementHref: "#",
          agreementSigned: "24 September 2025",
          service: "Fully managed",
        }
      : null,
    maintenance: managed
      ? { open: 3, needsYou: 1, nextVisit: "Thu 24 Sep", headline: "1 job waiting on you", sub: "A fence quote needs your say-so. Two more are in hand." }
      : null,
    snapshot: {
      readinessPct: readiness,
      note: managed ? "Nothing waiting on you, bar the fence quote." : readiness >= 100 ? "Everything we need is in." : "You're making great progress.",
      lines: managed
        ? [
            ["Rent", "£850 / month"],
            ["Service", "Fully managed"],
            ["Tenant since", "1 Oct 2025"],
            ["Management fee", "8% of rent"],
            ["Next visit", "24 Sep 2026"],
          ]
        : [
            ["Asking rent", "£850 / month"],
            ["Service", "Rent collection"],
            ["Management fee", "8% of rent"],
            ["Set-up fee", "£300"],
            ["Marketing", "Included"],
          ],
    },
    activity,
    messages: [
      { id: "m1", from: "landlord", body: "Hi Sam, is the EPC from 2023 still fine to use?", sentAt: "2026-05-12T10:12:00Z", emailed: true },
      { id: "m2", from: "agent", body: "It is, Raj. Valid until 2033, so nothing to do there. The EICR is the one we need.", sentAt: "2026-05-12T10:40:00Z", emailed: true },
      ...(at >= rank("viewings")
        ? [
            { id: "m3", from: "landlord" as const, body: "Sophie's offer looks good. Is the dog a problem?", sentAt: "2026-06-15T09:02:00Z", emailed: true },
            { id: "m4", from: "agent" as const, body: "Not for a two-bed with a garden. We'd add a pet clause and a professional clean at the end. Shall I accept?", sentAt: "2026-06-15T09:30:00Z", emailed: true },
          ]
        : []),
    ],
    agent: AGENT,
  };

  /* ── the documents page ── */
  const needed: DocsView["needed"] = done("compliance")
    ? []
    : [
        { title: "Photo ID", sub: "A passport or driving licence - for the right to let checks", state: "missing", href: null, kind: "id" },
        { title: "Gas safety certificate (CP12)", sub: "If there is gas at the property", state: "missing", href: null, kind: "gas" },
        { title: "Energy Performance Certificate (EPC)", sub: "Missing - we could not find one on the register", state: "missing", href: null, kind: "epc" },
      ];
  const docs: DocsView = {
    appraisalId: null,
    needed,
    sent: [
      { title: "Electrical safety report (EICR)", sub: "EICR-8-Recreation-Terrace.pdf  •  12 May 2026", state: "uploaded", href: "#", kind: "eicr" },
      { title: "Proof of ownership", sub: "Title-register-NT123456.pdf  •  12 May 2026", state: "uploaded", href: "#", kind: "ownership" },
      ...(done("compliance")
        ? [
            { title: "Photo ID", sub: "Passport.jpg  •  20 May 2026", state: "uploaded" as const, href: "#", kind: "id" as const },
            { title: "Gas safety certificate (CP12)", sub: "CP12-2026.pdf  •  22 May 2026", state: "uploaded" as const, href: "#", kind: "gas" as const },
            { title: "Energy Performance Certificate (EPC)", sub: "EPC-8-Recreation-Terrace.pdf  •  22 May 2026", state: "uploaded" as const, href: "#", kind: "epc" as const },
          ]
        : []),
    ],
    fromUs: [
      { title: "Terms of business", sub: done("instruction") ? "Signed  •  14 May 2026" : "Ready for you to sign", state: done("instruction") ? "uploaded" : "pending", href: "#", cta: done("instruction") ? "Open" : "Sign" },
      ...(let_ ? [{ title: "Tenancy agreement", sub: managed ? "Signed by you and Sophie  •  24 September 2025" : "Drawn up once referencing is back", state: (managed ? "uploaded" : "pending") as "uploaded" | "pending", href: managed ? "#" : null, cta: managed ? "Open" : undefined }] : []),
      ...(managed ? [{ title: "Inventory and check-in report", sub: "From move-in day  •  1 October 2025", state: "uploaded" as const, href: "#", cta: "Open" }] : []),
      { title: "Post-appraisal presentation", sub: "From Sam Whitaker  •  12 May 2026", state: "uploaded", href: "#", cta: "Open" },
      { title: "Pre-appraisal presentation", sub: "From Sam Whitaker  •  9 May 2026", state: "uploaded", href: "#", cta: "Open" },
    ],
    properties: [
      ...(managed
        ? [
            {
              name: "8 Recreation Terrace, Nottingham",
              locality: "Nottingham NG2 3AB  •  Fully managed  •  Sophie Turner since 1 Oct 2025",
              image: img("Recreation Terrace"),
              headline: "Gas due in 40 days",
              allInDate: false,
              certs: [
                { title: "Gas safety (CP12)", sub: "Expires 22 October 2026 - 40 days. Renewal being arranged; if your own engineer does it, send us the new certificate", state: "watch" as const, href: "#", cta: "Open", kind: "gas" as const },
                { title: "EICR - electrical safety", sub: "Expires 18 September 2029", state: "uploaded" as const, href: "#", cta: "Open" },
                { title: "Energy Performance Certificate", sub: "Rating C  •  expires 2 June 2031", state: "uploaded" as const, href: "#", cta: "Open" },
                { title: "Smoke and carbon monoxide alarms", sub: "Checked at each visit - no dated record", state: "pending" as const, href: null },
              ],
            },
          ]
        : []),
      ...(managed ? [{
        name: "183 Walesby Lane, New Ollerton",
        locality: "Newark NG22 9PA  •  Fully managed",
        image: img("Walesby"),
        headline: "All in date",
        allInDate: true,
        certs: [
          { title: "Gas safety (CP12)", sub: "Expires 3 March 2027", state: "uploaded" as const, href: "#", cta: "Open" },
          { title: "EICR - electrical safety", sub: "Expires 18 September 2029", state: "uploaded" as const, href: "#", cta: "Open" },
          { title: "Energy Performance Certificate", sub: "Rating C  •  expires 2 June 2031", state: "uploaded" as const, href: "#", cta: "Open" },
          { title: "Smoke and carbon monoxide alarms", sub: "Checked at each visit - no dated record", state: "pending" as const, href: null },
        ],
      }] : []),
    ],
    progress: { have: 5 - needed.length, total: 5 },
  };

  /* ── the maintenance page: the house we already look after, and Recreation
        Terrace joining it once Sophie is in ── */
  const rec = "8 Recreation Terrace";
  const maintenance: MaintView = managed ? {
    properties: [
      ...(managed ? [{ name: "8 Recreation Terrace, Nottingham", locality: "Nottingham NG2 3AB  •  Fully managed  •  Tenanted", image: img("Recreation Terrace") }] : []),
      { name: "183 Walesby Lane, New Ollerton", locality: "Newark NG22 9PA  •  Fully managed  •  Tenanted", image: img("Walesby") },
    ],
    needsYou: [
      { id: "j3", ref: 1043, title: "Fence panel down after the storm", property: managed ? rec : "183 Walesby Lane", kind: "repair", state: "open", now: "Waiting on you", when: null, contractor: "Sherwood Fencing", cost: "£320", needsYou: "A quote of £320 needs your say-so - it is over your £150 authority", urgency: "Routine", reported: "Reported 8 Sep 2026 by your tenant" },
    ],
    open: [
      { id: "j1", ref: 1041, title: "Boiler losing pressure", property: managed ? rec : "183 Walesby Lane", kind: "repair", state: "open", now: "Booked for Tue 15 Sep", when: "Booked for Tue 15 Sep", contractor: "Notts Gas Services", cost: null, needsYou: null, urgency: "Urgent", reported: "Reported 10 Sep 2026 by your tenant" },
      { id: "j2", ref: 1042, title: "Bathroom extractor fan not working", property: "183 Walesby Lane", kind: "repair", state: "open", now: "Finding the right contractor", when: null, contractor: null, cost: null, needsYou: null, urgency: "Routine", reported: "Reported 11 Sep 2026 by your tenant" },
      { id: "j3", ref: 1043, title: "Fence panel down after the storm", property: managed ? rec : "183 Walesby Lane", kind: "repair", state: "open", now: "Waiting on you", when: null, contractor: "Sherwood Fencing", cost: "£320", needsYou: "A quote of £320 needs your say-so - it is over your £150 authority", urgency: "Routine", reported: "Reported 8 Sep 2026 by your tenant" },
      ...(managed ? [{ id: "j6", ref: 1044, title: "Gas safety renewal", property: rec, kind: "planned" as const, state: "open" as const, now: "Booking the visit with the tenant", when: "Due by 22 Oct 2026", contractor: "Notts Gas Services", cost: null, needsYou: null, urgency: null, reported: "Arranged 10 Sep 2026 by us" }] : []),
    ],
    done: [
      { id: "j4", ref: 1027, title: "Kitchen tap dripping", property: "183 Walesby Lane", kind: "repair", state: "done", now: "Done", when: "Done 3 Aug 2026", contractor: "AJ Plumbing", cost: "£85", needsYou: null, urgency: "Routine", reported: "Reported 28 Jul 2026 by your tenant" },
      { id: "j5", ref: 1012, title: "Annual gas safety check", property: "183 Walesby Lane", kind: "planned", state: "done", now: "Done", when: "Done 3 Mar 2026", contractor: "Notts Gas Services", cost: "£72", needsYou: null, urgency: null, reported: "Arranged 14 Feb 2026 by us" },
    ],
    visits: [
      { id: "v1", label: "Property visit", property: managed ? rec : "183 Walesby Lane", when: "Booked for Thu 24 Sep", state: "upcoming", note: "Your tenant has agreed the date" },
      { id: "v2", label: "Property visit", property: managed ? rec : "183 Walesby Lane", when: "12 Mar 2026", state: "done", note: "Good condition - kept well, nothing to raise" },
      ...(managed ? [{ id: "v3", label: "Check-in", property: rec, when: "1 Oct 2025", state: "done" as const, note: "Inventory signed by Sophie on the day" }] : []),
    ],
    spent: { figure: "£157", jobs: 2, year: 2026 },
    authority: "£150",
  } : { properties: [], needsYou: [], open: [], done: [], visits: [], spent: { figure: "£0", jobs: 0, year: 2026 }, authority: "£150" };

  return { view, docs, maintenance };
}

/** Raj where James first asked to see him: about to sign. */
export const RAJ: LandlordView = rajAt("instruction").view;
export const RAJ_DOCUMENTS: DocsView = rajAt("instruction").docs;
export const RAJ_MAINTENANCE: MaintView = rajAt("instruction").maintenance;
