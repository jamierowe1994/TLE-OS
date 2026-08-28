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

export const SITE = "https://tle-os-production.up.railway.app";

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
      size: 64,
      letterSpacing: 2,
      color: "#e31f36",
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
