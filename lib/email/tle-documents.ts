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
export const PILOT_INVITE = {
  subject: "You're in first, {{firstName}}",
  preheader: "Early access to TLE OS, before anyone else sees it.",
  mode: "blocks",
  blocks: [
    H("p1", "You're in first."),
    T(
      "p2",
      "Hi {{firstName}},<br><br>We're building TLE OS - one place for your leads, your listings, your appraisals and your paperwork, instead of four. It goes live to everyone on <strong>14 October</strong>.<br><br>You're getting it now."
    ),
    T(
      "p3",
      "There are five of you. You've been picked because you'd notice the difference between something that works and something that only demos well."
    ),
    BTN("p4", "Set up your account", `${SITE}/join`),
    SP("p5", 8),
    DIV("p6"),
    H2("p7", "What to do first"),
    T(
      "p8",
      "Sign in and use it for your <strong>real</strong> work for a week. Book a genuine appraisal, open your genuine listings, look at your own leads. It's wired to live REX and PayProp data, so what you see is your actual book, not a demo."
    ),
    T(
      "p9",
      "Don't work around anything. If something is slower than the way you do it today, that's the single most valuable thing you can tell us."
    ),
    DIV("p10"),
    H2("p11", "When it's wrong, say so from where it broke"),
    T(
      "p12",
      "There's a <strong>report a problem</strong> button on every screen. It sends us the page you were on and what you were doing, so we don't have to work out which bit you meant.<br><br>Use it for anything. A wrong number, a button that doesn't do what it says, a page that looks bad on your phone. Especially the small things: those are the ones that never get reported and never get fixed."
    ),
    DIV("p13"),
    H2("p14", "The question we'll actually ask you"),
    T(
      "p15",
      "In three weeks we'll ask which parts you've <strong>never opened</strong>. Not your favourite feature. The tabs you walked past every day.<br><br>That tells us what to cut and what to move, and it's the reason for running a pilot at all."
    ),
    SP("p16", 8),
    T(
      "p17",
      "Anything at all, reply to this. It comes straight to me.<br><br>James"
    ),
    FOOT("p18", "You're getting this because you're on the TLE OS pilot."),
  ],
  /* Signed "James" in the body, so the renderer's automatic sign-off would
     repeat it - and it prints an em dash, which house style does not use in
     anything a client reads. */
  branding: { showSignoff: false },
} as const;

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
