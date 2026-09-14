import type { ProcessMap, ProcessNode } from "@/lib/process/types";

/**
 * Running a let property, drawn 14 Sep 2026 at James's ask: "everything from
 * the move-in day ... repairs, rent increases because that needs to be
 * documented, inspections, and stuff like that."
 *
 * ── Why the repair is the spine ───────────────────────────────────────────
 *
 * Four things run on a managed property and they run on their own clocks: a
 * repair happens when something breaks, an inspection on a cadence, a
 * certificate on its expiry date, the rent every month. None of them is
 * "after" another, so a single line through all four would be a lie about
 * the order.
 *
 * The repair takes the spine because it is the longest, the one with eleven
 * emails on it, and the one a tenant judges us by. The other three run
 * alongside it, and the tenancy's own dates - first rent, the review, notice,
 * check-out - run above them all.
 *
 * The steps on the spine are the same ids the product already uses
 * (lib/works-steps), so the map and the job sheet cannot drift apart.
 *
 * ── What this map is really for ───────────────────────────────────────────
 *
 * Maintenance was mapped with Michael on 7 Sep from how he does it today:
 * tenant rings, we ring the landlord, the landlord either sorts it or asks
 * us to, we find somebody, the contractor books it with the tenant, the job
 * is done, the invoice arrives, the landlord is billed. Every box here comes
 * from that conversation, and the gaps are the parts that are still him
 * remembering to do something.
 *
 * The two biggest: a TENANT CANNOT REPORT A REPAIR - there is no route into
 * the OS from their portal, so every job starts with a phone call - and rent
 * increases are not documented anywhere at all, which is the one on this map
 * with legal consequences.
 *
 * ── How far along ─────────────────────────────────────────────────────────
 *
 * Statuses are set at the lowest rung each step can honestly claim. Nothing
 * is at Live and tested: maintenance was built on 7 September and NOT ONE
 * REAL JOB has been raised on production since, so every box on the spine is
 * a thing that works in theory.
 */
const X = 300;
const ROW = 190;
const n = (p: Omit<ProcessNode, "x" | "y"> & { col: number; row?: number }): ProcessNode => {
  const { col, row = 0, ...rest } = p;
  return { ...rest, x: 60 + col * X, y: 760 + row * ROW };
};

export const MAINTENANCE_PROCESS: ProcessMap = {
  audience: "maintenance",
  title: "Running a let property",
  blurb:
    "From move-in day onwards: a repair start to finish, the inspections and certificates that run on their own clocks, the rent and the review that has to be documented, and the way a tenancy ends.",
  version: 1,
  nodes: [
    /* ── The tenancy's own dates, above everything ───────────────────── */
    n({ id: "move-in", kind: "trigger", lane: "side", col: 0, row: -3, status: "built", title: "Move-in day", blurb: "Keys, inventory, check-in. The property joins the managed book and everything below starts running.", trigger: { on: "propoly.deal.move_day" } }),
    n({ id: "welcome", kind: "email", lane: "side", col: 1, row: -3, status: "planned", title: "Welcome to your new home", blurb: "How to report a repair, who to ring out of hours, when the rent goes out, what we need from them. NOT WRITTEN - and it is the email that decides whether the first repair arrives as a phone call at 6pm or as a job in the OS.", trigger: { on: "tenancy.started", after: "straight away" } }),
    n({ id: "first-rent", kind: "trigger", lane: "side", col: 2, row: -3, status: "built", title: "First rent in", blurb: "PayProp sees it. The Scotland key is direct; England and Wales is dead until the portal reconnects.", trigger: { on: "payprop.rent.received" } }),
    n({ id: "statement", kind: "email", lane: "side", col: 3, row: -3, status: "planned", title: "Your monthly statement", blurb: "What came in, what came out, what is on its way to them. NOT BUILT: PayProp's income report is not in the client's permissions, so the OS cannot see whose money is whose.", trigger: { on: "payprop.statement", after: "monthly" } }),
    n({ id: "arrears", kind: "decision", lane: "side", col: 4, row: -3, status: "planned", title: "Rent late?", blurb: "Nothing watches for this. An arrears ladder - the tenant, then the landlord, then the formal letters - is a build of its own and has not started." }),

    /* ── The rent review. James: it has to be documented. ─────────────── */
    n({ id: "review-due", kind: "trigger", lane: "side", col: 5, row: -3, status: "planned", title: "Rent review due", blurb: "Usually the anniversary. NOTHING IN THE OS WATCHES FOR IT: today it is whoever remembers, which is how a property sits two years under market.", trigger: { on: "tenancy.anniversary", after: "3 months before" } }),
    n({ id: "review-advice", kind: "email", lane: "side", col: 6, row: -3, status: "planned", title: "What your property would let for now", blurb: "To the landlord, with the comparables behind it - the same market data the appraisal deck uses. Their decision, in writing, on the file. NOT BUILT." }),
    n({ id: "review-decision", kind: "decision", lane: "side", col: 7, row: -3, status: "planned", title: "Increase, or leave it?", blurb: "The landlord's answer, and the reason. THE POINT OF DOCUMENTING IT: a tenant who disputes an increase, or a landlord who says they were never asked, is answered by the record rather than by memory." }),
    n({ id: "review-notice", kind: "screen", lane: "side", col: 8, row: -3, status: "planned", title: "Serve the notice", blurb: "A rent increase on a periodic tenancy is a section 13 notice, in the prescribed form, with at least a month's notice and only once a year. On a fixed term it is a renewal or an agreed variation instead. NOT BUILT, and it is the item on this map with legal consequences." }),
    n({ id: "review-done", kind: "trigger", lane: "side", col: 9, row: -3, status: "planned", title: "New rent from", blurb: "The date it takes effect, written to REX, PayProp and the tenancy file, with the notice stored beside it." }),

    /* ── The end of the tenancy ──────────────────────────────────────── */
    n({ id: "notice", kind: "trigger", lane: "side", col: 10, row: -3, status: "planned", title: "Notice given", blurb: "By either side. Nothing in the OS records it, so nothing counts down from it.", trigger: { on: "tenancy.notice" } }),
    n({ id: "checkout", kind: "screen", lane: "side", col: 11, row: -3, status: "built", title: "Check-out", blurb: "The condition against the inventory, and the deposit case. Exists as an inspection type; never run.", href: "/inspections" }),
    n({ id: "deposit-return", kind: "screen", lane: "side", col: 12, row: -3, status: "planned", title: "Return the deposit", blurb: "Deductions, the evidence behind each one, the scheme's paperwork and the argument if there is one. NOT BUILT." }),

    /* ── Certificates, on their own clock ────────────────────────────── */
    n({ id: "cert-due", kind: "trigger", lane: "side", col: 1, row: -2, status: "live", title: "A certificate is running out", blurb: "Gas, electrical and EPC on every home; alarms, fire, PAT and legionella on an HMO. Scoped to the 404 homes the agency is answerable for.", trigger: { on: "certificate.expiring", after: "60 days before" }, href: "/compliance" }),
    n({ id: "cert-agent", kind: "email", lane: "side", col: 2, row: -2, status: "built", title: "Certificates due: the agent", blurb: "To whoever's book the property is on. Built; the chase switch is OFF, so nothing has gone out.", emailId: "compliance-chase-agent", trigger: { on: "certificate.expiring", after: "60 days before" } }),
    n({ id: "cert-landlord", kind: "email", lane: "side", col: 3, row: -2, status: "built", title: "Certificate renewal: the landlord", blurb: "Their agent copied in. Same switch, same silence.", emailId: "compliance-chase-landlord", trigger: { on: "certificate.expiring", after: "45 days before" } }),
    n({ id: "cert-book", kind: "decision", lane: "side", col: 4, row: -2, status: "planned", title: "Who is booking the engineer?", blurb: "The landlord, or us through a contractor. When it is us it becomes a job on the spine below - and today nothing joins the two." }),
    n({ id: "cert-in", kind: "screen", lane: "side", col: 5, row: -2, status: "live", title: "The new certificate", blurb: "Dropped in; the OS reads what it is and when it expires, and files it against the property.", href: "/compliance" }),
    n({ id: "cert-send", kind: "email", lane: "side", col: 6, row: -2, status: "planned", title: "Send it to the landlord and the tenant", blurb: "Michael, 7 Sep: by law a renewed gas safety has to reach both within 30 days, and today he does it by hand in Propoly. On the Compliance screen the button only ticks the row - NOTHING SENDS." }),

    /* ── Inspections, on their own clock ─────────────────────────────── */
    n({ id: "visit-due", kind: "trigger", lane: "side", col: 1, row: -1, status: "built", title: "A visit is due", blurb: "The cadence in settings says it is time - three months from the start, then every six. 255 came up due on the first run. Michael has not signed the cadence off.", trigger: { on: "inspection.due" }, href: "/inspections" }),
    n({ id: "visit-ask", kind: "email", lane: "side", col: 2, row: -1, status: "built", title: "Can we visit?", blurb: "The ask, not the telling: why we come, how long it takes, the dates on offer, and a link to pick one or say none work. Their answer IS the permission the OS keeps.", emailId: "inspection-tenant-access", trigger: { on: "inspection.access.asked" } }),
    n({ id: "visit-booked", kind: "email", lane: "side", col: 3, row: -1, status: "built", title: "Visit confirmed", blurb: "The date in writing, which is the notice, and an invitation to raise anything bothering them before we arrive.", emailId: "inspection-tenant-booked", trigger: { on: "inspection.booked" } }),
    n({ id: "visit-done", kind: "screen", lane: "side", col: 4, row: -1, status: "built", title: "The visit", blurb: "Room by room on the sheet. Photographs, and anything that needs doing.", href: "/inspections" }),
    n({ id: "visit-report", kind: "email", lane: "side", col: 5, row: -1, status: "built", title: "The visit report", blurb: "How their property is being kept, what was found, and what happens next about each thing.", emailId: "inspection-landlord-report", trigger: { on: "inspection.reported" } }),
    n({ id: "visit-finding", kind: "decision", lane: "side", col: 6, row: -1, status: "planned", title: "Something needs doing?", blurb: "A finding marked for a works order does NOT raise one - the two screens do not talk. Today somebody retypes it.", href: "/inspections" }),

    /* ── The repair itself: the spine ────────────────────────────────── */
    n({ id: "tenant-reports", kind: "trigger", lane: "spine", col: 0, status: "planned", title: "The tenant reports it", blurb: "THE BIGGEST GAP ON THIS MAP. There is no route from the tenant's portal into maintenance, so every job starts as a phone call and exists only once somebody types it in.", href: "/tenant/demo/maintenance?from=admin" }),
    n({ id: "logged", kind: "screen", lane: "spine", col: 1, status: "built", title: "Log the repair", blurb: "Address, what is wrong, how urgent, who reported it, access notes. The property's details fill themselves in.", href: "/maintenance" }),
    n({ id: "ack", kind: "email", lane: "spine", col: 2, status: "built", title: "Repair logged, to the tenant", blurb: "It is logged, how urgent we have marked it, when to expect somebody, and what to do if it gets worse.", emailId: "works-tenant-received", trigger: { on: "works.reported", after: "straight away" } }),

    n({ id: "tell-landlord", kind: "screen", lane: "spine", col: 3, status: "built", title: "Tell the landlord", blurb: "Ring first - Michael's rule. The email is the fallback and the written record.", href: "/maintenance" }),
    n({ id: "report-email", kind: "email", lane: "spine", col: 4, status: "built", title: "Repair reported, to the landlord", blurb: "What the tenant reported, how urgent, and the two ways forward: they arrange it, or we do.", emailId: "works-landlord-report", trigger: { on: "works.landlord.told" } }),
    n({ id: "arranging", kind: "decision", lane: "spine", col: 5, status: "built", title: "Who is arranging it?", blurb: "Their own people, or us. The single question the whole flow turns on.", href: "/maintenance" }),

    n({ id: "landlord-doing", kind: "screen", lane: "nurture", col: 6, row: 1, status: "built", title: "Landlord organising", blurb: "Their contractor, their timescale - and the job that most often goes quiet. A follow-up date is set and chased until it is resolved.", href: "/maintenance" }),
    n({ id: "chase-landlord", kind: "email", lane: "nurture", col: 7, row: 1, status: "planned", title: "Chase: is it sorted?", blurb: "On the follow-up date. NOT WRITTEN - today it is a note in a diary." }),

    n({ id: "pick", kind: "screen", lane: "spine", col: 6, status: "built", title: "Pick a contractor", blurb: "Your book and the company's, matched to the trade and sorted by how far they are from the property.", href: "/maintenance" }),
    n({ id: "can-you", kind: "email", lane: "spine", col: 7, status: "built", title: "Can you take this?", blurb: "The job in brief and a yes or no. The works order follows once they say yes.", emailId: "works-contractor-report", trigger: { on: "works.contractor.asked" } }),
    n({ id: "confirmed", kind: "decision", lane: "spine", col: 8, status: "built", title: "Contractor confirmed?", blurb: "Once they say yes the works order and the tenant's email go out together.", href: "/maintenance" }),
    n({ id: "order", kind: "email", lane: "spine", col: 9, status: "built", title: "The works order", blurb: "What, where, how urgent, access, the tenant to arrange with, and the rule that anything over the landlord's authority needs a quote first.", emailId: "works-contractor-order", trigger: { on: "works.order.sent" } }),
    n({ id: "found", kind: "email", lane: "side", col: 9, row: 1, status: "built", title: "We have found someone", blurb: "To the tenant, alongside the order: who is coming, that they will ring to arrange, and what to do if they do not.", emailId: "works-tenant-found", trigger: { on: "works.order.sent" } }),

    n({ id: "quote", kind: "decision", lane: "nurture", col: 9, row: 2, status: "built", title: "Over the landlord's limit?", blurb: "A quote above their authority stops here until they say yes.", href: "/maintenance" }),
    n({ id: "approval", kind: "email", lane: "nurture", col: 10, row: 2, status: "built", title: "A quote to approve", blurb: "The figure, why we are asking, and a one-word reply to go ahead.", emailId: "works-landlord-approval", trigger: { on: "works.quote.over" } }),

    n({ id: "booking", kind: "trigger", lane: "spine", col: 10, status: "built", title: "The contractor books it with the tenant", blurb: "Michael's rule: they arrange it directly rather than us relaying two diaries. The date comes back on their own page, or an agent types it in.", trigger: { on: "works.booked" } }),
    n({ id: "booked-contractor", kind: "email", lane: "spine", col: 11, status: "built", title: "Booking confirmed, to the contractor", blurb: "The date, the address, the access. Short, because they have the order already.", emailId: "works-contractor-booked", trigger: { on: "works.booked" } }),
    n({ id: "booked-tenant", kind: "email", lane: "side", col: 11, row: 1, status: "built", title: "Contractor booked, to the tenant", blurb: "Who is coming and when, and how to move it.", emailId: "works-tenant-booked", trigger: { on: "works.booked" } }),
    n({ id: "booked-landlord", kind: "email", lane: "side", col: 12, row: 1, status: "built", title: "Arranged, to the landlord", blurb: "Who is booked and when, and that nothing is needed from them.", emailId: "works-landlord-arranged", trigger: { on: "works.booked" } }),

    n({ id: "no-date", kind: "decision", lane: "nurture", col: 11, row: 2, status: "planned", title: "No date back?", blurb: "The contractor has the order and nothing has been booked. NOT WATCHED: nothing counts the days, so a job can sit here for a fortnight." }),
    n({ id: "cancelled", kind: "email", lane: "nurture", col: 12, row: 2, status: "built", title: "Cancelled, to the contractor", blurb: "Do not attend, and why.", emailId: "works-contractor-cancelled", trigger: { on: "works.cancelled" } }),

    n({ id: "visit-job", kind: "trigger", lane: "spine", col: 12, status: "built", title: "The visit", blurb: "The job is done. The contractor can close it from their own page with photographs and the invoice.", trigger: { on: "works.visited" } }),
    n({ id: "all-done", kind: "email", lane: "spine", col: 13, status: "built", title: "All done?", blurb: "The day after the booked date: one page to mark it done, add photographs and drop in the invoice, which goes straight to accounts.", emailId: "works-contractor-done-request", trigger: { on: "works.visit.passed", after: "1 day" } }),
    n({ id: "done-tenant", kind: "email", lane: "side", col: 13, row: 1, status: "built", title: "Job done, to the tenant", blurb: "What was done, and tell us if it is not right.", emailId: "works-tenant-done", trigger: { on: "works.done" } }),
    n({ id: "happy", kind: "email", lane: "spine", col: 14, status: "built", title: "Are you happy?", blurb: "A yes and a no. A no comes straight back to the agent rather than into a mailbox nobody reads.", emailId: "works-tenant-happy", trigger: { on: "works.done", after: "1 day" } }),
    n({ id: "not-happy", kind: "decision", lane: "nurture", col: 15, row: 1, status: "built", title: "Not right?", blurb: "Back to the contractor as a re-visit, on the same job rather than a new one." }),

    /* ── The money ───────────────────────────────────────────────────── */
    n({ id: "invoice-in", kind: "trigger", lane: "spine", col: 15, status: "planned", title: "The contractor's invoice arrives", blurb: "Michael, 7 Sep: 60 to 70 a month, and NOBODY TELLS HIM. They upload and wait. Reading the contractor's email and filing it against the job automatically is written down and not built.", trigger: { on: "works.invoice.received" } }),
    n({ id: "accounts", kind: "email", lane: "spine", col: 16, status: "planned", title: "Tell accounts", blurb: "One email per invoice to the accounts inbox - Michael's ask, and the accounts inbox rather than compliance. NOT BUILT." }),
    n({ id: "payprop", kind: "screen", lane: "spine", col: 17, status: "planned", title: "Pre-create the payment in PayProp", blurb: "So he checks and confirms rather than retyping it, and re-authenticating every half hour while he does. NOT BUILT." }),
    n({ id: "landlord-invoice", kind: "email", lane: "spine", col: 18, status: "live", title: "The landlord's invoice", blurb: "Raised against the property, worked out from its rent and service. The figure, the due date, and the button that opens it.", emailId: "invoice-sent", trigger: { on: "invoice.sent" } }),
    n({ id: "closed", kind: "trigger", lane: "spine", col: 19, status: "built", title: "Closed", blurb: "The job, the photographs, the invoice and everything said about it, kept on the property." }),
  ],
  edges: [
    /* The tenancy's own line. */
    { from: "move-in", to: "welcome", kind: "main" },
    { from: "welcome", to: "first-rent", kind: "main" },
    { from: "first-rent", to: "statement", kind: "main" },
    { from: "statement", to: "arrears", kind: "branch", label: "if it does not arrive" },
    { from: "statement", to: "review-due", kind: "main" },
    { from: "review-due", to: "review-advice", kind: "main" },
    { from: "review-advice", to: "review-decision", kind: "main" },
    { from: "review-decision", to: "review-notice", kind: "main", label: "increase" },
    { from: "review-notice", to: "review-done", kind: "main" },
    { from: "review-done", to: "notice", kind: "main" },
    { from: "notice", to: "checkout", kind: "main" },
    { from: "checkout", to: "deposit-return", kind: "main" },

    /* Certificates. */
    { from: "move-in", to: "cert-due", kind: "branch", label: "on its own clock" },
    { from: "cert-due", to: "cert-agent", kind: "main" },
    { from: "cert-agent", to: "cert-landlord", kind: "main" },
    { from: "cert-landlord", to: "cert-book", kind: "main" },
    { from: "cert-book", to: "cert-in", kind: "main" },
    { from: "cert-in", to: "cert-send", kind: "main" },
    { from: "cert-book", to: "logged", kind: "branch", label: "we book it: a job" },

    /* Inspections. */
    { from: "move-in", to: "visit-due", kind: "branch", label: "on its own clock" },
    { from: "visit-due", to: "visit-ask", kind: "main" },
    { from: "visit-ask", to: "visit-booked", kind: "main" },
    { from: "visit-booked", to: "visit-done", kind: "main" },
    { from: "visit-done", to: "visit-report", kind: "main" },
    { from: "visit-report", to: "visit-finding", kind: "main" },
    { from: "visit-finding", to: "logged", kind: "branch", label: "found something: a job" },

    /* The repair. */
    { from: "tenant-reports", to: "logged", kind: "main" },
    { from: "logged", to: "ack", kind: "main" },
    { from: "ack", to: "tell-landlord", kind: "main" },
    { from: "tell-landlord", to: "report-email", kind: "main" },
    { from: "report-email", to: "arranging", kind: "main" },
    { from: "arranging", to: "landlord-doing", kind: "branch", label: "they will" },
    { from: "landlord-doing", to: "chase-landlord", kind: "main" },
    { from: "chase-landlord", to: "closed", kind: "return", label: "sorted" },
    { from: "arranging", to: "pick", kind: "main", label: "we will" },
    { from: "pick", to: "can-you", kind: "main" },
    { from: "can-you", to: "confirmed", kind: "main" },
    { from: "confirmed", to: "order", kind: "main", label: "yes" },
    { from: "confirmed", to: "pick", kind: "return", label: "no: try the next one" },
    { from: "order", to: "found", kind: "branch" },
    { from: "order", to: "booking", kind: "main" },
    { from: "order", to: "quote", kind: "branch", label: "if it is a big one" },
    { from: "quote", to: "approval", kind: "main" },
    { from: "approval", to: "booking", kind: "return", label: "approved" },
    { from: "booking", to: "booked-contractor", kind: "main" },
    { from: "booking", to: "booked-tenant", kind: "branch" },
    { from: "booked-tenant", to: "booked-landlord", kind: "main" },
    { from: "booking", to: "no-date", kind: "branch", label: "nothing booked" },
    { from: "no-date", to: "cancelled", kind: "main", label: "give up on them" },
    { from: "cancelled", to: "pick", kind: "return", label: "find somebody else" },
    { from: "booked-contractor", to: "visit-job", kind: "main" },
    { from: "visit-job", to: "all-done", kind: "main" },
    { from: "all-done", to: "done-tenant", kind: "branch" },
    { from: "all-done", to: "happy", kind: "main" },
    { from: "happy", to: "not-happy", kind: "branch", label: "no" },
    { from: "not-happy", to: "pick", kind: "return", label: "back out to the contractor" },
    { from: "happy", to: "invoice-in", kind: "main" },
    { from: "invoice-in", to: "accounts", kind: "main" },
    { from: "accounts", to: "payprop", kind: "main" },
    { from: "payprop", to: "landlord-invoice", kind: "main" },
    { from: "landlord-invoice", to: "closed", kind: "main" },
  ],
};
