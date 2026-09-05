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
const BTN = (id: string, text: string, url: string, align: "left" | "center" = "left"): Block => ({
  type: "button", id, text, url, color: "", align,
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
      /* The OS's OWN handwriting - the face on "Admin" and every section
         title in the app - so the email and the product look like one thing.
         Gmail and Outlook on Windows strip web fonts, so a good half of the
         list reads the fallback, which is why the wordmark is still TYPE and
         still red: it reads either way. See FONT_STACKS in render.js. */
      font: "shantell",
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
 * address until the public Lettings Experts domain exists, so this is what it
 * WILL say, previewable now and sendable the day that domain lands.
 *
 * No deadline theatre. The band is stated as a fact — "expires in 14 days" —
 * because a certificate is a legal obligation and dressing it up as urgency
 * makes the genuinely urgent ones indistinguishable. */

/** The agent's OWN paperwork, not the properties'. Item 11. */
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
      "Hi {{firstName}},<br><br>Your viewing at <strong>{{address}}</strong> is confirmed for <strong>{{whenPretty}}</strong>. {{agentName}} will meet you there."
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

export const LANDLORD_DECK_INVITE = {
  subject: "Your appraisal is booked. Here is your property file",
  preheader: "See what we already know about the property, and correct it before we visit.",
  mode: "blocks",
  blocks: [
    H("ld1", "You're booked in"),
    T(
      "ld2",
      "Hi {{firstName}},<br><br>{{agentName}} is visiting <strong>{{address}}</strong> on <strong>{{whenPretty}}</strong> to value it for letting."
    ),
    SP("ld3", 8),
    DIV("ld4"),
    H2("ld5", "Your property file"),
    T(
      "ld6",
      "We've already pulled together what is on record for the property: its size, its EPC, what it and its neighbours have let for, and how long they took. It is all in one place for you to look through before we come."
    ),
    T(
      "ld7",
      "Some of it will be out of date, and some of it we simply cannot see from the outside - what you've had done, how the heating is, whether it is furnished. Putting that right in the file means the figure we give you on the day is based on the real property rather than the one on paper."
    ),
    SP("ld8", 8),
    BTN("ld9", "Open your property file", "{{link}}"),
    SP("ld10", 8),
    T(
      "ld11",
      "It is also where your valuation, your terms and your certificates will live afterwards, so there is one place to look rather than a thread of emails."
    ),
    SP("ld12", 8),
    T("ld13", "The Letting Experts"),
    FOOT("ld14", "You're getting this because you booked a market appraisal with The Letting Experts."),
  ],
  branding: { showSignoff: false },
} as const;
