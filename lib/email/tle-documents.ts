/**
 * The email documents themselves, and NOTHING ELSE.
 *
 * Deliberately free of imports. These are the words that go to partners and
 * landlords, so they must be readable, diffable and renderable on their own -
 * without a database, a session, or the rest of the OS booting. The catalogue
 * in tle-emails.ts wires them up; this file is only the writing.
 *
 * NOTE ON COPY: no em dashes in any body. House style, and they render
 * inconsistently across mail clients.
 */

export type Block = Record<string, unknown>;
export type EmailDoc = {
  subject: string;
  preheader: string;
  mode: string;
  blocks: readonly Block[];
  /** Per-document overrides, merged over the TLE brand at render time. */
  branding?: Record<string, unknown>;
};

/* ── Block helpers. Ids are STABLE strings, not random: a catalogue that
      renders a different id on every request cannot be diffed, and these
      documents are reviewed by eye before they go anywhere near a partner. ── */
/* Two heading sizes, because one is not a hierarchy. The renderer defaults
   every heading to 28px, which made the section headings compete with the
   headline and gave a long email no shape to skim. */
const H = (id: string, text: string): Block => ({
  type: "heading", id, text, align: "left", color: "", size: 30,
});
const H2 = (id: string, text: string): Block => ({
  type: "heading", id, text, align: "left", color: "", size: 19, lineHeight: 1.3,
});
const T = (id: string, text: string): Block => ({ type: "text", id, text, bg: "" });
/* Taller and a touch narrower than the renderer's 11px x 24px (James, 16 Sep
   2026: "very thin on the page"). */
const BTN_PAD = { t: 16, r: 22, b: 16, l: 22 };
const BTN = (id: string, text: string, url: string, align: "left" | "center" = "left"): Block => ({
  type: "button", id, text, url, color: "", align, pad: BTN_PAD,
});
const H2C = (id: string, text: string): Block => ({
  type: "heading", id, text, align: "center", color: "#3b3b3c", size: 17, lineHeight: 1.35,
});
const TC = (id: string, text: string): Block => ({ type: "text", id, text, align: "center", bg: "" });
/* Width in PX, not a percentage: Outlook ignores max-width on images and will
   happily print a 1040px illustration at full size, blowing the card apart. */
const IMG = (id: string, url: string, alt: string, width: number): Block => ({
  type: "image", id, url, alt, linkUrl: "", align: "center", width,
});
const SP = (id: string, height = 16): Block => ({ type: "spacer", id, height });
/* Key facts as rows: a small label over each value, hairlines between, no box
   (the landlord look, 26 Oct 2026). A row whose value is left unfilled drops
   out, so optional facts can sit in the list. */
const FACTS = (id: string, rows: readonly (readonly [string, string])[]): Block => ({
  type: "facts", id, text: rows.map(([label, value]) => `${label}|${value}`).join("\n"),
});
const DIV = (id: string): Block => ({ type: "divider", id, color: "#E7E2DD" });
const FOOT = (id: string, note: string): Block => ({
  type: "footer", id, note, address: "The Letting Experts", showSocial: true, unsubscribe: false,
});

/**
 * Where the links in these emails point.
 *
 * The custom domain, not the Railway one. A landlord receiving a link to
 * tle-os-production.up.railway.app reads it as either a mistake or a phishing
 * attempt, and neither is recoverable by explaining afterwards. Both hostnames
 * serve the same app; only one of them looks like us.
 *
 * OS_PUBLIC_URL overrides it, so a staging environment can point at itself
 * without editing the words.
 */
export const SITE = (process.env.OS_PUBLIC_URL || "https://tle-os.co.uk").replace(/\/+$/, "");

/* ──────────────────────── the two big ones ──────────────────────── */

/**
 * The pilot invitation.
 *
 * About five agents get the platform before anybody else. The email has one
 * job beyond "here is a link": make it clear that being early means being
 * asked, not being tested on. A pilot where nobody reports anything is a
 * pilot that told people they were receiving a finished product.
 *
 * So the bug button is named IN the invitation rather than discovered later,
 * and the closing line asks for the thing that is genuinely most useful and
 * least likely to be volunteered: the parts they never open.
 */
export const PILOT_INVITE: EmailDoc = {
  subject: "You're in, {{firstName}}",
  preheader: "TLE OS, and you get it before anybody else.",
  mode: "blocks",
  blocks: [
    /* The wordmark as TYPE, not an image. Half of email clients block images
       by default, and a launch email whose first impression is a grey box
       with a broken-image icon has already lost the room. The letterhead
       above it already carries the company; this says which THING. */
    {
      type: "heading",
      id: "p0",
      text: "TLE OS",
      align: "center",
      size: 58,
      /* The OS's own heading face - Manrope since 11 Sep 2026 - so the email
         and the product look like one thing. Gmail and Outlook on Windows
         strip web fonts, so a good half of the list reads the fallback,
         which is why the wordmark is still TYPE: it reads either way. Brown
         since 30 Sep 2026, when the red left the palette. See FONT_STACKS in
         render.js. */
      font: "manrope",
      letterSpacing: 0,
      lineHeight: 1.15,
      color: "#56423E",
    },
    H2C("p0b", "is nearly here, and you're first through the door"),
    SP("p0c", 4),
    IMG("p1", `${SITE}/illustrations/notioly/paper-airplane.png`, "Launching something", 300),
    H("p2", "You're in."),
    T(
      "p3",
      "Hi {{firstName}},<br><br>We've been building <strong>TLE OS</strong> - one place for your leads, your listings, your appraisals and your paperwork, instead of four things and a spreadsheet.<br><br>It opens to everyone on <strong>14 October</strong>. You're getting it now."
    ),
    T(
      "p4",
      "There are five of you. You were picked because you'd spot the difference between something that genuinely works and something that only looks good in a demo."
    ),
    DIV("p5"),
    H2("p6", "Nothing you do can break anything"),
    T(
      "p7",
      "This is a <strong>sandbox</strong>. Click every button, book fake appraisals, drag things about, try to break it. <strong>Nothing writes back to REX.</strong> No landlord gets emailed, no record changes, nothing leaves the building.<br><br>That stays true until we deliberately turn it on, and we'll tell you the day we do. So genuinely - go and have a play."
    ),
    DIV("p8"),
    H2("p9", "Some of it won't work yet, and that's the point"),
    T(
      "p10",
      "We're building this as you use it. You will find half-finished corners, buttons that don't do much yet, and the odd number that looks wrong.<br><br>That isn't you doing it wrong. It's just where we are."
    ),
    DIV("p11"),
    H2("p12", "When something's wrong, say so"),
    T(
      "p13",
      "There's a <strong>report a problem</strong> button on every single screen. Hit it the second something looks off and it sends us the page you were on, so you never have to explain which bit you meant.<br><br>Use it for the small things especially. A wonky number, a page that looks odd on your phone, a word that's just wrong. Those are the ones nobody reports and nobody fixes."
    ),
    DIV("p14"),
    H2("p15", "One thing we'll ask you in three weeks"),
    T(
      "p16",
      "Not what you liked. <strong>Which bits you never opened.</strong><br><br>The tabs you walked straight past every day tell us what to cut and what to move, and that's the whole reason for doing this with five people first instead of fifty."
    ),
    SP("p17", 12),
    /* The button is the LAST thing, as asked. Everything above it is the
       reason to press it; a call to action higher up would be pressed before
       any of it had been read. */
    BTN("p18", "Set up your account →", `${SITE}/join`, "center"),
    SP("p19", 8),
    TC("p20", "Anything at all, just reply. It comes straight to me.<br><br><strong>James</strong>"),
    FOOT("p21", "You're getting this because you're one of the five on the TLE OS pilot."),
  ],
  branding: { showSignoff: false },
};

/**
 * Launch day.
 *
 * A different email to a different room. The pilot invitation asks for help;
 * this one hands over something finished, so it leads with what changes for
 * the reader rather than with the fact that we built it.
 *
 * The pilot is named on purpose. "Five of your colleagues have been using it
 * since August" is the only line in here that answers "is this going to
 * waste my morning", and it is worth more than any feature list.
 */
export const LAUNCH_ANNOUNCEMENT = {
  subject: "TLE OS is live",
  preheader: "Your leads, listings, appraisals and paperwork, in one place.",
  mode: "blocks",
  blocks: [
    H("l1", "It's live."),
    T(
      "l2",
      "Hi {{firstName}},<br><br>TLE OS is open to everyone from today. It's one place for the work that's currently spread across REX, your inbox, a spreadsheet and DocuSign."
    ),
    BTN("l3", "Sign in", `${SITE}/`),
    SP("l4", 8),
    DIV("l5"),
    H2("l6", "What's different from Monday"),
    T(
      "l7",
      "<strong>Your leads, already yours.</strong> The list opens on your own enquiries, newest first, with the ones nobody has rung yet at the top."
    ),
    T(
      "l8",
      "<strong>Appraisals as one run.</strong> Book it, confirm it, send the landlord their own page before you arrive, write it up after. The confirmation and the calendar invite go out when you book, not when you remember."
    ),
    T(
      "l9",
      "<strong>Terms without the hunt.</strong> Every property says whether its terms are signed. The signed copy sits on the record, and you can see at a glance who still hasn't signed."
    ),
    T(
      "l10",
      "<strong>Your figures, live.</strong> Every number is pulled fresh and scoped to the month you're in. Nothing is a snapshot from a report somebody ran once."
    ),
    DIV("l11"),
    H2("l12", "It's been in use since August"),
    T(
      "l13",
      "Five of your colleagues have been working in it since the summer and have put a few hundred fixes through it. It isn't a first draft."
    ),
    DIV("l14"),
    H2("l15", "If something's wrong"),
    T(
      "l16",
      "There's a <strong>report a problem</strong> button on every screen. It tells us which page you were on, so you don't have to explain it twice.<br><br>You won't break anything by clicking around. Have a look at everything."
    ),
    SP("l17", 8),
    T("l18", "James"),
    FOOT("l19", "You're getting this because you work with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/* ─────────────────────── compliance reminders ───────────────────────
 *
 * Two documents, because a chase has two readers with two different jobs.
 *
 * THE AGENT gets a list. They may have a dozen properties across several
 * landlords, and one email per certificate would be a dozen emails on a Monday
 * — which is how a chase becomes something you filter. So: everything on their
 * book that needs a certificate, in one place, worst first.
 *
 * THE LANDLORD gets ONE property and ONE certificate. They own one or two
 * houses and a list is meaningless to them; what they need is the address, the
 * document, and the date it stops being valid.
 *
 * The tracker's rule is that every reminder addresses BOTH — an agent must
 * never be surprised by a chase on their own file. The landlord half is written
 * here and deliberately not wired: lib/email-policy refuses any non-internal
 * address until the public Letting Experts domain exists, so this is what it
 * WILL say, previewable now and sendable the day that domain lands.
 *
 * No deadline theatre. The band is stated as a fact — "expires in 14 days" —
 * because a certificate is a legal obligation and dressing it up as urgency
 * makes the genuinely urgent ones indistinguishable. */

/** The agent's OWN paperwork, not the properties'. Item 11. */
/* RETIRED 6 Sep 2026: the agent's own-compliance reminder and the certificate
   chase to agents both render on the shared TLE OS shell now
   (lib/email/agent-emails). These two documents are kept only as the record
   of the wording they carried; nothing sends them. */
export const AGENT_COMPLIANCE_CHASE = {
  subject: "{{count}} thing{{plural}} you hold personally need{{singular}} attention",
  preheader: "Your own compliance, not the properties' - what is missing or running out.",
  mode: "blocks",
  blocks: [
    H("pc1", "Your own compliance"),
    T(
      "pc2",
      "Hi {{firstName}},<br><br>These are the things you hold personally as a TLE partner agent, and each one below is either not on file or running out. Worst first."
    ),
    T("pc3", "{{rows}}"),
    BTN("pc4", "Open your profile", `${SITE}/profile`),
    SP("pc5", 8),
    DIV("pc6"),
    H2("pc7", "What to do"),
    T(
      "pc8",
      "Renew or get the thing, then mark it done on your profile with the date. Michael checks it from his side, and the reminder stops by itself once the date is in."
    ),
  ],
};

export const COMPLIANCE_CHASE_AGENT = {
  subject: "{{count}} of your properties need a certificate",
  preheader: "Gas, EICR and EPC coming up for renewal on your book.",
  mode: "blocks",
  blocks: [
    H("ca1", "Certificates due on your book"),
    T(
      "ca2",
      "Hi {{firstName}},<br><br>These properties need a certificate renewing. They're listed worst first - anything already expired is at the top, because a let can't legally proceed without it."
    ),
    T("ca3", "{{rows}}"),
    BTN("ca4", "Open Compliance", `${SITE}/compliance`),
    SP("ca5", 8),
    DIV("ca6"),
    H2("ca7", "What we need from you"),
    T(
      "ca8",
      "Chase the landlord for the certificate, or book the contractor if that's the arrangement on the property. Once the certificate is on file the reminder stops by itself - there's nothing to tick off."
    ),
    T(
      "ca9",
      "If a property on this list isn't yours any more, that's worth telling us: it means the record is wrong, and the landlord may be getting chased by nobody."
    ),
    SP("ca10", 8),
    T("ca11", "The Letting Experts"),
    FOOT("ca12", "You're getting this because these properties are on your book."),
  ],
  branding: { showSignoff: false },
} as const;

/* ─────────────── the renewed certificate, out to everyone on it ───────────────
   Michael, 7 Sep 2026: the tenant must have it by law, within 30 days, and
   today it is done by hand in Propoly. Three documents, because three people
   are owed three different things:

     the landlord   owns the obligation and wants the record kept
     the tenant     is legally entitled to the document and owes nothing
     the contractor produced it and should see where it went

   NONE OF THEM MENTIONS MONEY. The certificate is the only thing attached,
   and an invoice is never part of this - the cost of the work is between us
   and the landlord's statement, and a gas certificate arriving with a bill
   attached turns a legal notice into a chase. Enforced in
   lib/certificate-share.ts, said here so nobody adds it back in the copy.

   ALL THREE ARE SHORT ON PURPOSE. There is nothing to do with any of them.
   An email that attaches a document and then asks for something is an email
   people stop opening, and this one has to be opened for years.            */

/**
 * The landlord's copy. Their certificate, their obligation, our record.
 *
 * Leads on the fact that it is filed rather than on the attachment: a landlord
 * who knows we hold it stops keeping their own parallel folder, which is the
 * habit that produces two different expiry dates for one boiler.
 */
export const CERTIFICATE_SHARED_LANDLORD = {
  subject: "The renewed {{certLabel}} for {{address}}",
  preheader: "Attached, and on the property's file. Nothing to do.",
  mode: "blocks",
  blocks: [
    H("crl1", "Renewed and on File"),
    T("crl2", "Hi {{firstName}},<br><br>A certificate on your property has been renewed. Your copy is attached."),
    FACTS("crl11", [
      ["Certificate", "{{certLabel}}"],
      ["Property", "{{address}}"],
      ["Runs to", "{{expires}}"],
    ]),
    T(
      "crl3",
      "It's on the property's file and in your landlord portal, so you can pull it up whenever you need it without asking us. {{alsoLine}}"
    ),
    SP("crl4", 8),
    H2("crl6", "Nothing to Do"),
    T(
      "crl7",
      "We hold the date and chase the next renewal before it lapses. If anything on the certificate looks wrong, just reply and we'll take it up with the engineer."
    ),
    SP("crl8", 8),
    T("crl9", "The Letting Experts"),
    FOOT("crl10", "You're getting this because you let a property through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Certificates" },
} as const;

/**
 * The tenant's copy.
 *
 * SAYS WHY IT ARRIVED. A document turning up unannounced from a letting agent
 * reads as a problem, and a tenant who thinks a gas certificate is a warning
 * rings the office. So the second line is "you are entitled to this, nothing
 * is wrong", which is the only sentence in the email doing real work.
 */
export const CERTIFICATE_SHARED_TENANT = {
  subject: "The {{certLabel}} for your home",
  preheader: "Your copy, attached. Nothing is wrong and nothing is needed.",
  mode: "blocks",
  blocks: [
    H("crt1", "Your Copy, Hot off the Press"),
    T("crt2", "Hi {{firstName}},<br><br>A certificate for your home has been renewed, and your copy is attached."),
    FACTS("crt11", [
      ["Certificate", "{{certLabel}}"],
      ["Your home", "{{address}}"],
      ["Runs to", "{{expires}}"],
    ]),
    T(
      "crt3",
      "You're entitled to a copy of this, so we send it as soon as it lands rather than waiting to be asked. <strong>Nothing is wrong and there's nothing you need to do</strong> - just keep it with your tenancy papers."
    ),
    T("crt7", "If it won't open, reply to this email and we'll send it another way, or print a copy for you."),
    T("crt9", "All the best,<br>The Letting Experts"),
    FOOT("crt10", "You're getting this because you rent a home managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Certificates", mast: "sage" },
} as const;

/**
 * The contractor's copy.
 *
 * Not a receipt and not about their invoice. It closes the loop on the one
 * thing they cannot see from their own page: that the document they uploaded
 * reached the people it was for.
 */
export const CERTIFICATE_SHARED_CONTRACTOR = {
  subject: "Filed: {{certLabel}} for {{address}}",
  preheader: "It reached the landlord and the tenant. Your copy is attached.",
  mode: "blocks",
  blocks: [
    H("crc1", "{{certLabel}} is filed"),
    T(
      "crc2",
      "Hi {{firstName}},<br><br>Thanks for the {{certLabel}} for <strong>{{address}}</strong>. It is on the property's compliance record, dated to <strong>{{expires}}</strong>, and it has gone to the landlord and the tenant. Your copy is attached."
    ),
    T(
      "crc3",
      "If the date or the property on it is not right, tell us now rather than later: it is the date we will chase the next renewal from."
    ),
    SP("crc4", 8),
    T("crc5", "The Letting Experts"),
    FOOT("crc6", "You're getting this because you carried out the work."),
  ],
  branding: { showSignoff: false },
} as const;

export const COMPLIANCE_CHASE_LANDLORD = {
  subject: "{{certLabel}} at {{address}} expires {{whenPretty}}",
  preheader: "We need the renewed certificate before it lapses.",
  mode: "blocks",
  blocks: [
    H("cl1", "A Certificate Due for Renewal"),
    T("cl2", "Hi {{firstName}},<br><br>A certificate on your property is coming up for renewal."),
    FACTS("cl13", [
      ["Certificate", "{{certLabel}}"],
      ["Property", "{{address}}"],
      ["Expires", "{{expires}}"],
      ["Time left", "{{daysLeft}} days"],
    ]),
    T(
      "cl3",
      "By law the property must hold a valid certificate for as long as it is let. If it lapses we have to stop marketing it, and an existing tenancy can be affected too. That's why we get in touch early rather than close to the date."
    ),
    SP("cl4", 8),
    H2("cl6", "Two Ways to Renew It"),
    T(
      "cl7",
      "<strong>If you arrange it yourself:</strong> send us the certificate when you have it and we'll put it on the property's file."
    ),
    T(
      "cl8",
      "<strong>If we arrange it:</strong> reply and we'll book a contractor and let you know the date."
    ),
    T(
      "cl9",
      "Either way, {{agentName}} is copied in and can pick it up with you."
    ),
    SP("cl10", 8),
    T("cl11", "The Letting Experts"),
    FOOT("cl12", "You're getting this because you let a property through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Certificates" },
} as const;

/* ──────────────────── the two doorways ────────────────────
   Both are sent the moment something is BOOKED, and both exist to turn an
   appointment into an account. That timing is the whole idea: it is the one
   moment the person is definitely thinking about us, and the gap between
   "someone is coming round" and "I should get my paperwork together" is
   exactly where the work would otherwise fall to an agent chasing.

   Neither asks for anything the reader would not have to produce anyway. The
   argument for filling it in early is that it is less work later, and that is
   stated plainly rather than dressed up as an offer.                       */

/**
 * Tenant: a viewing is booked, so start the passport.
 *
 * The passport is the one thing a tenant fills in that pays off more than once
 * - the same details answer every application they make with us - so the email
 * leads on that rather than on us needing the documents.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is imply anyone else can see it yet.
 * Referencing and right-to-rent are intrusive to hand over, and somebody who
 * thinks their passport is visible to a landlord before they have even decided
 * to apply will not fill it in. So the email says when it is shared, in the
 * body, not in a footnote.
 */
export const TENANT_PASSPORT_INVITE = {
  subject: "Your viewing is booked. Next, your tenant passport",
  preheader: "Fill it in once and it is ready for every property you apply for.",
  mode: "blocks",
  blocks: [
    H("tp1", "You're Booked In"),
    T("tp2", "Hi {{firstName}},<br><br>Your viewing is confirmed. {{meetLine}}"),
    FACTS("tp3", [["The home", "{{address}}"], ["When", "{{whenPretty}}"]]),
    H2("tp5", "While You Wait: Your Tenant Passport"),
    T(
      "tp6",
      "If you decide to apply, the same things get asked every time: who you are, where you've lived, what you do, and your right to rent in the UK. Your passport is where you put them once, and it's yours to keep."
    ),
    T("tp7", "About ten minutes, and you can stop and come back whenever you like. <strong>Nothing in it is shared with a landlord unless you apply for their home.</strong>"),
    BTN("tp9", "Start my passport", "{{link}}"),
    SP("tp10", 8),
    T("tp11", "If this one's the one, a finished passport means your application can go in the same day. Good homes go quickly, and complete applications go first."),
    T("tp13", "See you there,<br>{{agentName}}"),
    FOOT("tp14", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: {
    showSignoff: false,
    kicker: "Viewing booked",
    heroImage: { src: `${SITE}/email/tenant/passport-ready-to-rent.png`, width: 150, alt: "A tenant passport, stamped Ready to Rent" },
  },
} as const;

/**
 * Tenant: a copy of the offer their agent put forward for them (1 Oct 2026).
 *
 * When the agent records the offer on the phone or sitting down together,
 * the tenant gets it in writing so a wrong figure is caught before the
 * landlord decides. {{summaryList}} is the offer, one line each, built by
 * lib/agent-offer.
 */
export const TENANT_OFFER_COPY = {
  subject: "Your offer on {{address}}",
  preheader: "What {{agentName}} has put forward for you. Reply if anything is wrong.",
  mode: "blocks",
  blocks: [
    H("oc1", "Your Offer Is In"),
    T("oc2", "Hi {{firstName}},<br><br>Here's the offer {{agentName}} has put forward for you on <strong>{{address}}</strong>."),
    { type: "facts", id: "oc3", text: "{{summaryList}}" },
    T("oc4", "Give it a quick read. If anything isn't right, just reply and {{agentName}} will put it right before the landlord decides."),
    T("oc5", "We usually hear back within a day, and we'll tell you as soon as we do."),
    SP("oc6", 8),
    T("oc7", "Fingers crossed,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("oc8", "You're getting this because you made an offer through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your offer" },
} as const;

/**
 * An offer, put to the landlord by the agent (Howard, 8 Oct 2026, ticket
 * 0268fdcc). Never sent on its own (James, 2 Oct 2026: no automatic landlord
 * or tenant messages): the agent presses Send to the landlord on the offer,
 * reads it, adds a line of their own, and sends it from their own address.
 * The rent, the move-in day and who would live there - no income, no contact
 * details. lib/offer-landlord-email fills it.
 */
export const LANDLORD_OFFER = {
  subject: "An offer on {{address}}",
  preheader: "{{amountWords}} a month, moving in {{moveInWords}}. Let {{agentName}} know what you think.",
  mode: "blocks",
  blocks: [
    H("lo1", "An Offer on Your Home"),
    T("lo2", "Hi {{firstName}},<br><br>We've had an offer on <strong>{{address}}</strong>."),
    { type: "facts", id: "lo3", text: "{{summaryList}}" },
    T("lo4", "{{agentLine}}"),
    T("lo5", "Just reply, or give {{agentName}} a ring, to say whether you'd like to accept it. Nothing is agreed until you say yes."),
    SP("lo6", 8),
    T("lo7", "{{agentName}}<br>The Letting Experts"),
    FOOT("lo8", "You're getting this because The Letting Experts are letting your home."),
  ],
  branding: { showSignoff: false, kicker: "An offer" },
} as const;

/**
 * A customer update, written by the OS and sent by the agent (James, 2 Oct
 * 2026). Something happened on the let - references back, the PLC sent back,
 * the agreement out - and the landlord or tenant should hear. Nothing sends
 * this on its own: the agent opens it, changes what they like, and sends it
 * from their own address, or rings instead (lib/customer-updates).
 *
 * One shape for every update; lib/customer-update-copy writes the words.
 */
export const CUSTOMER_UPDATE = {
  subject: "{{subject}}",
  preheader: "{{preheader}}",
  mode: "blocks",
  blocks: [
    H("cu1", "{{heading}}"),
    T("cu2", "Hi {{firstName}},<br><br>{{bodyHtml}}"),
    T("cu3", "{{nextLine}}"),
    SP("cu4", 8),
    T("cu5", "Any questions, just reply to this email.<br><br>{{agentName}}<br>The Letting Experts"),
    FOOT("cu6", "{{footLine}}"),
  ],
  /* The kicker shows on both looks: beside the mark on the landlord's copy
     (update-landlord), as the stamp in the band on the tenant's (update-tenant),
     where {{heading}} becomes the band's title. */
  branding: { showSignoff: false, kicker: "An update" },
} as const;

/**
 * Tenant: the application form for one home, sent from its listing (Howard's
 * ticket, approved by James 1 Oct 2026). The agent types in one or more
 * addresses and each gets this, with a button to /tenant/apply?listing=<id>.
 *
 * The application form only - never the passport. The passport goes when the
 * agent presses Send passport, and nowhere else (James, 1 Oct 2026).
 */
export const APPLICATION_FORM_INVITE = {
  subject: "Apply for {{address}}",
  preheader: "The application form for {{address}}. About ten minutes, and it goes straight to {{agentName}}.",
  mode: "blocks",
  blocks: [
    H("af1", "Ready When You Are"),
    T("af2", "Hi,<br><br>Here's the application form for this home:"),
    FACTS("af10", [["The home", "{{address}}"], ["Advertised rent", "{{rent}}"]]),
    T("af3", "It takes about ten minutes. Everyone over 18 who will live there fills in their own part, because the right to rent check is a legal one for every adult. It goes straight to {{agentName}}, who puts it to the landlord."),
    SP("af4", 8),
    BTN("af5", "Start my application", "{{link}}"),
    SP("af6", 8),
    T("af7", "Nothing is owed by applying. A holding deposit is only asked for once the landlord says yes."),
    T("af8", "Any questions, just reply to this email.<br><br>Good luck,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("af9", "You're getting this because you asked about a home with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Application form" },
} as const;

/**
 * Tenant: the offer link for one home, sent from its listing (7 Oct 2026,
 * Howard: "could there be a make an offer button, or one that is shared").
 * The application form under its offer name - a button to
 * /tenant/offer?listing=<id>. Never the passport.
 */
export const OFFER_LINK_INVITE = {
  subject: "Make an offer on {{address}}",
  preheader: "Your offer for {{address}}. About ten minutes, and it goes straight to {{agentName}}.",
  mode: "blocks",
  blocks: [
    H("ol1", "Make Your Offer"),
    T("ol2", "Hi,<br><br>Here's the offer form for this home:"),
    FACTS("ol10", [["The home", "{{address}}"], ["Advertised rent", "{{rent}}"]]),
    T("ol3", "Put in the rent you'd like to offer and the day you'd like to move in. Everyone over 18 who will live there fills in their own part, because the right to rent check is a legal one for every adult. It takes about ten minutes and goes straight to {{agentName}}, who puts it to the landlord."),
    SP("ol4", 8),
    BTN("ol5", "Make my offer", "{{link}}"),
    SP("ol6", 8),
    T("ol7", "<strong>Offers can be at or below the advertised rent, not above it.</strong> Nothing is owed by making an offer."),
    T("ol8", "Any questions, just reply to this email.<br><br>Fingers crossed,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("ol9", "You're getting this because you asked about a home with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Offer form" },
} as const;

/**
 * Tenant: the passport on its own, BEFORE any viewing (1 Oct 2026).
 *
 * Rhiannon: "The rental passport should just be the initial request to
 * complete so we can assess their situation to then be able to arrange an
 * appointment. I won't book appointments with anyone unless they meet
 * criteria." Sent from a lead the day they enquire, it says nothing about a
 * viewing, because there isn't one yet and there may never be. The viewing
 * email comes later, once the agent has read the passport and booked one.
 */
export const TENANT_PASSPORT_REQUEST = {
  subject: "Your tenant passport: the first step to a viewing",
  preheader: "About ten minutes, filled in once, and it answers every home you apply for.",
  mode: "blocks",
  blocks: [
    H("pr1", "Let's Get You Ready to Rent"),
    T(
      "pr2",
      "Hi {{firstName}},<br><br>Thanks for getting in touch. Before we book any viewings, we ask everyone to fill in a tenant passport. Think of it as your renting CV: fill it in once, and it answers every home you apply for."
    ),
    FACTS("pr6", [
      ["1 · You fill it in", "About ten minutes. Stop and come back whenever you like."],
      ["2 · We take a look", "So we only book you in for homes that suit you."],
      ["3 · Ready to rent", "Viewings booked, and your application is good to go."],
    ]),
    T("pr7", "It asks who's moving in, what you do, where you've lived, any pets and your right to rent. <strong>Nothing in it is shared with a landlord unless you apply for their home.</strong>"),
    BTN("pr9", "Start my passport", "{{link}}"),
    SP("pr10", 8),
    T("pr11", "Any questions, just reply. It comes straight to us.<br><br>Speak soon,<br>The Letting Experts"),
    FOOT("pr14", "You're getting this because you enquired with The Letting Experts."),
  ],
  branding: {
    showSignoff: false,
    kicker: "Tenant passport",
    heroImage: { src: `${SITE}/email/tenant/passport-ready-to-rent.png`, width: 150, alt: "A tenant passport, stamped Ready to Rent" },
  },
} as const;

/**
 * Tenant: a viewing is booked (1 Oct 2026). The confirmation every booking
 * sends, with no passport in it.
 *
 * James: the passport only goes out when the agent presses Send passport, so
 * a booking confirmation never asks for one. {{nextLine}} thanks them if
 * their passport is already done, and otherwise just says how to go ahead.
 * The block id tp2 is shared with TENANT_PASSPORT_INVITE on purpose: the
 * calendar buttons are inserted after it in both.
 */
export const TENANT_VIEWING_BOOKED = {
  subject: "Your viewing is booked",
  preheader: "The address, the time, and who is meeting you.",
  mode: "blocks",
  blocks: [
    H("tp1", "You're Booked In"),
    T("vb2", "Hi {{firstName}},<br><br>Your viewing is confirmed. Here's everything you need."),
    FACTS("vb9", [["The home", "{{address}}"], ["When", "{{whenPretty}}"]]),
    /* tp2 stays the line the calendar buttons follow (lib/viewing-confirm). */
    T("tp2", "{{meetLine}}"),
    T("vb4", "{{nextLine}}"),
    T("vb5", "Need to change the time? Just reply to this email."),
    T("vb7", "Enjoy the viewing,<br>{{agentName}}"),
    FOOT("vb8", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Viewing booked", mast: "manilla" },
} as const;

/**
 * Landlord: an appraisal is booked, so open the property file.
 *
 * The pitch is not "make an account". It is that we have already gathered what
 * is publicly known about their property, and they can correct it before we
 * turn up - which is worth more to them than it is to us, and is true.
 */
/**
 * The landlord's way in. No password: the link IS the sign-in, the way the
 * pre-appraisal deck and the tenant passport already work, and it is single
 * use and a day long. Short on purpose - the person asked for it thirty
 * seconds ago and is waiting for it.
 */
export const LANDLORD_SIGN_IN = {
  subject: "Your link to your property file",
  preheader: "One click and you are in. The link works once and lasts a day.",
  mode: "blocks",
  blocks: [
    H("ls1", "Here Is Your Link"),
    T(
      "ls2",
      "Hi {{firstName}},<br><br>The button below takes you into your property file with The Letting Experts: your properties, your certificates and everything happening on them."
    ),
    FACTS("ls11", [["Works", "Once"], ["Lasts", "24 hours"]]),
    BTN("ls4", "Open my property file", "{{link}}"),
    SP("ls5", 8),
    T("ls6", "If it has run out, ask for another from the sign-in page."),
    T("ls7", "If you didn't ask for this, you can ignore it. Nothing happens unless the link is opened."),
    FOOT("ls10", "You're getting this because a sign-in was requested for this address at The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Sign in" },
} as const;

export const TENANT_SIGN_IN = {
  subject: "Your link to your tenancy",
  preheader: "One click and you are in. The link works once and lasts a day.",
  mode: "blocks",
  blocks: [
    H("ts1", "Here's Your Way In"),
    T(
      "ts2",
      "Hi {{firstName}},<br><br>The button below takes you into your account with The Letting Experts: where your tenancy is up to, what happens next, and your passport."
    ),
    FACTS("ts11", [["Works", "Once"], ["Lasts", "24 hours"]]),
    BTN("ts4", "Open my account", "{{link}}"),
    SP("ts5", 8),
    T("ts6", "If it has run out, ask for another from the sign-in page."),
    T("ts7", "If you didn't ask for this, you can ignore it. Nothing happens unless the link is opened."),
    T("ts9", "See you inside,<br>The Letting Experts"),
    FOOT("ts10", "You're getting this because a sign-in was requested for this address at The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Sign in", mast: "sage" },
} as const;


/* ──────────────── Maintenance: the contractor, the tenant, the landlord ──────────────── */

/**
 * The works-order emails, one per step (James, 7 Sep 2026: "add the
 * contractor and tenant emails at each step... make sure you're adding them
 * to the marketing section so they can edit them"). Block documents, so the
 * builder owns the words; the placeholders are filled from the job by
 * lib/works-emails at send time, and every send goes on the job's timeline.
 *
 * Placeholders: {{ref}} {{title}} {{address}} {{category}} {{urgency}}
 * {{dueBy}} {{scheduledAt}} {{contractorName}} {{contractorGreeting}} {{contractorPhone}}
 * {{tenantName}} {{tenantPhone}} {{landlordName}} {{access}} {{description}}
 * {{quote}} {{authority}} {{agentName}} {{agentEmail}} {{agentPhone}}
 * {{completionNote}}
 */
export const WORKS_CONTRACTOR_ORDER = {
  subject: "Works order #{{ref}}: {{title}} at {{address}}",
  preheader: "A job from The Letting Experts. The details are below.",
  mode: "blocks",
  blocks: [
    H("wc1", "Works order #{{ref}}"),
    T("wc2", "Hi {{contractorGreeting}},<br><br>Please could you attend the following for us. The tenants' details are below so you can arrange a time with them directly. If the job needs a quote first, reply to this email with it."),
    T("wc3", "<strong>{{title}}</strong><br>{{address}}<br>{{category}} · {{urgency}} · attend by {{dueBy}}"),
    T("wc4", "{{description}}"),
    T("wc5", "<strong>Tenants to arrange access with</strong><br>{{tenantsList}}"),
    T("wc5a", "<strong>Access notes:</strong> {{access}}"),
    SP("wc6", 8),
    T("wc6a", "{{bookingLine}}"),
    BTN("wc6b", "{{buttonLabel}}", "{{contractorLink}}"),
    SP("wc6c", 8),
    T("wc7", "Please quote works order #{{ref}} on your invoice. Anything over the landlord's pre-authorised spend needs their yes before you go ahead, so send a quote first if it looks like more than a call-out."),
    SP("wc8", 8),
    T("wc9", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}} · {{agentEmail}}"),
    FOOT("wc10", "You're getting this because you're on The Letting Experts' trades book."),
  ],
  branding: { showSignoff: false },
} as const;

/**
 * The works order for planned maintenance (James, 8 Oct 2026): a gas safety,
 * an EICR, a boiler service. Different from a repair's in three ways - every
 * tenant on the home is on it, because the contractor arranges access with
 * them directly and a shared house has several; it carries the date the
 * current certificate runs out rather than an urgency; and the button is how
 * they tell us the time they have agreed, on the same page they later upload
 * the certificate to. {{tenantsList}}, {{dueDay}}, {{bookingLine}} and
 * {{buttonLabel}} are filled by lib/works-emails.
 */
export const WORKS_CONTRACTOR_PLANNED = {
  subject: "Works order #{{ref}}: {{title}} at {{address}}",
  preheader: "A planned job from The Letting Experts, with the tenants to arrange it with.",
  mode: "blocks",
  blocks: [
    H("wp1", "Works order #{{ref}}"),
    T("wp2", "Hi {{contractorGreeting}},<br><br>Please could you carry out the following for us. The tenants' details are below so you can arrange a time with them directly."),
    T("wp3", "<strong>{{title}}</strong><br>{{address}}<br>{{category}}<br><strong>Expiry date:</strong> {{dueDay}}"),
    T("wp4", "{{description}}"),
    T("wp5", "<strong>Tenants to arrange access with</strong><br>{{tenantsList}}"),
    T("wp6", "<strong>Access notes:</strong> {{access}}"),
    SP("wp7", 8),
    T("wp8", "{{bookingLine}}"),
    BTN("wp9", "{{buttonLabel}}", "{{contractorLink}}"),
    SP("wp10", 8),
    T("wp11", "When the job is done, upload the certificate on the same page and it goes straight onto the property's record. Please quote works order #{{ref}} on your invoice."),
    SP("wp12", 8),
    T("wp13", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}} · {{agentEmail}}"),
    FOOT("wp14", "You're getting this because you're on The Letting Experts' trades book."),
  ],
  branding: { showSignoff: false },
} as const;

export const WORKS_CONTRACTOR_BOOKED = {
  subject: "Confirmed: #{{ref}} {{title}}, {{scheduledAt}}",
  preheader: "The booking, the address and the access.",
  mode: "blocks",
  blocks: [
    H("wb1", "Booked: {{scheduledAt}}"),
    T("wb2", "Hi {{contractorGreeting}},<br><br>Confirming works order #{{ref}} at <strong>{{address}}</strong> on <strong>{{scheduledAt}}</strong>."),
    T("wb3", "<strong>{{title}}</strong><br>{{category}}<br><strong>Access:</strong> {{access}}<br><strong>Tenant:</strong> {{tenantName}} {{tenantPhone}}"),
    SP("wb4", 8),
    T("wb5", "If the time moves, let us know and we'll tell the tenant. Please quote #{{ref}} on the invoice."),
    SP("wb6", 8),
    T("wb7", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}}"),
    FOOT("wb8", "You're getting this because you're booked on a job for The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

export const WORKS_CONTRACTOR_CANCELLED = {
  subject: "Cancelled: #{{ref}} {{title}} at {{address}}",
  preheader: "Please don't attend. Sorry for the change.",
  mode: "blocks",
  blocks: [
    H("wx1", "Job #{{ref}} is cancelled"),
    T("wx2", "Hi {{contractorGreeting}},<br><br>Please don't attend <strong>{{address}}</strong> for <strong>{{title}}</strong>. Sorry for the change of plan."),
    T("wx3", "{{description}}"),
    SP("wx4", 8),
    T("wx5", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}}"),
    FOOT("wx6", "You're getting this because you were booked on a job for The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

export const WORKS_TENANT_RECEIVED = {
  subject: "We've logged your repair: {{title}}",
  preheader: "What happens next, and how soon.",
  mode: "blocks",
  blocks: [
    H("wt1", "Thanks, We're on It"),
    T("wt2", "Hi {{tenantName}},<br><br>Thanks for letting us know. Your repair is logged and we're on it."),
    FACTS("wt8", [
      ["The repair", "{{title}}"],
      ["Your home", "{{address}}"],
      ["Job number", "#{{ref}}"],
      ["How urgent", "{{urgency}}"],
      ["We aim to attend by", "{{dueBy}}"],
    ]),
    T("wt3", "We'll email you the moment a contractor is booked, with the date and who to expect."),
    H2("wt9", "If It's an Emergency"),
    T("wt4", "<strong>If it gets worse, or it's an emergency - no heating, a leak you can't stop, no power - ring us straight away on {{agentPhone}}</strong> rather than waiting for the email."),
    T("wt6", "Speak soon,<br>{{agentName}}"),
    FOOT("wt7", "You're getting this because you reported a repair at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Repairs", mast: "sage" },
} as const;

export const WORKS_TENANT_BOOKED = {
  subject: "{{contractorName}} is coming on {{scheduledAt}}",
  preheader: "Who to expect, and when.",
  mode: "blocks",
  blocks: [
    H("wtb1", "The Date Is Set"),
    T("wtb2", "Hi {{tenantName}},<br><br>We've booked <strong>{{contractorName}}</strong> to come round. Here's what to expect."),
    FACTS("wtb7", [
      ["When", "{{scheduledAt}}"],
      ["Who's coming", "{{contractorName}}"],
      ["The job", "{{title}} (#{{ref}})"],
      ["Your home", "{{address}}"],
    ]),
    T("wtb3", "Please make sure somebody can let them in. If that time doesn't work, reply to this email or ring {{agentPhone}} and we'll move it."),
    T("wtb5", "Thanks,<br>{{agentName}}"),
    FOOT("wtb6", "You're getting this because a contractor is booked at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Booked in", mast: "sage" },
} as const;

export const WORKS_TENANT_DONE = {
  subject: "Done: {{title}} at {{address}}",
  preheader: "Tell us if it isn't right.",
  mode: "blocks",
  blocks: [
    H("wtd1", "Job Done"),
    T("wtd2", "Hi {{tenantName}},<br><br><strong>{{title}}</strong> (job #{{ref}}) is marked done: {{completionNote}}"),
    T("wtd3", "If it isn't right, or the problem comes back, reply to this email and we'll get somebody back out."),
    T("wtd5", "Thanks,<br>{{agentName}}"),
    FOOT("wtd6", "You're getting this because a repair was carried out at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Repairs", mast: "sage" },
} as const;

export const WORKS_LANDLORD_APPROVAL = {
  subject: "Your approval needed: {{title}} at {{address}}, {{quote}}",
  preheader: "A quote over your pre-authorised spend. One reply and it goes ahead.",
  mode: "blocks",
  blocks: [
    H("wl1", "A Quote for Your Approval"),
    T("wl2", "Hi {{landlordName}},<br><br>A quote has come in that's over what you've pre-authorised us to spend, so we need your yes before it goes ahead."),
    FACTS("wl2a", [["Your property", "{{address}}"], ["The job", "{{title}} (#{{ref}})"], ["Quote", "{{quote}}"], ["You've pre-authorised", "{{authority}}"]]),
    T("wl3", "{{description}}"),
    T("wl4", "Reply <strong>yes</strong> to this email, or ring {{agentPhone}}, and we'll book it in. If you'd rather we got another quote first, just say."),
    SP("wl5", 8),
    T("wl6", "Thanks,<br>{{agentName}}"),
    FOOT("wl7", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false, kicker: "Repairs" },
} as const;

/**
 * The invoice email. The document itself is a page (/invoice/<token>) the
 * button opens; the email carries the figure, the due date and the way in.
 * Placeholders: {{number}} {{toName}} {{address}} {{total}} {{dueDate}}
 * {{reference}} {{link}} {{agentName}} {{agentPhone}}
 */
export const INVOICE_SENT = {
  subject: "Invoice {{number}} from The Letting Experts: {{total}}",
  preheader: "Due {{dueDate}}. The invoice is one click away.",
  mode: "blocks",
  blocks: [
    H("in1", "Your Invoice"),
    T("in2", "Hi {{toName}},<br><br>Here's your invoice for <strong>{{reference}}</strong>{{address}}."),
    FACTS("in2a", [["Invoice", "{{number}}"], ["Total", "{{total}}"], ["Due by", "{{dueDate}}"]]),
    SP("in3", 4),
    BTN("in4", "View the invoice", "{{link}}"),
    SP("in5", 8),
    T("in6", "Payment details are on the invoice. If anything on it isn't right, just reply and we'll sort it before you pay."),
    SP("in7", 4),
    T("in8", "Thanks,<br>{{agentName}} · {{agentPhone}}"),
    FOOT("in9", "You're getting this because The Letting Experts have raised an invoice to you."),
  ],
  branding: { showSignoff: false, kicker: "Invoice" },
} as const;

/* The report to the landlord, the moment it is logged (workflow step 1). */
export const WORKS_LANDLORD_REPORT = {
  subject: "Reported at {{address}}: {{title}}",
  preheader: "What the tenant has told us, and what happens next.",
  mode: "blocks",
  blocks: [
    H("wlr1", "A Repair Has Been Reported"),
    T("wlr2", "Hi {{landlordName}},<br><br>Your tenant has reported a problem at your property. We've logged it, and this is what they told us."),
    FACTS("wlr2a", [["Your property", "{{address}}"], ["Reported", "{{title}} (#{{ref}})"], ["Type", "{{category}}"], ["Urgency", "{{urgency}}"]]),
    T("wlr3", "{{description}}"),
    T("wlr4", "There are two ways forward:<br><strong>You arrange it</strong> with your own contractor, or<br><strong>We arrange it</strong> with one of ours and keep you posted at each step."),
    T("wlr4a", "Reply to this email or ring {{agentPhone}} and tell us which you'd prefer."),
    SP("wlr5", 8),
    T("wlr6", "Thanks,<br>{{agentName}}"),
    FOOT("wlr7", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false, kicker: "Repairs" },
} as const;

/* A price first, before any works order (Sean McMahon, 20 Oct 2026: "ideally
   I want a quotation first, in order to get it approved by the landlord").
   With the tenants and the access since 22 Oct 2026 (Sean: contractors
   "can't arrange to quote and question why they've been asked") - a firm
   that needs a look arranges it with the tenants, the same as a works order. */
export const WORKS_CONTRACTOR_QUOTE_REQUEST = {
  subject: "Quote please: {{title}} at {{address}}",
  preheader: "Could you price this job for us? The tenants and access are below if you need a look.",
  mode: "blocks",
  blocks: [
    H("wqr1", "Could you quote for this?"),
    T("wqr2", "Hi {{contractorGreeting}},<br><br>Could you give us a price for the job below at <strong>{{address}}</strong>? Nothing is booked yet: the landlord approves the quote first, then we send you the works order."),
    T("wqr3", "<strong>{{title}}</strong><br>{{category}} · {{urgency}}<br><br>{{description}}"),
    T("wqr3a", "<strong>Tenants to arrange a look with</strong><br>{{tenantsList}}"),
    T("wqr3b", "<strong>Access notes:</strong> {{access}}"),
    T("wqr4", "If you need to see it before you can price it, arrange a time with the tenants above. If you can't reach them, reply to this email and we'll arrange it."),
    SP("wqr5", 8),
    BTN("wqr6", "Send us your quote", "{{contractorLink}}"),
    SP("wqr7", 8),
    T("wqr8", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}} · {{agentEmail}}"),
    FOOT("wqr9", "You're getting this because you're on The Letting Experts' trades book."),
  ],
  branding: { showSignoff: false },
} as const;

/* Another firm's quote was taken (Sean McMahon, 21 Oct 2026: a quote can go
   to several contractors, and accepting one closes the others politely). Only
   to those still in the running - a firm that said it can't do it is not
   written to again. */
export const WORKS_CONTRACTOR_QUOTE_CLOSED = {
  subject: "Thanks for quoting: {{title}} at {{address}}",
  preheader: "We've gone with another quote this time. Nothing more needed from you.",
  mode: "blocks",
  blocks: [
    H("wqc1", "Thanks for looking at this one"),
    T("wqc2", "Hi {{contractorGreeting}},<br><br>Thank you for your time on <strong>{{title}}</strong> at <strong>{{address}}</strong>. We've gone with another quote on this occasion, so there's nothing more you need to do and the link in our request is now closed."),
    T("wqc3", "We'll be back in touch with the next job that suits you."),
    SP("wqc4", 8),
    T("wqc5", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}} · {{agentEmail}}"),
    FOOT("wqc6", "You're getting this because we asked you to quote for a job for The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/* The contractor's invoice to the landlord, to authorise (Kirstie Mulholland,
   20 Oct 2026): pay it from the rent, pay the contractor direct, or a query.
   Each button opens the landlord's page with that answer picked. */
export const WORKS_LANDLORD_INVOICE = {
  subject: "Invoice to authorise: {{title}} at {{address}}, {{invoice}}",
  preheader: "Pay it from the rent, pay the contractor yourself, or ask us a question.",
  mode: "blocks",
  blocks: [
    H("wli1", "An Invoice to Authorise"),
    T("wli2", "Hi {{landlordName}},<br><br>The contractor has sent their invoice for the work at your property."),
    FACTS("wli2a", [["Your property", "{{address}}"], ["The job", "{{title}} (#{{ref}})"], ["Contractor", "{{contractorName}}"], ["Total", "{{invoice}}"]]),
    T("wli3", "How would you like it paid? Nothing is paid until you tell us."),
    SP("wli4", 4),
    BTN("wli5", "Authorise to pay from the rent", "{{invoicePayLink}}"),
    SP("wli6", 4),
    BTN("wli7", "I'll pay the contractor direct", "{{invoiceDirectLink}}"),
    SP("wli8", 4),
    BTN("wli9", "Raise a query", "{{invoiceQueryLink}}"),
    SP("wli10", 8),
    T("wli11", "The invoice itself is on the same page. If you'd rather talk it through, ring {{agentPhone}}."),
    SP("wli12", 4),
    T("wli13", "Thanks,<br>{{agentName}}"),
    FOOT("wli14", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false, kicker: "Repair invoice" },
} as const;

/* The report to a contractor, asking if they'll take it (step 4). */
export const WORKS_CONTRACTOR_REPORT = {
  subject: "Can you take this? {{title}} at {{address}}",
  preheader: "A job for you if you're free. Reply yes and it's yours.",
  mode: "blocks",
  blocks: [
    H("wcr1", "Can you take this one?"),
    T("wcr2", "Hi {{contractorGreeting}},<br><br>We've got a job at <strong>{{address}}</strong> and you're our first call."),
    T("wcr3", "<strong>{{title}}</strong><br>{{category}} · {{urgency}} · attend by {{dueBy}}<br><br>{{description}}"),
    T("wcr4", "Reply <strong>yes</strong> and we'll send the works order with the tenant's details for access. If you can't, say so and we'll ask somebody else - no hard feelings."),
    SP("wcr5", 8),
    T("wcr6", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}}"),
    FOOT("wcr7", "You're getting this because you're on The Letting Experts' trades book."),
  ],
  branding: { showSignoff: false },
} as const;

/* To the tenant, the moment a contractor says yes (step 5). */
/**
 * To every tenant on a repair once a contractor has it (Lianna, 9 Oct 2026):
 * "send all tenants a notification email so the tenants know One For All
 * will be contacting them... and it's not a scam". Never the works order,
 * which can carry notes for the contractor's eyes only. Not "thanks for
 * reporting it", because in a shared house most of them didn't.
 */
export const WORKS_TENANT_NOTICE = {
  subject: "{{contractorName}} will be in touch about {{title}}",
  preheader: "A contractor is coming to {{address}}. It's genuinely us.",
  mode: "blocks",
  blocks: [
    H("wtn1", "Help Is on the Way"),
    T("wtn2", "Hi {{tenantName}},<br><br>We've asked a contractor to sort a repair at your home."),
    FACTS("wtn7", [
      ["Who's coming", "{{contractorName}}"],
      ["The job", "{{title}} (#{{ref}})"],
      ["Your home", "{{address}}"],
    ]),
    T("wtn3", "They'll contact you directly to arrange a time to come round. If you're ever unsure whether a call is genuine, ring us on {{agentPhone}} and we'll confirm."),
    T("wtn5", "Thanks,<br>{{agentName}}"),
    FOOT("wtn6", "You're getting this because you live at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Repairs", mast: "sage" },
} as const;

/* Planned work - a gas safety, an EICR - with the tick on Plan a
   certificate (James, 10 Oct 2026): the tenants hear who will ring them to
   arrange access, and that it is a check the law asks for. */
export const WORKS_TENANT_PLANNED_NOTICE = {
  subject: "{{contractorName}} will be in touch to arrange access for {{title}}",
  preheader: "A routine check at {{address}}. It's genuinely us.",
  mode: "blocks",
  blocks: [
    H("wtp1", "Time for a Safety Check"),
    T("wtp2", "Hi {{tenantName}},<br><br>A routine safety check on your home is due, and we've asked a contractor to carry it out."),
    FACTS("wtp8", [
      ["The check", "{{title}} (#{{ref}})"],
      ["Who's coming", "{{contractorName}}"],
      ["Your home", "{{address}}"],
    ]),
    T("wtp3", "They'll contact you directly to arrange a time to get access. It's a routine check that keeps the home safe, so please help them find a time that works for you."),
    T("wtp4", "If you're ever unsure whether a call is genuine, ring us on {{agentPhone}} and we'll confirm."),
    T("wtp6", "Thanks,<br>{{agentName}}"),
    FOOT("wtp7", "You're getting this because you live at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Safety check", mast: "sage" },
} as const;

export const WORKS_TENANT_FOUND = {
  subject: "We've found someone for {{title}}",
  preheader: "{{contractorName}} will be in touch to arrange access.",
  mode: "blocks",
  blocks: [
    H("wtf1", "Good News: We've Found Someone"),
    T("wtf2", "Hi {{tenantName}},<br><br>A contractor has said yes to your repair, so it's on its way to being fixed."),
    FACTS("wtf7", [
      ["Who's coming", "{{contractorName}}"],
      ["The job", "{{title}} (#{{ref}})"],
    ]),
    T("wtf3", "They'll be in touch with you directly to arrange a time that suits you both. If you haven't heard from them within a couple of days, reply to this email or ring {{agentPhone}} and we'll chase."),
    T("wtf5", "Speak soon,<br>{{agentName}}"),
    FOOT("wtf6", "You're getting this because you reported a repair at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Repairs", mast: "sage" },
} as const;

/* To the landlord once the date is in (step 6). */
export const WORKS_LANDLORD_ARRANGED = {
  subject: "Arranged: {{title}} at {{address}}, {{scheduledAt}}",
  preheader: "{{contractorName}} is booked. Nothing for you to do.",
  mode: "blocks",
  blocks: [
    H("wla1", "It's Arranged"),
    T("wla2", "Hi {{landlordName}},<br><br>A contractor is booked and the tenant knows to expect them. There's nothing you need to do."),
    FACTS("wla2a", [["Your property", "{{address}}"], ["The job", "{{title}} (#{{ref}})"], ["Contractor", "{{contractorName}}"], ["Booked for", "{{scheduledAt}}"]]),
    T("wla3", "We'll let you know when it's done, and send the invoice once we have the contractor's. Anything over your pre-authorised {{authority}} we'd have asked you about first."),
    SP("wla4", 8),
    T("wla5", "Thanks,<br>{{agentName}}"),
    FOOT("wla6", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false, kicker: "Repairs" },
} as const;

/* To the contractor after the visit: mark it done, drop in the photos and the invoice (step 7). */
export const WORKS_CONTRACTOR_DONE_REQUEST = {
  subject: "#{{ref}} {{title}}: all done? Invoice and photos here",
  preheader: "One page: mark it done, add your photos and your invoice.",
  mode: "blocks",
  blocks: [
    H("wcd1", "All done at {{address}}?"),
    T("wcd2", "Hi {{contractorGreeting}},<br><br>If job #{{ref}}, <strong>{{title}}</strong>, is finished, the button below takes you to one page where you can mark it done, add any photos of the work, and drop in your invoice. Quote #{{ref}} on it and it goes straight to accounts."),
    SP("wcd3", 8),
    BTN("wcd4", "Mark it done and send the invoice", "{{contractorLink}}"),
    SP("wcd5", 8),
    T("wcd6", "If it isn't finished yet, ignore this until it is. If something's stopping you, reply and tell us."),
    SP("wcd7", 8),
    T("wcd8", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}}"),
    FOOT("wcd9", "You're getting this because you're booked on a job for The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/**
 * Chasing a contractor who hasn't come back (Sean McMahon, 26 Oct 2026: "is
 * there any way I can just touch a button and remind that contractor, in a
 * polite way?"). Two of them: a polite reminder, then a final one that says
 * the job goes elsewhere, unpaid, unless they answer within 48 hours. Both
 * carry the job and their own page, where they give a date or mark it done.
 * {{sentOn}}, {{followedUp}}, {{chaseLine}}, {{chaseButton}} and {{cancelBy}}
 * are filled by lib/works-emails.
 */
export const WORKS_CONTRACTOR_CHASE = {
  subject: "Reminder: works order #{{ref}}, {{title}} at {{address}}",
  preheader: "A quick nudge on a job we sent you.",
  mode: "blocks",
  blocks: [
    H("wch1", "Just Checking In on Job #{{ref}}"),
    T("wch2", "Hi {{contractorGreeting}},<br><br>We sent you works order #{{ref}} on {{sentOn}}. {{chaseLine}}"),
    FACTS("wch3", [
      ["The job", "{{title}}"],
      ["Address", "{{address}}"],
      ["Job number", "#{{ref}}"],
      ["Attend by", "{{dueBy}}"],
    ]),
    T("wch4", "<strong>Tenants to arrange access with</strong><br>{{tenantsList}}"),
    SP("wch5", 8),
    BTN("wch6", "{{chaseButton}}", "{{contractorLink}}"),
    SP("wch7", 8),
    T("wch8", "If you can't take it on, that's fine. Just reply and let us know, so we can place it with someone else."),
    T("wch9", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}} · {{agentEmail}}"),
    FOOT("wch10", "You're getting this because you have a job open with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

export const WORKS_CONTRACTOR_CHASE_FINAL = {
  subject: "Final reminder: works order #{{ref}}, {{title}} at {{address}}",
  preheader: "Please come back to us within 48 hours, or we'll have to place this job elsewhere.",
  mode: "blocks",
  blocks: [
    H("wcf1", "Final Reminder: Job #{{ref}}"),
    T("wcf2", "Hi {{contractorGreeting}},<br><br>We sent you works order #{{ref}} on {{sentOn}}{{followedUp}}. {{chaseLine}}"),
    T("wcf3", "<strong>Unless you come back to us within the next 48 hours, by {{cancelBy}}, we'll have to cancel this job with you and place it elsewhere. Once it's cancelled, it won't be paid.</strong>"),
    FACTS("wcf4", [
      ["The job", "{{title}}"],
      ["Address", "{{address}}"],
      ["Job number", "#{{ref}}"],
      ["Attend by", "{{dueBy}}"],
    ]),
    SP("wcf5", 8),
    BTN("wcf6", "{{chaseButton}}", "{{contractorLink}}"),
    SP("wcf7", 8),
    T("wcf8", "A date, marking it done on that page, or a quick reply to say you can't do it is all we need."),
    T("wcf9", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}} · {{agentEmail}}"),
    FOOT("wcf10", "You're getting this because you have a job open with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/* To the tenant when it's marked done: are you happy? (step 8) */
export const WORKS_TENANT_HAPPY = {
  subject: "Was {{title}} sorted?",
  preheader: "One click to tell us. If it isn't right, we'll get somebody back out.",
  mode: "blocks",
  blocks: [
    H("wth1", "All Sorted?"),
    T("wth2", "Hi {{tenantName}},<br><br>We believe {{contractorName}} has been out to {{address}} for <strong>{{title}}</strong> (job #{{ref}}). Are you happy with what's been done? One tap tells us."),
    SP("wth3", 4),
    BTN("wth4", "Yes, all sorted", "{{happyLink}}"),
    SP("wth5", 4),
    BTN("wth6", "No, it isn't right", "{{notHappyLink}}"),
    SP("wth7", 8),
    T("wth8", "A no comes straight to us and somebody from the team will be in touch."),
    T("wth10", "Thanks,<br>{{agentName}}"),
    FOOT("wth11", "You're getting this because a repair was carried out at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Repairs", mast: "sage" },
} as const;

/* ── Inspections (10 Sep 2026) ────────────────────────────────────────────
   Three documents, and the first one is the important one: the tenant is
   being ASKED, not told. It is their home, the notice we owe them is on the
   page, and the answer comes back in their own words through a link of
   their own - so what we hold afterwards is a permission with a timestamp
   rather than a note saying somebody rang. Wording still to go past Michael. */

/* To the tenant: may we come, and which of these dates suits? */
export const INSPECTION_TENANT_ACCESS = {
  subject: "Can we visit {{address}}? Choose a time",
  preheader: "A routine visit to the property. Pick whichever date suits, or tell us none of them do.",
  mode: "blocks",
  blocks: [
    H("ita1", "Can We Pop Round?"),
    T("ita2", "Hi {{tenantName}},<br><br>We look after your home for the landlord, and part of that is calling in every so often to check the property is in good order and to pick up anything that needs putting right."),
    FACTS("ita11", [
      ["Your home", "{{address}}"],
      ["How long it takes", "About {{howLong}}"],
    ]),
    T("ita3", "<strong>These are the times we can do:</strong><br>{{slots}}"),
    SP("ita4", 4),
    BTN("ita5", "Choose my time", "{{accessLink}}"),
    SP("ita6", 8),
    H2("ita12", "Your Home, Your Say"),
    T("ita7", "If none of them work, use the same link to tell us and we'll find another time. You're welcome to be there; if you'd rather not be, let us know on the link and we'll let ourselves in with the keys we hold. <strong>We won't come without your agreement, and you'll get at least {{noticeHours}} hours' notice either way.</strong>"),
    T("ita9", "Thanks,<br>{{agentName}}"),
    FOOT("ita10", "You're getting this because you rent a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Property visit", mast: "sage" },
} as const;

/* To the tenant once a time is agreed: the notice, in writing. */
export const INSPECTION_TENANT_BOOKED = {
  subject: "Visit confirmed: {{whenPretty}}",
  preheader: "Confirming the property visit we agreed.",
  mode: "blocks",
  blocks: [
    H("itb1", "That's in the Diary"),
    T("itb2", "Hi {{tenantName}},<br><br>Confirming your routine property visit. <strong>This email is your written notice of it</strong>, with the date, the time and who's coming right here."),
    FACTS("itb8", [
      ["When", "{{whenPretty}}"],
      ["Who's coming", "{{inspector}}"],
      ["Your home", "{{address}}"],
    ]),
    T("itb3", "There's nothing you need to do. If anything has been bothering you about the property, the visit is a good moment to point it out - or reply to this email now and we'll have it on the list before we arrive."),
    T("itb4", "If the time stops working, reply and we'll move it."),
    /* Their own link (3 Oct 2026): one press says the time works, or asks for another. */
    SP("itb4a", 4),
    BTN("itb4b", "Confirm the time works", "{{accessLink}}"),
    SP("itb5", 8),
    T("itb6", "Speak soon,<br>{{agentName}}"),
    FOOT("itb7", "You're getting this because you rent a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Property visit", mast: "sage" },
} as const;

/* To the landlord once a time is booked (Rhiannon, 21 Oct 2026, ticket
   cf2d722c: she wanted the landlord told as well). Only when the agent ticks
   it on the booking, or presses Email the landlord on the visit. */
export const INSPECTION_LANDLORD_BOOKED = {
  subject: "Property visit booked at {{address}}: {{whenPretty}}",
  preheader: "A routine visit to your property is in the diary.",
  mode: "blocks",
  blocks: [
    H("ilb1", "A Visit Is Booked"),
    T("ilb2", "Hi {{landlordName}},<br><br>Just to let you know, we've booked a routine visit to check your property is being looked after and to pick up anything that needs putting right."),
    FACTS("ilb2a", [["Your property", "{{address}}"], ["When", "{{whenPretty}}"], ["Visiting", "{{inspector}}"]]),
    T("ilb3", "Once we've been round, we'll send you a short report of how the property is and anything that needs doing."),
    T("ilb4", "Anything you'd like us to look at while we're there? Just reply to this email."),
    SP("ilb5", 8),
    T("ilb6", "Thanks,<br>{{agentName}}"),
    FOOT("ilb7", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false, kicker: "Property visit" },
} as const;

/* To the landlord after the visit: how their property is. */
export const INSPECTION_LANDLORD_REPORT = {
  subject: "Property visit at {{address}}: {{conditionWord}}",
  preheader: "How your property is being kept, and anything that needs doing.",
  mode: "blocks",
  blocks: [
    H("ilr1", "We've Been Round"),
    T("ilr2", "Hi {{landlordName}},<br><br>Here's how we found your property. Overall it's <strong>{{conditionWord}}</strong>."),
    FACTS("ilr2a", [["Your property", "{{address}}"], ["Visited", "{{whenPretty}}"], ["Visited by", "{{inspector}}"]]),
    T("ilr3", "{{summary}}"),
    H2("ilr4a", "What We Found"),
    T("ilr4", "{{findings}}"),
    SP("ilr5", 8),
    BTN("ilr6", "See the full report", "{{reportLink}}"),
    SP("ilr7", 8),
    T("ilr8", "Anything marked for you to decide on will come to you as a separate quote before any work starts. Everything else, we'll handle."),
    SP("ilr9", 4),
    T("ilr10", "Thanks,<br>{{agentName}}"),
    FOOT("ilr11", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false, kicker: "Property visit" },
} as const;

/**
 * Landlord: the presentation and the contract, in one email (Susan, 14 Sep 2026).
 *
 * Sent from Prepare and send once the agent has read the deck through, checked
 * the figures and signed their half. It used to be DocuSeal's own invite - their
 * name, their layout, and only the contract - with the presentation going
 * separately through REX. Susan asked for one send, so this is it: the deck to
 * read, and their property file to sign in, from the agent, on our sender.
 *
 * The contract is signed IN their file, never from a link to DocuSeal: the file
 * shows the deck first and then the signature, which is the order James wants
 * (read what you are agreeing to, then agree to it).
 */
export const LANDLORD_CONTRACT_PACK = {
  subject: "Your presentation and contract for {{address}}",
  preheader: "Everything from your appraisal in one place.",
  mode: "blocks",
  blocks: [
    H("lcp1", "Thank You for Having Us Round"),
    /* James, 17 Sep 2026: one short note, the four things as a list, the
       contract mentioned at the end rather than a section of its own. The
       first line of the address only - the whole thing, postcode and all,
       read like a form. */
    T(
      "lcp2",
      "Hi {{firstName}},<br><br>Thank you for showing {{agentName}} round <strong>{{address}}</strong>. As promised, everything from your appraisal is in one place:"
    ),
    T(
      "lcp3",
      "<span style=\"display:block;padding-left:16px;text-indent:-16px\"><span style=\"display:inline-block;width:16px;text-indent:0\">&bull;</span>your presentation</span><span style=\"display:block;padding-left:16px;text-indent:-16px\"><span style=\"display:inline-block;width:16px;text-indent:0\">&bull;</span>our figure of <strong>{{rent}} a month</strong></span><span style=\"display:block;padding-left:16px;text-indent:-16px\"><span style=\"display:inline-block;width:16px;text-indent:0\">&bull;</span>the homes nearby we based it on</span><span style=\"display:block;padding-left:16px;text-indent:-16px\"><span style=\"display:inline-block;width:16px;text-indent:0\">&bull;</span>how we would let and manage your property on {{serviceLine}}</span>"
    ),
    /* Into their property file, not the public deck link (James, 17 Sep
       2026): the file shows the presentation we built for them, with the
       contract under it. The bare /present link opened another copy. */
    BTN("lcp4", "Open your property file", "{{link}}"),
    SP("lcp5", 8),
    T("lcp6", "Your contract is there too, for you to look through. Any questions, just reply. It comes straight to {{agentFirst}}."),
    FOOT("lcp8", "You're getting this because you had a market appraisal with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your appraisal" },
} as const;

/**
 * Landlord: terms of business on their own (12 Oct 2026). A listing made
 * with New listing skipped the appraisal, so there is no presentation to send
 * with the contract: the same send, without the deck, and nothing that says
 * "thank you for having us round" to someone we never visited.
 */
export const LANDLORD_TERMS_ONLY = {
  subject: "Your terms of business for {{address}}",
  preheader: "One thing to sign before {{address}} goes on the market.",
  mode: "blocks",
  blocks: [
    H("lto1", "Your Terms of Business Are Ready"),
    T(
      "lto2",
      "Hi {{firstName}},<br><br>Thank you for choosing The Letting Experts to let your home on {{serviceLine}}. Before we can put it on the market, we need your signature on our terms of business."
    ),
    FACTS("lto9", [["Your home", "{{address}}"], ["Rent", "{{rent}} a month"]]),
    T("lto3", "They are waiting in your property file, along with everything else we hold for the home."),
    BTN("lto4", "Open your property file", "{{link}}"),
    SP("lto5", 8),
    T("lto6", "If anything doesn't look right, just reply and {{agentFirst}} will sort it."),
    FOOT("lto8", "You're getting this because you're letting your property with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Terms of business" },
} as const;

/**
 * Landlord: their agent has replied to a message (17 Sep 2026). The words
 * themselves are in the email, so a short answer needs no click; the button
 * opens the thread on their file to carry on.
 */
export const LANDLORD_MESSAGE_REPLY = {
  subject: "{{agentFirst}} replied about {{address}}",
  preheader: "{{preview}}",
  mode: "blocks",
  blocks: [
    H("lmr1", "A Reply from {{agentFirst}}"),
    T("lmr2", "Hi {{firstName}},<br><br>{{agentFirst}} has replied to your message about <strong>{{address}}</strong>:"),
    /* The reply itself, set off by a thin coral rule - the landlord look's
       accent - so it reads as their words, not ours. */
    T("lmr3", "<span style=\"display:block;border-left:2px solid #eb8c6d;padding:2px 0 2px 16px;color:#141413\">{{bodyHtml}}</span>"),
    BTN("lmr4", "Open your messages", "{{link}}"),
    SP("lmr5", 8),
    T("lmr6", "Or just reply to this email. It comes straight to {{agentFirst}}."),
    FOOT("lmr7", "You're getting this because you messaged The Letting Experts from your property file."),
  ],
  branding: { showSignoff: false, kicker: "A reply" },
} as const;

/**
 * Landlord: the compliance documents, still outstanding (17 Sep 2026).
 *
 * Sent from the end of the take-on write-up, when the photographs are done
 * and the only thing left is their paperwork. Names what is missing: "your
 * documents" is a chore, "your EPC and your gas certificate" is a job.
 */
export const LANDLORD_DOCS_NUDGE = {
  subject: "The paperwork for {{address}}",
  preheader: "{{whatCap}} - and the rest is ready to go.",
  mode: "blocks",
  blocks: [
    H("ldn1", "Just the Paperwork Left"),
    T(
      "ldn2",
      "Hi {{firstName}},<br><br>We've been round and taken the photographs, so the advert is nearly ready. All we need now is your paperwork."
    ),
    FACTS("ldn9", [["Your home", "{{address}}"], ["Still needed", "{{whatCap}}"]]),
    T("ldn3", "You can send them from your property file. Photos straight off your phone are fine."),
    BTN("ldn4", "Send your documents", "{{link}}"),
    SP("ldn5", 8),
    T("ldn6", "Can't find something? Just reply and we'll help you get hold of it."),
    FOOT("ldn8", "You're getting this because The Letting Experts are letting your property."),
  ],
  branding: { showSignoff: false, kicker: "Your documents" },
} as const;

/**
 * Landlord: a nudge to sign the contract (James, 17 Sep 2026).
 *
 * "Give the agent the ability to send a nudge, which will send an email out
 * reminding them to sign the contract ... That should then automate ... It'll
 * open straight into the landlord portal, straight into the contracts." The
 * button signs them in and opens the contract on their file; sent by hand from
 * the appraisal and on its own two, five and nine days after the terms went.
 */
/**
 * Landlord: terms of business sent straight from the OS (lib/terms, 23 Oct
 * 2026). James: "These will land in these guys' inbox, and they can just sign
 * them. It can be a branded email that just goes out." One per person who
 * signs, each with their own link, from the agent's own mailbox.
 */
export const LANDLORD_TERMS_REQUEST = {
  subject: "Your terms of business for {{address}}",
  preheader: "{{agentFirst}} has signed. About five minutes to read and sign yours.",
  mode: "blocks",
  blocks: [
    H("ltr1", "Ready for Your Signature"),
    T("ltr2", "Hi {{firstName}},<br><br>Thank you for choosing The Letting Experts. Your terms of business are ready, and {{agentFirst}} has already signed for us."),
    FACTS("ltr3", [["Your home", "{{address}}"], ["Takes about", "Five minutes"]]),
    T("ltr4", "If there's anything we don't have yet, like your landlord registration or the account for your rent, it asks you first. Then you sign."),
    BTN("ltr5", "Read and sign", "{{link}}"),
    SP("ltr6", 8),
    T("ltr7", "Any questions, just reply. It comes straight to {{agentFirst}}."),
    FOOT("ltr8", "You're getting this because {{agentFirst}} at The Letting Experts sent you your terms of business to sign."),
  ],
  branding: { showSignoff: false, kicker: "Terms of business" },
} as const;

/** Landlord: everybody has signed - their copy (lib/terms, 23 Oct 2026). */
export const LANDLORD_TERMS_SIGNED = {
  subject: "Signed: your terms of business for {{address}}",
  preheader: "Everyone has signed. Your copy is here whenever you need it.",
  mode: "blocks",
  blocks: [
    H("lts1", "All Signed"),
    T("lts2", "Hi {{firstName}},<br><br>That's everything signed, so we're ready to get started."),
    FACTS("lts8", [["Your home", "{{address}}"], ["Terms of business", "Signed by everyone"]]),
    T("lts9", "Your signed copy is kept for you, whenever you need it."),
    BTN("lts3", "View your signed copy", "{{link}}"),
    SP("lts4", 8),
    T("lts5", "{{agentFirst}} will be in touch about what happens next. Any questions before then, just reply."),
    FOOT("lts7", "You're getting this because you signed terms of business with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Terms of business" },
} as const;

export const LANDLORD_CONTRACT_NUDGE = {
  subject: "A reminder: your contract for {{address}}",
  preheader: "It's ready and waiting - about two minutes to sign.",
  mode: "blocks",
  blocks: [
    H("lcn1", "Your Contract Is Ready to Sign"),
    T(
      "lcn2",
      "Hi {{firstName}},<br><br>Just a reminder that your contract is ready and waiting in your property file. {{agentFirst}} has already signed their half."
    ),
    FACTS("lcn9", [["Your home", "{{address}}"], ["Takes about", "Two minutes"]]),
    T("lcn3", "The button takes you straight to it."),
    BTN("lcn4", "Sign your contract", "{{link}}"),
    SP("lcn5", 8),
    T("lcn6", "Any questions, just reply. It comes straight to {{agentFirst}}."),
    FOOT("lcn8", "You're getting this because your terms of business with The Letting Experts are waiting for your signature."),
  ],
  branding: { showSignoff: false, kicker: "Your contract" },
} as const;

/**
 * Landlord: signed, but the property questions are not finished (15 Sep 2026).
 *
 * Susan's call, 14 Sep: the questionnaire "keeps emailing them until it is
 * finished". Three of these at most - two, five and nine days after they
 * signed - and none once the last screen is done. It says how much is left,
 * because "three short parts left" is a reason to finish and "please
 * complete your questionnaire" is a reason to delete.
 */
export const LANDLORD_QUESTIONS_CHASE = {
  subject: "A few questions about {{address}}, then you're done",
  preheader: "{{leftCap}} to go, and it picks up where you left off.",
  mode: "blocks",
  blocks: [
    H("lqc1", "Nearly There"),
    T(
      "lqc2",
      "Hi {{firstName}},<br><br>Thank you again for signing with us. There are just a few things about the home that only you know, like where the stopcock is, how many sets of keys there are and how you'd like pet requests handled."
    ),
    FACTS("lqc11", [["Your home", "{{address}}"], ["Left to go", "{{leftCap}}"], ["Each part takes", "A minute or two"]]),
    T("lqc3", "It picks up exactly where you left off. Your answers are what we use to get the home ready to let."),
    BTN("lqc5", "Carry on with the questions", "{{link}}"),
    SP("lqc7", 8),
    T("lqc6", "The button signs you straight in. It works once and lasts 24 hours. If anything is unclear, just reply and we'll help."),
    FOOT("lqc10", "You're getting this because you signed terms of business with The Letting Experts and your property questions aren't finished yet."),
  ],
  branding: { showSignoff: false, kicker: "Your property" },
} as const;

/**
 * Tenant: a viewing is cancelled, or moved (15 Sep 2026).
 *
 * James: the confirmations are ours, not REX's - and a viewing that is booked
 * by email and cancelled by silence is a person standing on a doorstep. Sent
 * from the Viewings drawer the moment the agent cancels or moves it, on the
 * public sender, reply-to the agent. The landlord sees it on their portal.
 */
export const VIEWING_CANCELLED = {
  subject: "Your viewing at {{address}} is cancelled",
  preheader: "We're sorry for the change. Reply and we'll find another time.",
  mode: "blocks",
  blocks: [
    H("vc1", "Sorry, This Viewing Is Off"),
    T("vc2", "Hi {{firstName}},<br><br>I'm sorry, but this viewing can no longer go ahead."),
    FACTS("vc8", [["The home", "{{address}}"], ["Was booked for", "{{whenPretty}}"]]),
    T("vc3", "{{reasonLine}}"),
    T("vc4", "If you'd still like to see it, or something similar, just reply to this email and I'll find you another time."),
    T("vc6", "Speak soon,<br>{{agentName}}"),
    FOOT("vc7", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Viewing cancelled", mast: "oat" },
} as const;

/* "It's been let" to the other enquirers and viewers, from Take It Offline
   when the agent ticks it (Sean McMahon and Dan Richards, 20 Oct 2026). */
export const LISTING_LET_NOTICE = {
  subject: "{{address}} has now been let",
  preheader: "Thanks for your interest. If you're still looking, we have other homes near you.",
  mode: "blocks",
  blocks: [
    H("ln1", "This One's Been Let"),
    T("ln2", "Hi {{firstName}},<br><br>Thanks for your interest in <strong>{{address}}</strong>. It has now been let, so it's no longer available."),
    T("ln3", "If you're still looking, we have other homes on now. Press the button to see what's near you, or just reply to this email with what you're after and I'll let you know as soon as something similar comes up."),
    /* Show Me Other Homes (James, 22 Oct 2026): their own link, so the agent
       hears that they asked (lib/let-notice moreHomesLink). */
    BTN("ln3b", "Show me other homes", "{{homesUrl}}"),
    SP("ln4", 8),
    T("ln5", "Good luck with the search,<br>{{agentName}}"),
    FOOT("ln6", "You're getting this because you asked about or viewed this home with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Home let", mast: "oat" },
} as const;

export const VIEWING_MOVED = {
  subject: "New time for your viewing at {{address}}",
  preheader: "Your viewing is now {{whenPretty}}.",
  mode: "blocks",
  blocks: [
    H("vm1", "New Time, Same Home"),
    T("vm2", "Hi {{firstName}},<br><br>Your viewing has moved to a new time. {{meetLine}}"),
    FACTS("vm7", [["The home", "{{address}}"], ["New time", "{{whenPretty}}"], ["Moved from", "{{oldWhen}}"]]),
    T("vm3", "The new time is attached as a calendar file, so you can add it in one tap. If it doesn't suit, just reply and we'll sort another."),
    T("vm5", "Speak soon,<br>{{agentName}}"),
    FOOT("vm6", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Viewing moved", mast: "manilla" },
} as const;

/* ── The landlord, told about a viewing (James, 6 Oct 2026) ──────────────
   Optional and by hand: the last-but-one step of booking a viewing asks the
   agent whether to send it, shows it, and sends only on a yes. The portal
   still shows every viewing either way. */
export const LANDLORD_VIEWING_BOOKED = {
  subject: "A viewing is booked at {{address}}",
  preheader: "{{whenPretty}}, and what it needs from you.",
  mode: "blocks",
  blocks: [
    H("lv1", "A Viewing at Your Home"),
    T("lv2", "Hi {{firstName}},<br><br>We've booked a viewing at your home."),
    FACTS("lv8", [["Your home", "{{address}}"], ["When", "{{whenPretty}}"]]),
    T("lv3", "{{meetLine}} If the time is a problem for access, just reply and we'll move it."),
    T("lv4", "We'll let you know how it goes."),
    SP("lv5", 8),
    T("lv6", "{{agentName}}<br>The Letting Experts"),
    FOOT("lv7", "You're getting this because The Letting Experts are letting your property."),
  ],
  branding: { showSignoff: false, kicker: "Viewings" },
} as const;

export const LANDLORD_VIEWING_MOVED = {
  subject: "New time for the viewing at {{address}}",
  preheader: "The viewing is now {{whenPretty}}.",
  mode: "blocks",
  blocks: [
    H("lm1", "A New Time for the Viewing"),
    T("lm2", "Hi {{firstName}},<br><br>The viewing at your home has moved to a new time."),
    FACTS("lm7", [["Your home", "{{address}}"], ["New time", "{{whenPretty}}"], ["Previously", "{{oldWhen}}"]]),
    T("lm3", "{{meetLine}} If the new time is a problem for access, just reply and we'll sort another."),
    SP("lm4", 8),
    T("lm5", "{{agentName}}<br>The Letting Experts"),
    FOOT("lm6", "You're getting this because The Letting Experts are letting your property."),
  ],
  branding: { showSignoff: false, kicker: "Viewings" },
} as const;

/* ── The offer is accepted ────────────────────────────────────────────────

   James, 16 Sep 2026: "I'm happy to copy their emails, and then we can reword
   them and put them in our own thing." So these two are Howard's REX merge
   templates 10978 and 10979, carried across word for word into our own
   letterhead - not rewritten, on purpose. Rewriting them and styling them is
   its own job on the tracker; what this buys today is that the handover stops
   needing REX to send, and the wording does not change under anybody's feet
   while it happens.

   One difference from REX, and it needs James: REX holds no Scottish version
   of either - the only "scotland" in the handover is a flag our own code sets
   from the listing's agreement type. The tenant email therefore takes its
   holding-fee sentence as a variable, and the Scottish wording below is a
   placeholder until somebody who knows Scottish lettings law confirms it. */

/* Rewritten in our own words, 4 Oct 2026 (tracker j10): the same facts and
   the same variables as Howard's 10978, so the handover fills it unchanged. */
export const APPLICATION_ACCEPTED_LANDLORD = {
  subject: "Good news - an application on {{address}} has been accepted",
  preheader: "What was agreed, and what happens next.",
  mode: "blocks",
  blocks: [
    H("aal1", "New Tenants on the Way"),
    T(
      "aal2",
      "Dear {{landlordName}},<br><br>Good news: the application on <strong>{{address}}</strong> has been accepted. Here's what was agreed:"
    ),
    { type: "facts", id: "aal3", text: "{{detailsList}}" },
    H2("aal8", "What Happens Next"),
    T("aal4", "We're starting the tenants' references now and will let you know as soon as they're back. The let goes ahead once the references are through and the tenancy agreement is signed, and we'll keep you posted at each step."),
    T("aal9", "Any questions, just reply or give me a call."),
    SP("aal5", 8),
    T("aal6", "{{agentName}}<br>{{agentPhone}}<br>{{agentEmail}}<br>The Letting Experts"),
    FOOT("aal7", "You're getting this because an application has been accepted on a property we let for you."),
  ],
  branding: { showSignoff: false, kicker: "Your let" },
} as const;

export const APPLICATION_ACCEPTED_TENANT = {
  subject: "Congratulations - your application has been accepted",
  preheader: "Subject to references and contracts. Here is what happens next.",
  mode: "blocks",
  blocks: [
    H("aat1", "Your Application Is Accepted"),
    T(
      "aat2",
      "Dear {{tenantName}},<br><br>Congratulations, the landlord has accepted your application for <strong>{{address}}</strong>, subject to references and contracts. Here's what was agreed:"
    ),
    { type: "facts", id: "aat3", text: "{{detailsList}}" },
    T("aat4", "{{payLine}}"),
    T(
      "aat5",
      "Please do this as soon as you can: until the payment is made and the references are returned, the landlord can still go ahead with another application."
    ),
    T("aat6", "Any questions, just get in touch."),
    SP("aat7", 8),
    T("aat8", "Speak soon,<br>{{agentName}}<br>{{agentPhone}}<br>{{agentEmail}}<br>The Letting Experts"),
    FOOT("aat9", "You're getting this because you applied for a property through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your application" },
} as const;

/* ──────────────── The tenant process: the emails the map planned ────────────────

   James, 16 Sep 2026: build every email the tenant process map still had as
   Planned. One document per step, named after the step on the map
   (lib/process/tenant.ts), in the same block format and on the same customer
   letterhead as the doorway emails above, so the builder owns the words and
   Admin -> Emails can show every one before anything sends it.

   Nothing here sends yet. Each catalogue entry says what it is waiting on.

   Rules for every one of these:
   - one job, one button, and the button goes somewhere a tenant can act;
   - never silence at a dead end: a declined offer, a viewing they didn't like
     and a no-show each end on the next thing to look at;
   - no supplier names and no system names. A tenant deals with The Letting
     Experts, not with whatever we run underneath;
   - lists the send path fills (homes, viewing slots, what is missing) are one
     placeholder of ready-made lines, the way {{detailsList}} already works.

   Shared placeholders: {{firstName}} {{address}} {{agentName}} {{agentPhone}}
   {{agentEmail}} {{link}}. Per email, listed on its own comment. */

/** A single-property enquiry. {{rent}} {{availableLine}} {{moveInList}} {{feesLine}} {{link}} = their passport. No slots: nothing reads an agent's free time yet, so the viewing is arranged by reply. */
export const TENANT_ENQUIRY_REPLY = {
  subject: "About {{address}}",
  preheader: "Is it still available, what it costs to move in, and what happens next.",
  mode: "blocks",
  blocks: [
    H("ter1", "Nice Pick"),
    T("ter2", "Hi {{firstName}},<br><br>Thanks for asking about <strong>{{address}}</strong>. {{availableLine}}"),
    FACTS("ter15", [["The rent", "{{rent}}"]]),
    H2("ter3", "What It Costs to Move In"),
    T("ter4", "{{moveInList}}"),
    T("ter5", "{{feesLine}}"),
    H2("ter6", "What Happens Next"),
    T("ter7", "Before we book any viewings, I'll be in touch to find out a little more about you and what you need, so we only show you homes that suit you. If you have any questions in the meantime, just reply to this email."),
    SP("ter12", 8),
    T("ter13", "Speak soon,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("ter14", "You're getting this because you asked The Letting Experts about a property."),
  ],
  branding: { showSignoff: false, kicker: "Your enquiry" },
} as const

/** Added without a property: the search, not an enquiry. {{onNowLine}} */
export const TENANT_ADDED_WELCOME = {
  subject: "Let's find you a home, {{firstName}}",
  preheader: "Tell us what you're after and we'll send you the homes that fit.",
  mode: "blocks",
  blocks: [
    H("taw1", "Let's Find You a Home"),
    T("taw2", "Hi {{firstName}},<br><br>Thanks for registering with The Letting Experts. I'm {{agentName}}, and I'll be looking after your search. To get going, I just need to know four things:"),
    FACTS("taw4", [
      ["Your budget", "What you'd like to pay each month"],
      ["Where", "The areas you'd like to live in"],
      ["When", "The date you'd like to move"],
      ["Who", "Who's moving in, and any pets"],
    ]),
    T("taw5", "Reply to this email with those and I'll start looking."),
    T("taw9", "{{onNowLine}} As soon as something fits, I'll send it over the same day."),
    SP("taw10", 8),
    T("taw11", "Speak soon,<br>{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("taw12", "You're getting this because you registered to look for a home with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your search" },
} as const;

/**
 * The moment the passport is finished (James, 8 Oct 2026): "a quick, nice,
 * and easy email just to confirm that their profile's all been finished".
 * {{link}} is the tenant sign-in page.
 */
export const TENANT_PASSPORT_THANKS = {
  subject: "Thank you, {{firstName}} - your passport is complete",
  preheader: "Your profile is finished and with your agent. Log in any time.",
  mode: "blocks",
  blocks: [
    H("tpt1", "Stamped and Ready to Rent"),
    T("tpt2", "Hi {{firstName}},<br><br>That's your tenant passport done. Thank you for filling it in. Your profile is complete and it's with {{agentName}} now."),
    T("tpt3", "If you're successful, your agent will be in touch shortly about the next steps."),
    T("tpt4", "You can log in to your account at any time to check or update your details."),
    SP("tpt5", 8),
    BTN("tpt6", "Log in to my account", "{{link}}"),
    SP("tpt7", 8),
    T("tpt8", "Thanks again,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("tpt9", "You're getting this because you completed a tenant passport with The Letting Experts."),
  ],
  branding: {
    showSignoff: false,
    kicker: "Passport complete",
    heroImage: { src: `${SITE}/email/tenant/passport-ready-to-rent.png`, width: 150, alt: "A tenant passport, stamped Ready to Rent" },
  },
} as const;

/**
 * A sitting tenant's login to the tenant portal (Sean McMahon, agent call,
 * 16 Oct 2026: "the way Fixflow sent them their login"). Sent when the agent
 * presses Send out logins, from that agent. No password: the button signs them
 * in, and after that they ask for a fresh link with their email.
 */
export const TENANT_PORTAL_LOGIN = {
  subject: "Your tenant account for {{address}}",
  preheader: "Report a repair online and follow it until it's fixed. No password needed.",
  mode: "blocks",
  blocks: [
    H("tpl1", "Your Account Is All Set"),
    T("tpl2", "Hi {{firstName}},<br><br>{{agentName}} has set up your tenant account with The Letting Experts for <strong>{{address}}</strong>."),
    T("tpl3", "From now on, the quickest way to report a repair is online. Tell us what's wrong and where, and you can follow it all the way from reported to fixed. Your messages to us are kept there too."),
    SP("tpl4", 8),
    BTN("tpl5", "Open my tenant account", "{{link}}"),
    SP("tpl6", 8),
    T("tpl7", "There's no password to remember. The button signs you straight in and works for 14 days. After that, go to <a href=\"{{signInHref}}\">{{signInLink}}</a> at any time and type in this email address, and we'll send you a fresh link."),
    T("tpl8", "{{emergencyLine}}"),
    T("tpl9", "Speak soon,<br>{{agentName}}"),
    FOOT("tpl10", "You're getting this because you rent your home through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your account", mast: "sage" },
} as const;

/**
 * Certificates and documents for the home, sent by a person from the home's
 * page (Josel Banagua, 20 Oct 2026: "send compliance documents directly to
 * tenants through OS, rather than having to manage this separately").
 * docList is the list of what is attached, with the sender's own note under
 * it when they wrote one. Never an invoice: the page offers no invoice to pick.
 */
export const TENANT_DOCUMENTS = {
  subject: "Documents for {{address}}",
  preheader: "Your copies, attached to this email.",
  mode: "blocks",
  blocks: [
    H("tdc1", "Your Paperwork Has Arrived"),
    T("tdc2", "Hi {{firstName}},"),
    /* The sender's own words (20 Oct 2026, Email Certificates): the box on
       the send screen is filled with the default in lib/home-send
       defaultMessage and whatever they change it to goes here, escaped. */
    T("tdc4", "{{messageHtml}}"),
    T("tdc3", "{{docList}}"),
    T("tdc6", "All the best,<br>{{agentName}}"),
    FOOT("tdc7", "You're getting this because you rent your home through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your documents", mast: "sage" },
} as const;

/** Two days after the passport invite, nothing typed. */
export const TENANT_PASSPORT_NUDGE_1 = {
  subject: "Your tenant passport is ready when you are",
  preheader: "About ten minutes, and you can stop and come back to it.",
  mode: "blocks",
  blocks: [
    H("tpn1", "Just a Gentle Nudge"),
    T("tpn2", "Hi {{firstName}},<br><br>Your tenant passport is still here, waiting to be started. It takes about ten minutes, and it saves your place with any home you want to apply for."),
    SP("tpn3", 8),
    BTN("tpn4", "Start my passport", "{{link}}"),
    SP("tpn5", 8),
    T("tpn6", "You can stop part way and pick it up later. <strong>Nothing in it goes to a landlord unless you apply.</strong>"),
    T("tpn8", "Speak soon,<br>The Letting Experts"),
    FOOT("tpn9", "You're getting this because we invited you to start a tenant passport with The Letting Experts."),
  ],
  branding: {
    showSignoff: false,
    kicker: "Tenant passport",
    heroImage: { src: `${SITE}/email/tenant/passport-ready-to-rent.png`, width: 150, alt: "A tenant passport, stamped Ready to Rent" },
  },
} as const;

/**
 * A day after they stopped (lib/passport-reminder, James, 22 Oct 2026): a
 * tenant who started their passport and left it, however it reached them,
 * and Automate passport's day-later reminder, typed into or not. Dan
 * Richards, 21 Oct 2026: it should encourage, never push - "we'd love to get
 * your viewing booked in", not "you must". From the agent, at most two, and
 * none once it is done.
 *
 * The lines that change are filled when it goes: {{introLine}} started or
 * not, and the home they asked about; {{nextLine}} the viewing, or the
 * application when they have one; {{whereLine}} how to get a share code,
 * only when that is where they stopped, otherwise nothing.
 */
export const TENANT_PASSPORT_REMINDER = {
  subject: "Let's get your viewing booked in",
  preheader: "Finish your tenant passport and all that's left is picking a day and time.",
  mode: "blocks",
  blocks: [
    /* Not "Nearly There": the day-later reminder after Automate passport also
       goes to people who haven't typed a word. */
    H("tpr1", "Whenever You're Ready"),
    T("tpr2", "Hi {{firstName}},<br><br>{{introLine}}"),
    T("tpr3", "{{nextLine}}"),
    T("tpr4", "{{whereLine}}"),
    SP("tpr5", 8),
    BTN("tpr6", "{{buttonLabel}}", "{{link}}"),
    SP("tpr7", 8),
    T("tpr8", "Any questions at all, just reply to this email and it comes straight to me."),
    T("tpr9", "Speak soon,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("tpr10", "You're getting this because you asked about a home with The Letting Experts."),
  ],
  branding: {
    showSignoff: false,
    kicker: "Tenant passport",
    heroImage: { src: `${SITE}/email/tenant/passport-ready-to-rent.png`, width: 150, alt: "A tenant passport, stamped Ready to Rent" },
  },
} as const;

/** A week after the invite, still nothing. The why, not a louder reminder. */
export const TENANT_PASSPORT_NUDGE_2 = {
  subject: "One form for every home you apply for",
  preheader: "Why your tenant passport is worth ten minutes now.",
  mode: "blocks",
  blocks: [
    H("tpm1", "One Form, Every Home"),
    T("tpm2", "Hi {{firstName}},<br><br>When you find a home you want, the landlord needs the same things every time: who you are, where you've lived, what you do, and your right to rent in the UK."),
    T("tpm3", "Your tenant passport is where those go, <strong>once</strong>. After that, applying for a home is one tap, and good homes go to the applications that are ready first."),
    SP("tpm4", 8),
    BTN("tpm5", "Start my passport", "{{link}}"),
    SP("tpm6", 8),
    T("tpm7", "It stays yours, and nothing in it is shared with a landlord unless you apply for their property."),
    /* The way out stays (nudge 2 is the last one): somebody who has found
       a home should be able to say so and be glad, not feel chased. */
    T("tpm11", "Found somewhere already? Congratulations. Just reply and let us know."),
    T("tpm9", "All the best,<br>The Letting Experts"),
    FOOT("tpm10", "You're getting this because we invited you to start a tenant passport with The Letting Experts."),
  ],
  branding: {
    showSignoff: false,
    kicker: "Tenant passport",
    heroImage: { src: `${SITE}/email/tenant/passport-ready-to-rent.png`, width: 150, alt: "A tenant passport, stamped Ready to Rent" },
  },
} as const;

/**
 * The homes that fit. {{count}} {{homesList}} {{link}} = their passport.
 *
 * Sent for real from a lead's Email properties (16 Sep 2026). The button is
 * the PASSPORT, not "see the homes": there is no public page for a listing
 * and a lead has no account, so a button to the tenant area would have been a
 * sign-in wall. Choosing is done by reply, which lands with the agent.
 */
export const TENANT_MATCHES = {
  subject: "{{count}} homes that fit what you're after",
  preheader: "Picked for your budget, your area and when you want to move.",
  mode: "blocks",
  blocks: [
    H("tm1", "Picked Out for You"),
    T("tm2", "Hi {{firstName}},<br><br>{{introLine}}"),
    /* The homes as cards (1 Oct 2026): tables, so a raw-HTML block rather
       than a text one, whose paragraph would wrap a table. */
    { type: "code", id: "tm3", html: "{{homesList}}" },
    T("tm4", "Reply with the ones you'd like to see and I'll book them in. Homes like these tend to let within a couple of weeks, so the sooner the better."),
    SP("tm9", 8),
    T("tm10", "Happy hunting,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("tm11", "You're getting this because you're looking for a home with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Homes for you" },
} as const;

/** Four days of silence after the homes went. {{homesList}} */
export const TENANT_MATCHES_AGAIN = {
  subject: "Anything close, {{firstName}}?",
  preheader: "Has anything changed? Here's what has come on since.",
  mode: "blocks",
  blocks: [
    H("tma1", "Anything Catch Your Eye?"),
    T("tma2", "Hi {{firstName}},<br><br>I sent you some homes a few days ago and haven't heard back, so I wanted to check they were the right sort of thing."),
    T("tma3", "If your budget, your area or your moving date has changed, reply and tell me and I'll look again. In the meantime, here's what has come on since:"),
    T("tma4", "{{homesList}}"),
    T("tma5", "Reply with any you'd like to see and I'll book them in."),
    T("tma9", "Found somewhere already? Congratulations. Reply and let me know and I'll stop sending."),
    SP("tma10", 8),
    T("tma11", "Speak soon,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("tma12", "You're getting this because you're looking for a home with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your search" },
} as const

/**
 * New-home alerts from Find a home in the tenant portal (18 Sep 2026). Only
 * ever to somebody who ticked "I'm happy to get emails" on their own search.
 * {{introLine}} says how many and what the search is; {{homesList}} is one
 * line per home, each a link to its page in their tenant area; {{stopLink}}
 * stops the alerts in one click with no sign-in.
 */
export const TENANT_HOME_ALERT = {
  subject: "{{subjectLine}}",
  preheader: "Fresh on the market, and they fit what you're looking for.",
  mode: "blocks",
  blocks: [
    H("tha1", "Fresh on the Market"),
    T("tha2", "Hi {{firstName}},<br><br>{{introLine}}"),
    T("tha3", "{{homesList}}"),
    SP("tha4", 8),
    BTN("tha5", "Show me the homes", "{{link}}"),
    SP("tha6", 8),
    T("tha7", "Like the look of one? Open it and press Enquire, and we'll come back to you with times to view. Good homes tend to go within days."),
    T("tha8", "Want something different? Change your search on Find a home and save the alert again. Or <a href=\"{{stopLink}}\" style=\"color:#56423e\">stop these emails</a>."),
    SP("tha9", 8),
    T("tha10", "Happy hunting,<br>The Letting Experts"),
    FOOT("tha11", "You're getting this because you asked for new-home alerts in your tenant area. You can stop them at any time."),
  ],
  branding: { showSignoff: false, kicker: "Home alert" },
} as const;

/** 7am on the day. {{timePretty}} {{meetLine}} {{contactLine}} {{mapLink}} */
export const VIEWING_REMINDER = {
  subject: "Your viewing today at {{timePretty}}",
  preheader: "{{address}}. Everything you need for this morning.",
  mode: "blocks",
  blocks: [
    H("vr1", "Today's the Day"),
    T("vr2", "Hi {{firstName}},<br><br>Just a reminder that your viewing is today. {{meetLine}}"),
    FACTS("vr11", [["The home", "{{address}}"], ["Time", "Today at {{timePretty}}"]]),
    BTN("vr4", "Show me on a map", "{{mapLink}}"),
    SP("vr5", 8),
    T("vr6", "Bring some photo ID, and any questions about the home or the landlord."),
    T("vr7", "Running late, or can't make it? {{contactLine}}"),
    T("vr9", "Enjoy the viewing,<br>The Letting Experts"),
    FOOT("vr10", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Viewing today", mast: "manilla" },
} as const;

/** Closed as a no-show on the viewing. {{whenPretty}} ("on Tuesday 4 September"). Rebooked by reply. */
export const VIEWING_REBOOK = {
  subject: "Shall we find another time for {{address}}?",
  preheader: "We missed you. Reply with a time that suits.",
  mode: "blocks",
  blocks: [
    H("vb1", "We Missed You"),
    T("vb2", "Hi {{firstName}},<br><br>We missed you at <strong>{{address}}</strong> {{whenPretty}}. No problem, things come up."),
    T("vb3", "If you'd still like to see it, reply with two or three days and times that suit you and I'll book it straight back in."),
    T("vb4", "If it's not the one after all, reply and tell me, and I'll send you others."),
    T("vb6", "Speak soon,<br>{{agentName}}"),
    FOOT("vb7", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your viewing", mast: "manilla" },
} as const

/** Two hours after the viewing. One button, to the feedback page, already signed in. {{viewedOn}} */
export const VIEWING_FEEDBACK = {
  subject: "How was {{address}}?",
  preheader: "A minute, while you still remember it.",
  mode: "blocks",
  blocks: [
    H("vf1", "So, How Was It?"),
    T("vf2", "Hi {{firstName}},<br><br>Thanks for coming to see <strong>{{address}}</strong> {{viewedOn}}. Love it or not, I'd like to hear: it tells me what to send you next, and it tells the landlord how their home is landing."),
    T("vf3", "It takes about a minute. If it's the one, you can put an offer in on the same page."),
    SP("vf4", 8),
    BTN("vf5", "Share what I thought", "{{link}}"),
    SP("vf6", 8),
    /* No {{agentPhone}}: lib/tenant-journey-emails never fills it, so it went
       out as the bare placeholder. */
    T("vf7", "Thanks again,<br>{{agentName}}"),
    FOOT("vf8", "You're getting this because you viewed a property with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your viewing", mast: "manilla" },
} as const;

/** Their feedback says it wasn't for them. {{reasonLine}} {{homesList}} = live homes nearby at a similar rent. */
export const VIEWING_NOT_FOR_THEM = {
  subject: "Not that one. Try these instead",
  preheader: "Homes on now that might suit you better.",
  mode: "blocks",
  blocks: [
    H("vn1", "Not That One? Try These"),
    T("vn2", "Hi {{firstName}},<br><br>Thanks for telling us what you thought of <strong>{{address}}</strong>. {{reasonLine}}"),
    T("vn3", "So here are some others on with us now, nearby and at a similar rent:"),
    T("vn4", "{{homesList}}"),
    T("vn5", "Reply with any you'd like to see and I'll book them in."),
    T("vn7", "Happy hunting,<br>{{agentName}}"),
    FOOT("vn8", "You're getting this because you viewed a property with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "More homes", mast: "oat" },
} as const

/** The application is in. {{offerLine}} {{holdingFeeLine}} */
export const APPLICATION_RECEIVED = {
  subject: "We have your application for {{address}}",
  preheader: "What happens now, and when you'll hear.",
  mode: "blocks",
  blocks: [
    H("ar1", "Got It - Over to the Landlord"),
    T("ar2", "Hi {{firstName}},<br><br>Thank you. Your application for <strong>{{address}}</strong> is in. {{offerLine}}"),
    H2("ar3", "What Happens Now"),
    T("ar4", "We put your application to the landlord. Landlords usually answer within a working day, and <strong>you'll hear from us the moment they do</strong>, whichever way it goes."),
    H2("ar5", "If It's a Yes"),
    T("ar6", "{{holdingFeeLine}} Then referencing starts, so it helps to have these ready:"),
    T("ar7", "Your last three months of payslips, or accounts if you're self-employed<br>Your employer's contact email<br>Your current landlord's contact email<br>The dates of your addresses for the last three years"),
    T("ar8", "If anything has changed since you applied, reply and tell me."),
    SP("ar9", 8),
    T("ar10", "Fingers crossed,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("ar11", "You're getting this because you applied for a property through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your application" },
} as const

/** The landlord said no. {{reasonLine}} {{homesList}} */
export const APPLICATION_DECLINED = {
  subject: "{{address}}: not this time",
  preheader: "The landlord has gone another way. Here's what's next.",
  mode: "blocks",
  blocks: [
    H("ad1", "Not This Time"),
    T("ad2", "Hi {{firstName}},<br><br>I'm sorry to tell you the landlord has decided not to go ahead with your application for <strong>{{address}}</strong>. {{reasonLine}}"),
    T("ad3", "It happens, and it isn't the end of your search. Your details are still with us, so your next application can go in quickly."),
    H2("ad4", "Homes on Now, Nearby"),
    T("ad5", "{{homesList}}"),
    T("ad6", "Reply with any you'd like to see and I'll book it in straight away."),
    SP("ad7", 8),
    T("ad8", "All the best,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("ad9", "You're getting this because you applied for a property through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your application", mast: "oat" },
} as const

/** The landlord said yes. {{holdingFee}} {{holdingFeeLine}} {{weekAheadList}} */
export const APPLICATION_ITS_YOURS = {
  subject: "Good news: the landlord has said yes to {{address}}",
  preheader: "Your offer is accepted. Here's the holding fee and what happens next.",
  mode: "blocks",
  blocks: [
    H("ay1", "It's a Yes from the Landlord"),
    T("ay2", "Hi {{firstName}},<br><br>Congratulations. The landlord has accepted your application for <strong>{{address}}</strong>, subject to references and the tenancy agreement."),
    H2("ay3", "The Holding Fee"),
    T("ay4", "{{holdingFeeLine}}"),
    H2("ay5", "What Happens Next, in Order"),
    T("ay6", "{{weekAheadList}}"),
    SP("ay7", 8),
    BTN("ay8", "See my tenancy", "{{link}}"),
    SP("ay9", 8),
    T("ay10", "Your tenancy page shows where each step is up to, so you never have to ring to find out. If anything is unclear, reply to this email."),
    SP("ay11", 8),
    T("ay12", "Speak soon,<br>{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("ay13", "You're getting this because you applied for a property through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Your new home" },
} as const;

/** Referencing opens. {{adultsLine}} */
export const REFERENCING_INVITE = {
  subject: "Time to get referenced for {{address}}",
  preheader: "What we'll ask, why, and what to have to hand.",
  mode: "blocks",
  blocks: [
    H("ri1", "Next Up: Your References"),
    T("ri2", "Hi {{firstName}},<br><br>The landlord has said yes, so the next step is referencing. It's how the landlord knows the rent is affordable and that you've been a good tenant before."),
    FACTS("ri14", [
      ["The home", "{{address}}"],
      ["How long it takes", "About fifteen minutes"],
      ["Back in", "Usually two or three working days after the last form goes in"],
    ]),
    H2("ri3", "What We'll Ask"),
    T("ri4", "Your employment and income<br>Where you've lived for the last three years, and who your landlords were<br>A credit check<br>Your right to rent in the UK"),
    H2("ri5", "What to Have to Hand"),
    T("ri6", "Your last three months of payslips, or accounts if you're self-employed<br>Your employer's contact email<br>Your current landlord's contact email<br>The dates you moved in and out of each address"),
    SP("ri7", 8),
    BTN("ri8", "Start my referencing", "{{link}}"),
    SP("ri9", 8),
    T("ri10", "{{adultsLine}}"),
    T("ri12", "Speak soon,<br>{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("ri13", "You're getting this because a landlord accepted your application through The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Referencing" },
} as const;

/** To the guarantor, not the tenant. {{tenantName}} {{rent}} {{termLine}} */
export const GUARANTOR_INVITE = {
  subject: "{{tenantName}} has asked you to be their guarantor",
  preheader: "What being a guarantor means, before you say yes.",
  mode: "blocks",
  blocks: [
    H("gi1", "Would You Be a Guarantor?"),
    T("gi2", "Hi {{firstName}},<br><br><strong>{{tenantName}}</strong> is renting a home through The Letting Experts and has named you as their guarantor. {{termLine}}"),
    FACTS("gi14", [
      ["The home", "{{address}}"],
      ["Rent", "{{rent}}"],
    ]),
    H2("gi3", "What It Means"),
    T("gi4", "A guarantor agrees to pay the rent, or the cost of damage beyond the deposit, if the tenant doesn't. It's a real commitment, so please read the agreement properly before you sign anything."),
    H2("gi5", "What Happens Next"),
    T("gi6", "You'll be referenced in your own right, with your own form: your income, your address history and a credit check. <strong>Your details stay private.</strong> {{tenantName}} won't see them."),
    SP("gi7", 8),
    BTN("gi8", "Read more and start", "{{link}}"),
    SP("gi9", 8),
    T("gi10", "If you weren't expecting this, or you'd rather not, reply and tell us. Nothing happens unless you fill in the form."),
    T("gi12", "Thank you,<br>{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("gi13", "You're getting this because a tenant named you as their guarantor with The Letting Experts."),
  ],
  branding: { showSignoff: false, kicker: "Guarantor" },
} as const;

/** Three days, form still empty or part done. {{missingList}} */
export const REFERENCING_CHASE = {
  subject: "Your references for {{address}}",
  preheader: "What's still missing, and why it's worth doing today.",
  mode: "blocks",
  blocks: [
    H("rc1", "Nearly There"),
    T("rc2", "Hi {{firstName}},<br><br>Your referencing for <strong>{{address}}</strong> isn't finished yet. This is what's still missing:"),
    T("rc3", "{{missingList}}"),
    SP("rc4", 8),
    BTN("rc5", "Finish my referencing", "{{link}}"),
    SP("rc6", 8),
    T("rc7", "The landlord is holding the home for you while references are done, so the sooner these are in, the sooner you have a moving date."),
    T("rc8", "Stuck on something, like a landlord who won't reply? Tell me and I'll help."),
    T("rc10", "Speak soon,<br>{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("rc11", "You're getting this because your referencing with The Letting Experts isn't finished yet."),
  ],
  branding: { showSignoff: false, kicker: "Referencing" },
} as const;

/**
 * The holding-fee sentences, in one place, because they are the legal ones.
 *
 * England follows the Tenant Fees Act 2019: at most one week's rent, the
 * tenancy to be agreed within 15 days, credited to the rent or refunded, and
 * kept only for the reasons the Act allows. Scotland takes no holding deposit
 * (lib/handover.ts already sends Scottish tenants no holding-fee sentence), so
 * its lines say what happens instead. Both want James's eye before they send:
 * see the catalogue entries.
 */
export const HOLDING_FEE_WORDING = {
  england: {
    ifYes: (fee: string) =>
      `If the landlord says yes, you'll pay a holding fee of one week's rent, <strong>${fee}</strong>, to take the home off the market. It goes towards your first month's rent.`,
    accepted: (fee: string) =>
      `To take the home off the market while references are done, there is a holding fee of one week's rent: <strong>${fee}</strong>. It goes towards your first month's rent.<br><br>If the landlord pulls out, you get all of it back. It can only be kept if you give us false or misleading information, fail the right-to-rent check, or decide not to go ahead yourself, and the tenancy needs to be agreed within 15 days. If anything changes, tell us straight away.`,
  },
  scotland: {
    ifYes: () => "If the landlord says yes, the home comes off the market while we do references.",
    accepted: () =>
      "There is no holding fee to pay. The home comes off the market while references are done, so please get your forms in as soon as you can.",
  },
} as const;

/** The steps after a yes, in the order the tenancy page shows them. */
export const WEEK_AHEAD_LINES = [
  "<strong>1.</strong> The holding fee, where there is one. We'll send you the link today",
  "<strong>2.</strong> Referencing: about fifteen minutes of forms for each adult moving in",
  "<strong>3.</strong> The landlord's safety checks on the home. Nothing needed from you",
  "<strong>4.</strong> Your deposit, protected in a government-approved scheme",
  "<strong>5.</strong> Signing the tenancy agreement online",
  "<strong>6.</strong> Your first month's rent, in cleared funds before move-in day",
  "<strong>7.</strong> Your keys",
].join("<br>");

/* Scotland takes no holding fee, so its list starts at referencing (Sean,
   29 Oct 2026, 10 Thornton Road: the yes promised a holding-fee link). */
export const WEEK_AHEAD_LINES_SCOTLAND = [
  "<strong>1.</strong> Referencing: about fifteen minutes of forms for each adult moving in",
  "<strong>2.</strong> The landlord's safety checks on the home. Nothing needed from you",
  "<strong>3.</strong> Your deposit, protected in a government-approved scheme",
  "<strong>4.</strong> Signing the tenancy agreement online",
  "<strong>5.</strong> Your first month's rent, in cleared funds before move-in day",
  "<strong>6.</strong> Your keys",
].join("<br>");
