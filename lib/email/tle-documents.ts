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
  subject: "You're in, {{firstName}} 🛫",
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
         which is why the wordmark is still TYPE and still red: it reads
         either way. See FONT_STACKS in render.js. */
      font: "manrope",
      letterSpacing: 0,
      lineHeight: 1.15,
      color: "#E31F36",
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
    H("crl1", "{{certLabel}} renewed"),
    T(
      "crl2",
      "Hi {{firstName}},<br><br>The renewed {{certLabel}} for <strong>{{address}}</strong> is attached. It runs to <strong>{{expires}}</strong>."
    ),
    T(
      "crl3",
      "It is on the property's file and in your landlord portal, so you can pull it up whenever you need it without asking us for it. {{alsoLine}}"
    ),
    SP("crl4", 8),
    DIV("crl5"),
    H2("crl6", "Nothing to do"),
    T(
      "crl7",
      "We hold the date and we chase the next renewal before it lapses. If anything on the certificate looks wrong, reply and we will take it up with the engineer."
    ),
    SP("crl8", 8),
    T("crl9", "The Letting Experts"),
    FOOT("crl10", "You're getting this because you let a property through The Letting Experts."),
  ],
  branding: { showSignoff: false },
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
    H("crt1", "Your home's {{certLabel}}"),
    T(
      "crt2",
      "Hi {{firstName}},<br><br>The {{certLabel}} for <strong>{{address}}</strong> has been renewed, and your copy is attached. It runs to <strong>{{expires}}</strong>."
    ),
    T(
      "crt3",
      "You are entitled to a copy of this, so we send it as soon as it lands rather than waiting to be asked. Nothing is wrong and there is nothing you need to do - keep it with your tenancy papers."
    ),
    SP("crt4", 8),
    DIV("crt5"),
    H2("crt6", "If you cannot open it"),
    T(
      "crt7",
      "Reply to this email and we will send it another way, or print a copy for you."
    ),
    SP("crt8", 8),
    T("crt9", "The Letting Experts"),
    FOOT("crt10", "You're getting this because you rent a home managed by The Letting Experts."),
  ],
  branding: { showSignoff: false },
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
    H("cl1", "{{certLabel}} is due for renewal"),
    T(
      "cl2",
      "Hi {{firstName}},<br><br>The {{certLabel}} for <strong>{{address}}</strong> expires on <strong>{{expires}}</strong>, which is {{daysLeft}} days away."
    ),
    T(
      "cl3",
      "By law the property must hold a valid certificate for as long as it is let. If it lapses we have to stop marketing it, and an existing tenancy can be affected too - so we chase these early rather than close to the date."
    ),
    SP("cl4", 8),
    DIV("cl5"),
    H2("cl6", "What happens next"),
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
      "Either way {{agentName}} is copied in on this and can pick it up with you."
    ),
    SP("cl10", 8),
    T("cl11", "The Letting Experts"),
    FOOT("cl12", "You're getting this because you let a property through The Letting Experts."),
  ],
  branding: { showSignoff: false },
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
    H("tp1", "You're booked in"),
    T(
      "tp2",
      "Hi {{firstName}},<br><br>Your viewing at <strong>{{address}}</strong> is confirmed for <strong>{{whenPretty}}</strong>. {{meetLine}}"
    ),
    SP("tp3", 8),
    DIV("tp4"),
    H2("tp5", "While you're waiting: your tenant passport"),
    T(
      "tp6",
      "If you decide to apply, the same details get asked for every time - who you are, where you've lived, what you do, and your right to rent in the UK. Your passport is where you put them once."
    ),
    T(
      "tp7",
      "It takes about ten minutes, you can stop and come back to it, and it stays yours. <strong>Nothing in it is shared with a landlord unless you apply for their property.</strong>"
    ),
    SP("tp8", 8),
    BTN("tp9", "Start your passport", "{{link}}"),
    SP("tp10", 8),
    T(
      "tp11",
      "Doing it now means that if this is the one, your application goes in the same day rather than waiting on documents. Good properties move quickly, and the completed applications go first."
    ),
    SP("tp12", 8),
    T("tp13", "The Letting Experts"),
    FOOT("tp14", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false },
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
    H("ls1", "Here is your link"),
    T(
      "ls2",
      "Hi {{firstName}},<br><br>Open the button below and you are into your property file with The Letting Experts: your properties, your certificates and everything happening on them."
    ),
    SP("ls3", 8),
    BTN("ls4", "Open my property file", "{{link}}"),
    SP("ls5", 8),
    T("ls6", "The link works once and lasts 24 hours. If it has run out, ask for another from the sign-in page."),
    T("ls7", "If you didn't ask for this, you can ignore it. Nothing happens unless the link is opened."),
    SP("ls8", 8),
    T("ls9", "The Letting Experts"),
    FOOT("ls10", "You're getting this because a sign-in was requested for this address at The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

export const TENANT_SIGN_IN = {
  subject: "Your link to your tenancy",
  preheader: "One click and you are in. The link works once and lasts a day.",
  mode: "blocks",
  blocks: [
    H("ts1", "Here is your link"),
    T(
      "ts2",
      "Hi {{firstName}},<br><br>Open the button below and you are into your account with The Letting Experts: where your tenancy is up to, what happens next, and your passport."
    ),
    SP("ts3", 8),
    BTN("ts4", "Open my account", "{{link}}"),
    SP("ts5", 8),
    T("ts6", "The link works once and lasts 24 hours. If it has run out, ask for another from the sign-in page."),
    T("ts7", "If you didn't ask for this, you can ignore it. Nothing happens unless the link is opened."),
    SP("ts8", 8),
    T("ts9", "The Letting Experts"),
    FOOT("ts10", "You're getting this because a sign-in was requested for this address at The Letting Experts."),
  ],
  branding: { showSignoff: false },
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
    T("wc2", "Hi {{contractorGreeting}},<br><br>Please could you attend the following for us. Reply to this email with your earliest date, or a quote if the job needs one first."),
    T("wc3", "<strong>{{title}}</strong><br>{{address}}<br>{{category}} · {{urgency}} · attend by {{dueBy}}"),
    T("wc4", "{{description}}"),
    T("wc5", "<strong>Access:</strong> {{access}}<br><strong>Tenant:</strong> {{tenantName}} {{tenantPhone}}"),
    SP("wc6", 8),
    T("wc7", "Please quote works order #{{ref}} on your invoice. Anything over the landlord's pre-authorised spend needs their yes before you go ahead, so send a quote first if it looks like more than a call-out."),
    SP("wc8", 8),
    T("wc9", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}} · {{agentEmail}}"),
    FOOT("wc10", "You're getting this because you're on The Letting Experts' trades book."),
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
    H("wt1", "We've logged it"),
    T("wt2", "Hi {{tenantName}},<br><br>Thanks for letting us know about <strong>{{title}}</strong> at {{address}}. It's logged as job #{{ref}} and we're on it."),
    T("wt3", "We've marked it <strong>{{urgency}}</strong>, which means we aim to have somebody attend by <strong>{{dueBy}}</strong>. We'll email you the moment a contractor is booked, with the date and who to expect."),
    T("wt4", "If it gets worse, or it's an emergency - no heating, a leak you can't stop, no power - ring us straight away on {{agentPhone}} rather than waiting for the email."),
    SP("wt5", 8),
    T("wt6", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("wt7", "You're getting this because you reported a repair at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

export const WORKS_TENANT_BOOKED = {
  subject: "{{contractorName}} is coming on {{scheduledAt}}",
  preheader: "Who to expect, and when.",
  mode: "blocks",
  blocks: [
    H("wtb1", "Booked: {{scheduledAt}}"),
    T("wtb2", "Hi {{tenantName}},<br><br><strong>{{contractorName}}</strong> is booked to attend {{address}} on <strong>{{scheduledAt}}</strong> for <strong>{{title}}</strong> (job #{{ref}})."),
    T("wtb3", "Please make sure somebody can let them in. If that time doesn't work, reply to this email or ring {{agentPhone}} and we'll move it."),
    SP("wtb4", 8),
    T("wtb5", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("wtb6", "You're getting this because a contractor is booked at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

export const WORKS_TENANT_DONE = {
  subject: "Done: {{title}} at {{address}}",
  preheader: "Tell us if it isn't right.",
  mode: "blocks",
  blocks: [
    H("wtd1", "That's done"),
    T("wtd2", "Hi {{tenantName}},<br><br>Job #{{ref}}, <strong>{{title}}</strong>, is marked done: {{completionNote}}"),
    T("wtd3", "If it isn't right, or the problem comes back, reply to this email and we'll get somebody back out."),
    SP("wtd4", 8),
    T("wtd5", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("wtd6", "You're getting this because a repair was carried out at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

export const WORKS_LANDLORD_APPROVAL = {
  subject: "Your approval needed: {{title}} at {{address}}, {{quote}}",
  preheader: "A quote over your pre-authorised spend. One reply and it goes ahead.",
  mode: "blocks",
  blocks: [
    H("wl1", "A quote for your approval"),
    T("wl2", "Hi {{landlordName}},<br><br>We've had a quote of <strong>{{quote}}</strong> for <strong>{{title}}</strong> at {{address}} (job #{{ref}}). That's over the {{authority}} you've pre-authorised us to spend, so we need your yes before it goes ahead."),
    T("wl3", "{{description}}"),
    T("wl4", "Reply <strong>yes</strong> to this email, or ring {{agentPhone}}, and we'll book it in. If you'd rather get another quote, say so and we will."),
    SP("wl5", 8),
    T("wl6", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("wl7", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false },
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
    H("in1", "Invoice {{number}}"),
    T("in2", "Hi {{toName}},<br><br>Please find your invoice for <strong>{{reference}}</strong>{{address}}. The total is <strong>{{total}}</strong>, due by <strong>{{dueDate}}</strong>."),
    SP("in3", 8),
    BTN("in4", "View the invoice", "{{link}}"),
    SP("in5", 8),
    T("in6", "Payment details are on the invoice. If anything on it isn't right, reply to this email and we'll sort it before you pay."),
    SP("in7", 8),
    T("in8", "Thanks,<br>{{agentName}}<br>The Letting Experts · {{agentPhone}}"),
    FOOT("in9", "You're getting this because The Letting Experts have raised an invoice to you."),
  ],
  branding: { showSignoff: false },
} as const;

/* The report to the landlord, the moment it is logged (workflow step 1). */
export const WORKS_LANDLORD_REPORT = {
  subject: "Reported at {{address}}: {{title}}",
  preheader: "What the tenant has told us, and what happens next.",
  mode: "blocks",
  blocks: [
    H("wlr1", "A repair has been reported"),
    T("wlr2", "Hi {{landlordName}},<br><br>Your tenant has reported the following at <strong>{{address}}</strong>. We've logged it as job #{{ref}} and marked it <strong>{{urgency}}</strong>."),
    T("wlr3", "<strong>{{title}}</strong><br>{{category}}<br><br>{{description}}"),
    T("wlr4", "There are two ways we can go from here: you arrange it with your own contractor, or we arrange it for you with one of ours and keep you posted at each step. Reply to this email or ring {{agentPhone}} and tell us which you'd prefer."),
    SP("wlr5", 8),
    T("wlr6", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("wlr7", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false },
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
export const WORKS_TENANT_FOUND = {
  subject: "We've found someone for {{title}}",
  preheader: "{{contractorName}} will be in touch to arrange access.",
  mode: "blocks",
  blocks: [
    H("wtf1", "We've found someone"),
    T("wtf2", "Hi {{tenantName}},<br><br>Good news on <strong>{{title}}</strong> (job #{{ref}}): <strong>{{contractorName}}</strong> has agreed to do the work."),
    T("wtf3", "They'll be in touch with you directly to arrange a time that suits you both. If you haven't heard from them within a couple of days, reply to this email or ring {{agentPhone}} and we'll chase."),
    SP("wtf4", 8),
    T("wtf5", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("wtf6", "You're getting this because you reported a repair at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/* To the landlord once the date is in (step 6). */
export const WORKS_LANDLORD_ARRANGED = {
  subject: "Arranged: {{title}} at {{address}}, {{scheduledAt}}",
  preheader: "{{contractorName}} is booked. Nothing for you to do.",
  mode: "blocks",
  blocks: [
    H("wla1", "It's arranged"),
    T("wla2", "Hi {{landlordName}},<br><br><strong>{{contractorName}}</strong> is booked to attend {{address}} on <strong>{{scheduledAt}}</strong> for <strong>{{title}}</strong> (job #{{ref}}). The tenant knows to expect them."),
    T("wla3", "We'll let you know when it's done, and send the invoice once we have the contractor's. Anything over your pre-authorised {{authority}} we'd have asked you about first."),
    SP("wla4", 8),
    T("wla5", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("wla6", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false },
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

/* To the tenant when it's marked done: are you happy? (step 8) */
export const WORKS_TENANT_HAPPY = {
  subject: "Was {{title}} sorted?",
  preheader: "One click to tell us. If it isn't right, we'll get somebody back out.",
  mode: "blocks",
  blocks: [
    H("wth1", "Was it sorted?"),
    T("wth2", "Hi {{tenantName}},<br><br>We believe {{contractorName}} has been out to {{address}} for <strong>{{title}}</strong> (job #{{ref}}). Could you tell us whether you're happy with what's been done?"),
    SP("wth3", 8),
    BTN("wth4", "Yes, all sorted", "{{happyLink}}"),
    SP("wth5", 4),
    BTN("wth6", "No, it isn't right", "{{notHappyLink}}"),
    SP("wth7", 8),
    T("wth8", "A no comes straight to us and somebody from the team will be in touch."),
    SP("wth9", 8),
    T("wth10", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("wth11", "You're getting this because a repair was carried out at a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false },
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
    H("ita1", "Can we pop round?"),
    T("ita2", "Hi {{tenantName}},<br><br>We look after {{address}} for the landlord, and part of that is calling in every so often to check the property is in good order and to pick up anything that needs putting right. It usually takes about {{howLong}}."),
    T("ita3", "<strong>These are the times we can do:</strong><br>{{slots}}"),
    SP("ita4", 8),
    BTN("ita5", "Choose a time", "{{accessLink}}"),
    SP("ita6", 8),
    T("ita7", "If none of them work, use the same link to tell us - we will find another time. You are welcome to be there; if you would rather not be, let us know on the link and we will let ourselves in with the keys we hold. We will not come without your agreement, and you will get at least {{noticeHours}} hours notice either way."),
    SP("ita8", 8),
    T("ita9", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("ita10", "You're getting this because you rent a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/* To the tenant once a time is agreed: the notice, in writing. */
export const INSPECTION_TENANT_BOOKED = {
  subject: "Visit confirmed: {{whenPretty}}",
  preheader: "Confirming the property visit we agreed.",
  mode: "blocks",
  blocks: [
    H("itb1", "That's in the diary"),
    T("itb2", "Hi {{tenantName}},<br><br>Confirming that <strong>{{inspector}}</strong> will call at {{address}} on <strong>{{whenPretty}}</strong> for a routine property visit. This email is your written notice of it."),
    T("itb3", "There is nothing you need to do. If anything has been bothering you about the property, that visit is a good moment to point it out - or reply to this email now and we will have it on the list before we arrive."),
    T("itb4", "If the time stops working, reply and we will move it."),
    SP("itb5", 8),
    T("itb6", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("itb7", "You're getting this because you rent a property managed by The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/* To the landlord after the visit: how their property is. */
export const INSPECTION_LANDLORD_REPORT = {
  subject: "Property visit at {{address}}: {{conditionWord}}",
  preheader: "How your property is being kept, and anything that needs doing.",
  mode: "blocks",
  blocks: [
    H("ilr1", "We've been round"),
    T("ilr2", "Hi {{landlordName}},<br><br>{{inspector}} visited {{address}} on {{whenPretty}}. Overall the property is <strong>{{conditionWord}}</strong>."),
    T("ilr3", "{{summary}}"),
    T("ilr4", "<strong>What we found</strong><br>{{findings}}"),
    SP("ilr5", 8),
    BTN("ilr6", "See the full report", "{{reportLink}}"),
    SP("ilr7", 8),
    T("ilr8", "Anything marked for you to decide on will come to you as a separate quote before any work starts. Everything else we will handle."),
    SP("ilr9", 8),
    T("ilr10", "Thanks,<br>{{agentName}}<br>The Letting Experts"),
    FOOT("ilr11", "You're getting this because The Letting Experts manage this property for you."),
  ],
  branding: { showSignoff: false },
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
    H("lcp1", "Thank you for having us round"),
    /* James, 17 Sep 2026: one short note, the four things as a list, the
       contract mentioned at the end rather than a section of its own. The
       first line of the address only - the whole thing, postcode and all,
       read like a form. */
    T(
      "lcp2",
      "Hi {{firstName}},<br><br>Thank you for showing {{agentName}} round <strong>{{address}}</strong>. As promised, everything you need is in one place:"
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
    T(
      "lcp6",
      "You will also find the contract there for you to look through. Let {{agentFirst}} know if you have any questions - just reply to this email."
    ),
    T("lcp7", "The Letting Experts"),
    FOOT("lcp8", "You're getting this because you had a market appraisal with The Letting Experts."),
  ],
  branding: { showSignoff: false },
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
    H("lmr1", "A reply from {{agentFirst}}"),
    T("lmr2", "Hi {{firstName}},<br><br>{{agentFirst}} has replied to your message about <strong>{{address}}</strong>:"),
    T("lmr3", "<span style=\"display:block;border-left:3px solid #e7ddd9;padding:4px 0 4px 14px;color:#3b3b3c\">{{bodyHtml}}</span>"),
    BTN("lmr4", "Open your messages", "{{link}}"),
    SP("lmr5", 8),
    T("lmr6", "The Letting Experts"),
    FOOT("lmr7", "You're getting this because you messaged The Letting Experts from your property file."),
  ],
  branding: { showSignoff: false },
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
      "Hi {{firstName}},<br><br>We have been round and taken the photographs for <strong>{{address}}</strong>, so the advert is nearly ready. The last thing we need from you is {{what}}."
    ),
    T("ldn3", "You can send them from your property file - photographs of them are fine, straight off your phone."),
    BTN("ldn4", "Send your documents", "{{link}}"),
    SP("ldn5", 8),
    T("ldn6", "Anything you cannot find, reply to this email and we will help you get hold of it."),
    T("ldn7", "The Letting Experts"),
    FOOT("ldn8", "You're getting this because The Letting Experts are letting your property."),
  ],
  branding: { showSignoff: false },
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
export const LANDLORD_CONTRACT_NUDGE = {
  subject: "A reminder: your contract for {{address}}",
  preheader: "It's ready and waiting - about two minutes to sign.",
  mode: "blocks",
  blocks: [
    H("lcn1", "Your contract is ready to sign"),
    T(
      "lcn2",
      "Hi {{firstName}},<br><br>Just a reminder that your contract for <strong>{{address}}</strong> is ready and waiting in your property file. {{agentFirst}} has already signed their half."
    ),
    T("lcn3", "It takes about two minutes, and the button takes you straight to it."),
    BTN("lcn4", "Sign your contract", "{{link}}"),
    SP("lcn5", 8),
    T("lcn6", "Any questions at all, just reply to this email and it comes straight to {{agentFirst}}."),
    T("lcn7", "The Letting Experts"),
    FOOT("lcn8", "You're getting this because your terms of business with The Letting Experts are waiting for your signature."),
  ],
  branding: { showSignoff: false },
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
    H("lqc1", "Nearly there"),
    T(
      "lqc2",
      "Hi {{firstName}},<br><br>Thank you again for signing with us for <strong>{{address}}</strong>. There are just a few things about the property that only you know - where the stopcock is, how many sets of keys there are, how you'd like pet requests handled - and there are <strong>{{left}}</strong> left to go."
    ),
    T(
      "lqc3",
      "It picks up exactly where you left off, and each part takes a minute or two. We use the answers to get the home ready to let, so finishing them is what lets us get going."
    ),
    SP("lqc4", 8),
    BTN("lqc5", "Carry on with the questions", "{{link}}"),
    T("lqc6", "That button signs you straight in. It works once and lasts 24 hours."),
    SP("lqc7", 8),
    T("lqc8", "If anything is unclear, just reply to this email and we'll help."),
    T("lqc9", "The Letting Experts"),
    FOOT("lqc10", "You're getting this because you signed terms of business with The Letting Experts and your property questions aren't finished yet."),
  ],
  branding: { showSignoff: false },
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
    H("vc1", "Your viewing is cancelled"),
    T(
      "vc2",
      "Hi {{firstName}},<br><br>I'm sorry, but your viewing at <strong>{{address}}</strong> on <strong>{{whenPretty}}</strong> can no longer go ahead."
    ),
    T("vc3", "{{reasonLine}}"),
    T("vc4", "If you'd still like to see it, or something similar, just reply to this email and I'll find you another time."),
    SP("vc5", 8),
    T("vc6", "{{agentName}}<br>The Letting Experts"),
    FOOT("vc7", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

export const VIEWING_MOVED = {
  subject: "New time for your viewing at {{address}}",
  preheader: "Your viewing is now {{whenPretty}}.",
  mode: "blocks",
  blocks: [
    H("vm1", "Your viewing has a new time"),
    T(
      "vm2",
      "Hi {{firstName}},<br><br>Your viewing at <strong>{{address}}</strong> has moved from {{oldWhen}} to <strong>{{whenPretty}}</strong>. {{meetLine}}"
    ),
    T("vm3", "The new time is attached as a calendar file, so you can add it in one tap. If it doesn't suit, just reply and we'll sort another."),
    SP("vm4", 8),
    T("vm5", "{{agentName}}<br>The Letting Experts"),
    FOOT("vm6", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false },
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

export const APPLICATION_ACCEPTED_LANDLORD = {
  subject: "New application accepted - {{address}}",
  preheader: "The application on your property has been accepted. Here are the details.",
  mode: "blocks",
  blocks: [
    H("aal1", "Application accepted"),
    T(
      "aal2",
      "Dear {{landlordName}},<br><br>Congratulations. The following application has now been accepted on your property at <strong>{{address}}</strong>:"
    ),
    T("aal3", "{{detailsList}}"),
    T("aal4", "I will now begin the reference checks on the tenants, and will update you in due course with our findings."),
    SP("aal5", 8),
    T("aal6", "{{agentName}}<br>{{agentPhone}}<br>{{agentEmail}}<br>The Letting Experts"),
    FOOT("aal7", "You're getting this because an application has been accepted on a property we let for you."),
  ],
  branding: { showSignoff: false },
} as const;

export const APPLICATION_ACCEPTED_TENANT = {
  subject: "Congratulations - your application has been accepted",
  preheader: "Subject to references and contracts. Here is what happens next.",
  mode: "blocks",
  blocks: [
    H("aat1", "Your application has been accepted"),
    T(
      "aat2",
      "Dear {{tenantName}},<br><br>Congratulations, the landlord has accepted your application for <strong>{{address}}</strong>, subject to references and contracts. Please find the agreed details below:"
    ),
    T("aat3", "{{detailsList}}"),
    T("aat4", "{{payLine}}"),
    T(
      "aat5",
      "Please do this as a matter of urgency: until the payment is made and the references are returned, the landlord reserves the right to progress another application."
    ),
    T("aat6", "If you have any questions, please get in touch."),
    SP("aat7", 8),
    T("aat8", "{{agentName}}<br>{{agentPhone}}<br>{{agentEmail}}<br>The Letting Experts"),
    FOOT("aat9", "You're getting this because you applied for a property through The Letting Experts."),
  ],
  branding: { showSignoff: false },
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
  preheader: "Is it still available, what it costs to move in, and how to see it.",
  mode: "blocks",
  blocks: [
    H("ter1", "Thanks for your enquiry"),
    T("ter2", "Hi {{firstName}},<br><br>Thanks for asking about <strong>{{address}}</strong>. {{availableLine}} The rent is <strong>{{rent}}</strong>."),
    H2("ter3", "What it costs to move in"),
    T("ter4", "{{moveInList}}"),
    T("ter5", "{{feesLine}}"),
    H2("ter6", "Seeing it"),
    T("ter7", "Reply with two or three days and times that suit you and I'll book the viewing in. Evenings and Saturdays are fine."),
    H2("ter8", "Ready to apply if it's the one"),
    T("ter9", "Your tenant passport holds the details every landlord asks for. Fill it in once and it answers every application you make with us. Nothing in it goes to a landlord unless you apply."),
    SP("ter10", 8),
    BTN("ter11", "Start my passport", "{{link}}"),
    SP("ter12", 8),
    T("ter13", "{{agentName}}<br>The Letting Experts"),
    FOOT("ter14", "You're getting this because you asked The Letting Experts about a property."),
  ],
  branding: { showSignoff: false },
} as const

/** Added without a property: the search, not an enquiry. {{onNowLine}} */
export const TENANT_ADDED_WELCOME = {
  subject: "Let's find you a home, {{firstName}}",
  preheader: "Tell us what you're after and we'll send you the homes that fit.",
  mode: "blocks",
  blocks: [
    H("taw1", "Let's find you a home"),
    T("taw2", "Hi {{firstName}},<br><br>Thanks for registering with The Letting Experts. I'm {{agentName}}, and I'll be looking after your search."),
    H2("taw3", "What we need to know"),
    T("taw4", "<strong>Your budget</strong>, per month<br><strong>Where</strong> you'd like to live<br><strong>When</strong> you want to move<br><strong>Who</strong> is moving in, and any pets"),
    T("taw5", "It takes about ten minutes in your tenant passport, and the same details then answer every application you make with us. Nothing in it goes to a landlord unless you apply."),
    SP("taw6", 8),
    BTN("taw7", "Tell us what you're after", "{{link}}"),
    SP("taw8", 8),
    T("taw9", "{{onNowLine}} As soon as something fits, I'll send it over the same day."),
    SP("taw10", 8),
    T("taw11", "{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("taw12", "You're getting this because you registered to look for a home with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/** Two days after the passport invite, nothing typed. */
export const TENANT_PASSPORT_NUDGE_1 = {
  subject: "Your tenant passport is ready when you are",
  preheader: "About ten minutes, and you can stop and come back to it.",
  mode: "blocks",
  blocks: [
    H("tpn1", "Ten minutes, once"),
    T("tpn2", "Hi {{firstName}},<br><br>Just a nudge: your tenant passport is still waiting to be started. It takes about ten minutes, and it saves your place with any home you want to apply for."),
    SP("tpn3", 8),
    BTN("tpn4", "Start my passport", "{{link}}"),
    SP("tpn5", 8),
    T("tpn6", "You can stop part way and pick it up later. Nothing in it goes to a landlord unless you apply."),
    SP("tpn7", 8),
    T("tpn8", "The Letting Experts"),
    FOOT("tpn9", "You're getting this because we invited you to start a tenant passport with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/** A week after the invite, still nothing. The why, not a louder reminder. */
export const TENANT_PASSPORT_NUDGE_2 = {
  subject: "One form for every home you apply for",
  preheader: "Why your tenant passport is worth ten minutes now.",
  mode: "blocks",
  blocks: [
    H("tpm1", "One form, every application"),
    T("tpm2", "Hi {{firstName}},<br><br>When you find a home you want, the landlord needs the same things every time: who you are, where you've lived, what you do, and your right to rent in the UK."),
    T("tpm3", "Your tenant passport is where those go, <strong>once</strong>. After that, applying for a home is one tap, and good homes go to the applications that are ready first."),
    SP("tpm4", 8),
    BTN("tpm5", "Start my passport", "{{link}}"),
    SP("tpm6", 8),
    T("tpm7", "It stays yours, and nothing in it is shared with a landlord unless you apply for their property. If you've found somewhere already, just reply and let us know."),
    SP("tpm8", 8),
    T("tpm9", "The Letting Experts"),
    FOOT("tpm10", "You're getting this because we invited you to start a tenant passport with The Letting Experts."),
  ],
  branding: { showSignoff: false },
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
    H("tm1", "Homes that fit"),
    T("tm2", "Hi {{firstName}},<br><br>{{introLine}}"),
    T("tm3", "{{homesList}}"),
    T("tm4", "Reply with the ones you'd like to see and I'll book them in. Homes like these tend to let within a couple of weeks, so the sooner the better."),
    H2("tm5", "Ready to apply the day you find it"),
    T("tm6", "Your tenant passport holds the details every landlord asks for. Fill it in once, and if one of these is the one, your application goes in the same day. Nothing in it is shared unless you apply."),
    SP("tm7", 8),
    BTN("tm8", "Start my passport", "{{link}}"),
    SP("tm9", 8),
    T("tm10", "{{agentName}}<br>The Letting Experts"),
    FOOT("tm11", "You're getting this because you're looking for a home with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/** Four days of silence after the homes went. {{homesList}} */
export const TENANT_MATCHES_AGAIN = {
  subject: "Anything close, {{firstName}}?",
  preheader: "Has anything changed? Here's what has come on since.",
  mode: "blocks",
  blocks: [
    H("tma1", "Anything close?"),
    T("tma2", "Hi {{firstName}},<br><br>I sent you some homes a few days ago and haven't heard back, so I wanted to check they were the right sort of thing."),
    T("tma3", "If your budget, your area or your moving date has changed, reply and tell me and I'll look again. In the meantime, here's what has come on since:"),
    T("tma4", "{{homesList}}"),
    T("tma5", "Reply with any you'd like to see and I'll book them in."),
    SP("tma6", 8),
    BTN("tma7", "Start my passport", "{{link}}"),
    SP("tma8", 8),
    T("tma9", "If you've found somewhere already, congratulations. Reply and let me know and I'll stop sending."),
    SP("tma10", 8),
    T("tma11", "{{agentName}}<br>The Letting Experts"),
    FOOT("tma12", "You're getting this because you're looking for a home with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const

/** 7am on the day. {{timePretty}} {{meetLine}} {{contactLine}} {{mapLink}} */
export const VIEWING_REMINDER = {
  subject: "Your viewing today at {{timePretty}}",
  preheader: "{{address}}. Everything you need for this morning.",
  mode: "blocks",
  blocks: [
    H("vr1", "See you today"),
    T("vr2", "Hi {{firstName}},<br><br>A reminder that you're viewing <strong>{{address}}</strong> today at <strong>{{timePretty}}</strong>. {{meetLine}}"),
    SP("vr3", 8),
    BTN("vr4", "Open it on a map", "{{mapLink}}"),
    SP("vr5", 8),
    T("vr6", "Bring some photo ID, and any questions about the home or the landlord."),
    T("vr7", "Running late, or can't make it? {{contactLine}}"),
    SP("vr8", 8),
    T("vr9", "The Letting Experts"),
    FOOT("vr10", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/** Closed as a no-show on the viewing. {{whenPretty}} ("on Tuesday 4 September"). Rebooked by reply. */
export const VIEWING_REBOOK = {
  subject: "Shall we find another time for {{address}}?",
  preheader: "We missed you. Reply with a time that suits.",
  mode: "blocks",
  blocks: [
    H("vb1", "Shall we find another time?"),
    T("vb2", "Hi {{firstName}},<br><br>We missed you at <strong>{{address}}</strong> {{whenPretty}}. No problem, things come up."),
    T("vb3", "If you'd still like to see it, reply with two or three days and times that suit you and I'll book it straight back in."),
    T("vb4", "If it's not the one after all, reply and tell me, and I'll send you others."),
    SP("vb5", 8),
    T("vb6", "{{agentName}}<br>The Letting Experts"),
    FOOT("vb7", "You're getting this because you booked a viewing with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const

/** Two hours after the viewing. One button, to the feedback page, already signed in. {{viewedOn}} */
export const VIEWING_FEEDBACK = {
  subject: "How was {{address}}?",
  preheader: "A minute, while you still remember it.",
  mode: "blocks",
  blocks: [
    H("vf1", "How was it?"),
    T("vf2", "Hi {{firstName}},<br><br>Thanks for coming to see <strong>{{address}}</strong> {{viewedOn}}. Whatever you thought, it helps: it tells me what to send you next, and it tells the landlord how their home is landing."),
    T("vf3", "It takes about a minute. If it's the one, you can put an offer in on the same page."),
    SP("vf4", 8),
    BTN("vf5", "Tell us what you thought", "{{link}}"),
    SP("vf6", 8),
    T("vf7", "{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("vf8", "You're getting this because you viewed a property with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/** Their feedback says it wasn't for them. {{reasonLine}} {{homesList}} = live homes nearby at a similar rent. */
export const VIEWING_NOT_FOR_THEM = {
  subject: "Not that one. Try these instead",
  preheader: "Homes on now that might suit you better.",
  mode: "blocks",
  blocks: [
    H("vn1", "Not that one? Try these"),
    T("vn2", "Hi {{firstName}},<br><br>Thanks for telling us what you thought of <strong>{{address}}</strong>. {{reasonLine}}"),
    T("vn3", "Here are some others on with us now, nearby and at a similar rent:"),
    T("vn4", "{{homesList}}"),
    T("vn5", "Reply with any you'd like to see and I'll book them in."),
    SP("vn6", 8),
    T("vn7", "{{agentName}}<br>The Letting Experts"),
    FOOT("vn8", "You're getting this because you viewed a property with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const

/** The application is in. {{offerLine}} {{holdingFeeLine}} */
export const APPLICATION_RECEIVED = {
  subject: "We have your application for {{address}}",
  preheader: "What happens now, and when you'll hear.",
  mode: "blocks",
  blocks: [
    H("ar1", "We have your application"),
    T("ar2", "Hi {{firstName}},<br><br>Thank you. Your application for <strong>{{address}}</strong> is in. {{offerLine}}"),
    H2("ar3", "What happens now"),
    T("ar4", "We put your application to the landlord. Landlords usually answer within a working day, and <strong>you'll hear from us the moment they do</strong>, whichever way it goes."),
    H2("ar5", "If it's a yes"),
    T("ar6", "{{holdingFeeLine}} Then referencing starts, so it helps to have these ready:"),
    T("ar7", "Your last three months of payslips, or accounts if you're self-employed<br>Your employer's contact email<br>Your current landlord's contact email<br>The dates of your addresses for the last three years"),
    T("ar8", "If anything has changed since you applied, reply and tell me."),
    SP("ar9", 8),
    T("ar10", "{{agentName}}<br>The Letting Experts"),
    FOOT("ar11", "You're getting this because you applied for a property through The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const

/** The landlord said no. {{reasonLine}} {{homesList}} */
export const APPLICATION_DECLINED = {
  subject: "{{address}}: not this time",
  preheader: "The landlord has gone another way. Here's what's next.",
  mode: "blocks",
  blocks: [
    H("ad1", "Not this one"),
    T("ad2", "Hi {{firstName}},<br><br>I'm sorry to tell you the landlord has decided not to go ahead with your application for <strong>{{address}}</strong>. {{reasonLine}}"),
    T("ad3", "It happens, and it isn't the end of your search. Your details are still with us, so your next application can go in quickly."),
    H2("ad4", "Homes on now, nearby"),
    T("ad5", "{{homesList}}"),
    T("ad6", "Reply with any you'd like to see and I'll book it in straight away."),
    SP("ad7", 8),
    T("ad8", "{{agentName}}<br>The Letting Experts"),
    FOOT("ad9", "You're getting this because you applied for a property through The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const

/** The landlord said yes. {{holdingFee}} {{holdingFeeLine}} {{weekAheadList}} */
export const APPLICATION_ITS_YOURS = {
  subject: "Good news: the landlord has said yes to {{address}}",
  preheader: "Your offer is accepted. Here's the holding fee and what happens next.",
  mode: "blocks",
  blocks: [
    H("ay1", "The landlord has said yes"),
    T("ay2", "Hi {{firstName}},<br><br>Congratulations. The landlord has accepted your application for <strong>{{address}}</strong>, subject to references and the tenancy agreement."),
    H2("ay3", "The holding fee"),
    T("ay4", "{{holdingFeeLine}}"),
    H2("ay5", "What happens next, in order"),
    T("ay6", "{{weekAheadList}}"),
    SP("ay7", 8),
    BTN("ay8", "See my tenancy", "{{link}}"),
    SP("ay9", 8),
    T("ay10", "Your tenancy page shows where each step is up to, so you never have to ring to find out. If anything is unclear, reply to this email."),
    SP("ay11", 8),
    T("ay12", "{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("ay13", "You're getting this because you applied for a property through The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/** Referencing opens. {{adultsLine}} */
export const REFERENCING_INVITE = {
  subject: "Time to get referenced for {{address}}",
  preheader: "What we'll ask, why, and what to have to hand.",
  mode: "blocks",
  blocks: [
    H("ri1", "Time to get referenced"),
    T("ri2", "Hi {{firstName}},<br><br>The next step for <strong>{{address}}</strong> is referencing. It's how the landlord knows the rent is affordable and that you've been a good tenant before."),
    H2("ri3", "What we'll ask"),
    T("ri4", "Your employment and income<br>Where you've lived for the last three years, and who your landlords were<br>A credit check<br>Your right to rent in the UK"),
    H2("ri5", "What to have to hand"),
    T("ri6", "Your last three months of payslips, or accounts if you're self-employed<br>Your employer's contact email<br>Your current landlord's contact email<br>The dates you moved in and out of each address"),
    SP("ri7", 8),
    BTN("ri8", "Start my referencing", "{{link}}"),
    SP("ri9", 8),
    T("ri10", "It takes about fifteen minutes. References usually come back within two or three working days of the last form going in. {{adultsLine}}"),
    SP("ri11", 8),
    T("ri12", "{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("ri13", "You're getting this because a landlord accepted your application through The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/** To the guarantor, not the tenant. {{tenantName}} {{rent}} {{termLine}} */
export const GUARANTOR_INVITE = {
  subject: "{{tenantName}} has asked you to be their guarantor",
  preheader: "What being a guarantor means, before you say yes.",
  mode: "blocks",
  blocks: [
    H("gi1", "Would you be a guarantor?"),
    T("gi2", "Hi {{firstName}},<br><br><strong>{{tenantName}}</strong> is renting <strong>{{address}}</strong> through The Letting Experts, at {{rent}}, and has named you as their guarantor. {{termLine}}"),
    H2("gi3", "What it means"),
    T("gi4", "A guarantor agrees to pay the rent, or the cost of damage beyond the deposit, if the tenant doesn't. It's a real commitment, so please read the agreement properly before you sign anything."),
    H2("gi5", "What happens next"),
    T("gi6", "You'll be referenced in your own right, with your own form: your income, your address history and a credit check. <strong>Your details stay private.</strong> {{tenantName}} won't see them."),
    SP("gi7", 8),
    BTN("gi8", "Read more and start", "{{link}}"),
    SP("gi9", 8),
    T("gi10", "If you weren't expecting this, or you'd rather not, reply and tell us. Nothing happens unless you fill in the form."),
    SP("gi11", 8),
    T("gi12", "{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("gi13", "You're getting this because a tenant named you as their guarantor with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;

/** Three days, form still empty or part done. {{missingList}} */
export const REFERENCING_CHASE = {
  subject: "Your references for {{address}}",
  preheader: "What's still missing, and why it's worth doing today.",
  mode: "blocks",
  blocks: [
    H("rc1", "Nearly there with your references"),
    T("rc2", "Hi {{firstName}},<br><br>Your referencing for <strong>{{address}}</strong> isn't finished yet. This is what's still missing:"),
    T("rc3", "{{missingList}}"),
    SP("rc4", 8),
    BTN("rc5", "Finish my referencing", "{{link}}"),
    SP("rc6", 8),
    T("rc7", "The landlord is holding the home for you while references are done, so the sooner these are in, the sooner you have a moving date."),
    T("rc8", "Stuck on something, like a landlord who won't reply? Tell me and I'll help."),
    SP("rc9", 8),
    T("rc10", "{{agentName}}<br>{{agentPhone}}<br>The Letting Experts"),
    FOOT("rc11", "You're getting this because your referencing with The Letting Experts isn't finished yet."),
  ],
  branding: { showSignoff: false },
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
