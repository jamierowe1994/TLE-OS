/**
 * Every email TLE OS sends, written once and readable in one place.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ RULE: when you add an email anywhere in the OS, add an entry HERE in the   │
 * │ same change. Admin → Emails reads this file and nothing else, so an email  │
 * │ that isn't listed is an email nobody can review before it goes to a        │
 * │ landlord or a partner.                                                     │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Two kinds of entry, and the difference matters:
 *
 *   `blocks`  — authored here as a block document and rendered by
 *               lib/email/render.js. Editable later without touching code.
 *   `html`    — hand-rolled HTML that already exists elsewhere in the codebase.
 *               The catalogue shows it; it does NOT own it. lib/verify-email.ts
 *               is deliberately hand-rolled (measured Outlook dark-mode fixes
 *               that the block shell does not do), and re-authoring it as
 *               blocks would regress a real bug fix.
 *
 * Not a send log. This is a register of email TYPES.
 *
 * NOTE ON COPY: no em dashes anywhere in a body. House style, and they render
 * inconsistently across mail clients.
 */

import { renderTemplate } from "@/lib/email/render.js";
import { tleBrand } from "@/lib/campaign-mail";
import { verifyEmailFor, resetEmailFor } from "@/lib/verify-email";
import { pilotInviteEmail } from "@/lib/email/pilot-email";
import { videoChaseEmail } from "@/lib/email/video-chase-email";
import {
  bodyFor,
  confirmBodyFor,
  confirmSubjectFor,
  postBodyFor,
  postSubjectFor,
  subjectFor,
  type AppraisalInvite,
} from "@/lib/appraisal-email";
import { renderPlain } from "@/lib/campaign-mail";
import {
  LAUNCH_ANNOUNCEMENT,
  COMPLIANCE_CHASE_AGENT,
  COMPLIANCE_CHASE_LANDLORD,
  TENANT_PASSPORT_INVITE,
  LANDLORD_DECK_INVITE,
  LANDLORD_SIGN_IN,
  TENANT_SIGN_IN,
  SITE,
  type EmailDoc, AGENT_COMPLIANCE_CHASE } from "@/lib/email/tle-documents";

/* ──────────────────────── the catalogue ──────────────────────── */

export type CatalogEntry = {
  id: string;
  group: string;
  name: string;
  audience: "partner" | "landlord" | "tenant" | "internal";
  trigger: string;
  /** Where it is actually sent from, so a reader can go and check. */
  fires: string;
  to: string;
  /** True when nothing in the OS sends this yet. Honesty over tidiness. */
  draft?: boolean;
  summary: string;
  /**
   * The block document behind this email, when there is one.
   *
   * Present = Francesca can edit it in the builder. Absent = it is hand-rolled
   * HTML owned by another file (the account emails carry Outlook dark-mode
   * fixes the block shell does not do) or generated from a live record, and
   * an editor that appeared to own it would be lying.
   */
  doc?: EmailDoc;
  render: (override?: EmailDoc) => { subject: string; html: string };
};

/** Stand-in appointment, so the appraisal emails render as a real example. */
const SAMPLE_INVITE: AppraisalInvite = {
  landlordName: "Helen Bosworth",
  address: "12 Chorlton Road, Manchester M15 4AZ",
  whenPretty: "Tuesday 20 October at 2:00pm",
  startsAt: "2026-10-20T13:00:00.000Z",
  minutes: 60,
  agentName: "Rhiannon Dodge",
  agentPhone: "0161 883 2525",
  presentationUrl: `${SITE}/present/example`,
};

/**
 * A worked example, so the preview shows what actually goes out.
 *
 * James asked to see these "when they're going out", and a card full of
 * {{certLabel}} is not that — it is the template, which is a different thing
 * and reads as unfinished. The appraisal emails already do this with a
 * stand-in appointment; these get a stand-in property.
 *
 * Substituted at PREVIEW time only. The stored document keeps its placeholders,
 * because that is what the builder edits and what the sender fills.
 */
const COMPLIANCE_SAMPLE: Record<string, string> = {
  count: "3",
  certLabel: "Gas safety certificate",
  address: "41 Harewood Road, Coventry CV4 8LP",
  expires: "12 September 2026",
  whenPretty: "12 September",
  daysLeft: "14",
  agentName: "Michael Healy",
  firstName: "Helen",
  /* The two doorway emails carry a link. It has to be a real destination in
     the preview: a button reading {{link}} is the one part of a template a
     reviewer cannot check by eye, and a dead one is only found by a customer. */
  link: `${SITE}/tenant/welcome`,
  rows: [
    "<strong>41 Harewood Road</strong> — Gas safety, expires in 12 days",
    "<strong>8 Lower Station Road</strong> — EICR, expires in 26 days",
    "<strong>2 Norwich Street</strong> — EPC, no certificate on file",
  ]
    .join("<br>")
    .replace(/—/g, "-"),
};

/** Fill a document's placeholders with the worked example above. */
const withSample = (doc: EmailDoc, extra?: Record<string, string>): EmailDoc => {
  const values = { ...COMPLIANCE_SAMPLE, ...(extra ?? {}) };
  const fill = (t: string) =>
    t.replace(/\{\{(\w+)\}\}/g, (m, k: string) => values[k] ?? m);
  return {
    ...doc,
    subject: fill(doc.subject),
    blocks: doc.blocks.map((b) => {
      const anyB = b as unknown as Record<string, unknown>;
      const next: Record<string, unknown> = { ...anyB };
      if (typeof anyB.text === "string") next.text = fill(anyB.text);
      /* A button's placeholder is in its URL, not its label. Filling only the
         text left every preview with a button pointing at the literal
         "{{link}}" - which renders as a button that looks right and goes
         nowhere, the one defect a reviewer cannot see by reading. */
      if (typeof anyB.url === "string") next.url = fill(anyB.url);
      return next as unknown as (typeof doc.blocks)[number];
    }),
  };
};

/* An override replaces the WORDS, never the branding: the document in code
   keeps ownership of showSignoff and the rest, so an edit in the builder
   cannot accidentally reinstate the duplicate sign-off. */
/**
 * A catalogue email rendered for a REAL recipient: every {{placeholder}} in
 * the document filled from `vars`, then rendered on the TLE brand. Used by
 * the send paths; the catalogue's own `render` is the sample for reading.
 * A placeholder with no value is left visible rather than blanked, so a
 * missing variable is seen on the first test and not shipped as a gap.
 */
export function renderTleEmail(id: string, vars: Record<string, string>): { subject: string; html: string } {
  const entry = TLE_EMAILS.find((e) => e.id === id);
  if (!entry?.doc) throw new Error(`No email document for ${id}.`);
  const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
  const doc = entry.doc;
  const filled: EmailDoc = {
    ...doc,
    subject: fill(doc.subject),
    blocks: doc.blocks.map((b) => {
      const anyB = b as unknown as Record<string, unknown>;
      const next: Record<string, unknown> = { ...anyB };
      for (const key of ["text", "label", "href", "url"]) {
        if (typeof anyB[key] === "string") next[key] = fill(anyB[key] as string);
      }
      return next as unknown as EmailDoc["blocks"][number];
    }),
  };
  return blocks(filled)();
}

const blocks = (doc: EmailDoc) => (override?: EmailDoc) =>
  renderTemplate(
    { ...doc, ...(override ?? {}), branding: doc.branding },
    { brand: { ...tleBrand(), ...(doc.branding ?? {}) } }
  ) as { subject: string; html: string };

export const TLE_EMAILS: CatalogEntry[] = [
  {
    id: "pilot-invite",
    group: "Pre-launch",
    name: "Pilot Invitation",
    audience: "partner",
    trigger: "Sent by hand from Admin → Pre-launch when an agent is added to the pilot",
    fires: "NOT WIRED YET — Admin → Pre-launch currently sends the account-verification email instead",
    to: "The five pilot agents",
    draft: true,
    summary:
      "One line and one button: they're in, and here's the way in. Stripped back from a full block document on 29 Aug — everything else it used to say belongs in the first conversation, not the doorway. Hand-rolled on the shared shell, so it is no longer editable in the builder.",
    render: () => {
      const m = pilotInviteEmail(`${SITE}/join?token=example`, "Rhiannon");
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "launch-announcement",
    group: "Pre-launch",
    name: "Launch Day",
    audience: "partner",
    trigger: "Sent to everyone on launch day, 14 October 2026",
    fires: "NOT WIRED YET — no send path exists",
    to: "Every TLE partner and member of staff",
    draft: true,
    summary:
      "Announces TLE OS is open to everyone. Leads on what changes for the reader rather than on features, and names the pilot so it doesn't read as a first draft.",
    doc: LAUNCH_ANNOUNCEMENT,
    render: blocks(LAUNCH_ANNOUNCEMENT),
  },

  {
    id: "compliance-chase-agent",
    group: "Compliance",
    name: "Certificates Due — Agent",
    audience: "partner",
    trigger:
      "Daily, for any certificate that has crossed into the 30, 14 or 7 day band, or has expired",
    fires: "app/api/compliance/reminders/run (cron, POST with x-cron-key)",
    to: "The letting agent whose book the property is on",
    summary:
      "One email per agent, not per certificate — a dozen properties would otherwise be a dozen emails on a Monday, which is how a chase becomes something people filter. Worst first, expired at the top. Chased by BAND rather than exact day, so a missed run does not mean a certificate is never chased at all.",
    doc: COMPLIANCE_CHASE_AGENT,
    render: (o) => blocks(withSample(o ?? COMPLIANCE_CHASE_AGENT))(),
  },
  {
    id: "compliance-chase-landlord",
    group: "Compliance",
    name: "Certificate Renewal — Landlord",
    audience: "landlord",
    trigger:
      "The same bands, but one email per property per certificate — a landlord owns one or two houses and a list means nothing to them",
    fires:
      "NOT WIRED — lib/email-policy refuses every non-internal address until the public Lettings Experts domain exists. This is what it will say on the day that lands.",
    to: "The landlord, with their agent copied",
    draft: true,
    summary:
      "One property, one certificate, one date. States the obligation plainly and offers the two real paths — they arrange it and send it in, or we book a contractor. No urgency dressing: a certificate is a legal obligation, and making every reminder shout leaves nothing to distinguish the genuinely urgent ones.",
    doc: COMPLIANCE_CHASE_LANDLORD,
    render: (o) => blocks(withSample(o ?? COMPLIANCE_CHASE_LANDLORD))(),
  },
  {
    id: "account-verify",
    group: "Accounts",
    name: "Confirm Your Account",
    audience: "partner",
    trigger: "Someone is invited, or starts setting up an account",
    fires: "lib/verify-email.ts → verifyEmailFor()",
    to: "The person joining",
    summary:
      "One-time link to confirm the address and choose a password. Hand-rolled HTML on purpose: it carries measured fixes for Outlook dark mode that the block renderer does not do.",
    render: () => {
      const m = verifyEmailFor(`${SITE}/join?token=example`);
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "account-reset",
    group: "Accounts",
    name: "Reset Your Password",
    audience: "partner",
    trigger: "Someone asks for a password reset",
    fires: "lib/verify-email.ts → resetEmailFor()",
    to: "The account holder",
    summary: "One-time link to set a new password. Same hand-rolled shell as the confirmation.",
    render: () => {
      const m = resetEmailFor(`${SITE}/reset?token=example`);
      return { subject: m.subject, html: m.html };
    },
  },

  {
    id: "appraisal-confirm",
    group: "Market appraisals",
    name: "Appointment Confirmed",
    audience: "landlord",
    trigger: "The agent presses Send the confirmation on a booked appraisal",
    fires: "components/AppraisalTrack.tsx → lib/appraisal-email.ts → confirmBodyFor()",
    to: "The landlord",
    summary:
      "Short, sent while the phone call is still warm. Puts the time in writing and carries the calendar invite. The detail has its own email nearer the visit.",
    render: () =>
      renderPlain(confirmSubjectFor(SAMPLE_INVITE), confirmBodyFor(SAMPLE_INVITE)),
  },
  {
    id: "appraisal-pre",
    group: "Market appraisals",
    name: "Before The Visit",
    audience: "landlord",
    trigger: "Sent or scheduled from the Pre-appraisal step, the day before the visit",
    fires: "components/AppraisalTrack.tsx, or the queue in app/api/scheduled-sends/run",
    to: "The landlord",
    summary:
      "What happens on the day, how long it takes, what to have to hand, and a link to their own pre-appraisal page with the agent's photo on it.",
    render: () => renderPlain(subjectFor(SAMPLE_INVITE), bodyFor(SAMPLE_INVITE)),
  },
  {
    /**
     * The only email in here addressed to the agent about their own work.
     *
     * Two days out, and only when there is no recording against the appraisal
     * yet — the landlord's pre-appraisal email goes the day before and carries
     * the deck the video sits on, so the nudge has to land before that, not
     * with it.
     */
    id: "appraisal-video-chase",
    group: "Market appraisals",
    name: "Record A Video",
    audience: "partner",
    trigger:
      "Two days before an appraisal, when no video has been recorded for it. The landlord's pre-appraisal email goes the day after this one.",
    fires:
      "Queued on os_scheduled_sends for two days before the visit when the appraisal is booked with a date, or when the pre-appraisal email is queued (lib/video-chase.ts). The runner checks the deck again before sending and cancels it if a video is already there. Also on the appraisal screen: Send it to me now.",
    to: "The agent whose appraisal it is",
    summary:
      "A nudge, not a notification. Names the property because an agent may have three that week, says it takes a minute, and says plainly that ignoring it changes nothing — a chase that cannot be declined is one everybody learns to delete. The button goes to the appraisal in the OS, which is where the recorder is mounted; there is no Flow page to link to.",
    render: () => {
      const m = videoChaseEmail({
        link: `${SITE}/market-appraisals/ma4`,
        address: "12 Dover Close, Northampton NN5 4WJ",
        firstName: "Rhiannon",
        whenPretty: "on Thursday",
      });
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "appraisal-post",
    group: "Market appraisals",
    name: "After The Visit",
    audience: "landlord",
    trigger: "The agent presses Send the follow-up on the Post-appraisal step",
    fires: "components/AppraisalTrack.tsx → lib/appraisal-email.ts → postBodyFor()",
    to: "The landlord",
    summary: "The figure given, the fee quoted, and what happens next.",
    render: () =>
      renderPlain(postSubjectFor(SAMPLE_INVITE), postBodyFor(SAMPLE_INVITE, {
        valuation: 1250,
        askingRent: 1300,
        feePercent: 10,
        availableFrom: null,
        summary: "Wants it on the market before Christmas. Weighing us against one other agent.",
      })),
  },

  {
    id: "terms-chase",
    group: "Terms of business",
    name: "Terms Still To Sign",
    audience: "landlord",
    trigger: "The agent presses Send reminder on an outstanding set of terms",
    fires: "app/api/esign/remind/route.ts",
    to: "The landlord who hasn't signed",
    summary:
      "A nudge, not a resend. REX exposes no resend and no signing URL, so this points at the DocuSign email already in their inbox and offers to send it again.",
    render: () =>
      renderPlain(
        "Your terms of business - 12 Chorlton Road, Manchester M15 4AZ",
        `Hi Helen,

Just a quick note - the terms of business for 12 Chorlton Road, Manchester M15 4AZ are still waiting on your signature.

They went out on 1 October from DocuSign, so the email will be in your inbox under "The Letting Experts". It's worth a look in your junk folder too; that is where it usually is.

If you can't find it, reply to this and I'll send it straight out again. And if there's anything in it you'd like to talk through first, ring me on 0161 883 2525 - that's often quicker than email.

Kind regards,
Rhiannon Dodge
The Letting Experts`
      ),
  },

  /* ── The two doorways: an appointment becomes an account ──────────────────
     Both fire on a BOOKING, which is the moment the person is definitely
     thinking about us. Neither is wired to anything yet, and neither can be
     until the public Lettings Experts sending domain exists - lib/email-policy
     refuses every non-internal address, so as things stand these can only be
     sent to a colleague from Admin -> Emails. That is exactly what they are
     for today: reading the words, and deciding what the screens behind them
     have to deliver. ── */
  {
    id: "tenant-passport-invite",
    group: "Doorways",
    name: "Viewing Booked - Start Your Passport",
    audience: "tenant",
    trigger: "A viewing is booked for a tenant",
    fires: "Wired 4 Sep 2026. Sent from a viewing on /viewings (Invite to the passport) on the public sender; mints the passport and links to it.",
    to: "The tenant who booked the viewing",
    draft: true,
    summary:
      "Turns a booked viewing into a started passport. Leads on the payoff to THEM - fill it in once and it answers every application - rather than on us needing documents. Says plainly, in the body rather than a footnote, that nothing is shared with a landlord until they apply: referencing and right-to-rent are intrusive to hand over, and somebody who thinks a landlord can already see it will not fill it in.",
    doc: TENANT_PASSPORT_INVITE,
    render: (o) =>
      blocks(
        withSample(o ?? TENANT_PASSPORT_INVITE, {
          firstName: "Sophie",
          address: "Flat 2, Mercer Street, Manchester M4 1SL",
          whenPretty: "Thursday 4 September at 5:30pm",
          agentName: "Rhiannon Dodge",
          link: `${SITE}/tenant/welcome`,
        })
      )(),
  },
  {
    id: "landlord-sign-in",
    group: "Doorways",
    name: "Landlord Sign-in Link",
    audience: "landlord",
    trigger: "A landlord asks for their link on /landlord/sign-in",
    fires: "Wired 2 Sep 2026. Goes on the public Lettings Experts sender (RESEND_FROM_PUBLIC) to the email on the landlord's REX owner contact.",
    to: "The landlord, at the address REX holds for them",
    draft: false,
    summary:
      "No password. The link is the sign-in, single use and a day long, the same way the deck and the passport already work. It only ever goes to an address that is the owner contact on a managed listing, so a stranger typing an email gets the same on-screen answer and no email.",
    doc: LANDLORD_SIGN_IN,
    render: (o) =>
      blocks(
        withSample(o ?? LANDLORD_SIGN_IN, {
          firstName: "Helen",
          link: `${SITE}/landlord/enter?token=sample`,
        })
      )(),
  },
  {
    id: "tenant-sign-in",
    group: "Doorways",
    name: "Tenant Sign-in Link",
    audience: "tenant",
    trigger: "A tenant asks for their link on /tenant/sign-in",
    fires: "Wired 4 Sep 2026. Goes on the public sender to the email Propoly holds for the tenant on a deal.",
    to: "The tenant, at the address on their Propoly deal",
    draft: false,
    summary:
      "The landlord link, for tenants. Only ever goes to an address that is a tenant on a Propoly deal, so a stranger typing an email gets the same on-screen answer and no email.",
    doc: TENANT_SIGN_IN,
    render: (o) =>
      blocks(
        withSample(o ?? TENANT_SIGN_IN, {
          firstName: "Sophie",
          link: `${SITE}/tenant/enter?token=sample`,
        })
      )(),
  },
  {
    id: "landlord-deck-invite",
    group: "Doorways",
    name: "Appraisal Booked - Open Your Property File",
    audience: "landlord",
    trigger: "A market appraisal is booked for a landlord",
    fires: "NOT WIRED YET - no send path, and the landlord file is a wireframe",
    to: "The landlord who booked the appraisal",
    draft: true,
    summary:
      "Turns a booked appraisal into an account. The pitch is not 'make an account' but 'we have already gathered what is on record for your property, correct it before we arrive' - which is worth more to them than to us, and is true. Also sets up the file as the place the valuation, terms and certificates will live afterwards.",
    doc: LANDLORD_DECK_INVITE,
    render: (o) =>
      blocks(
        withSample(o ?? LANDLORD_DECK_INVITE, {
          firstName: "Helen",
          address: "12 Chorlton Road, Manchester M15 4AZ",
          whenPretty: "Tuesday 20 October at 2:00pm",
          agentName: "Rhiannon Dodge",
          link: `${SITE}/landlord/welcome`,
        })
      )(),
  },
];

export const EMAIL_GROUPS = ["Pre-launch", "Market appraisals", "Compliance", "Terms of business", "Accounts"];

/**
 * The agent's certificate chase, filled with a real book.
 *
 * Separate from the catalogue entry above, and deliberately so. That one exists
 * to be LOOKED AT — it substitutes a stand-in property so the preview shows
 * something readable. This one is what actually goes out, and takes the rows
 * the tracker produced.
 *
 * Same document either way, so editing the wording in the builder changes both
 * the preview and the real thing. A preview rendered from a different source
 * than the send is a preview that can lie.
 */
export function renderComplianceAgentChase(input: {
  firstName: string;
  /** Already sorted worst-first by the caller — the order is a judgement about
   *  the book, not about typography, so it is not made here. */
  lines: string[];
}): { subject: string; html: string } {
  const fill = (t: string) =>
    t
      .replace(/\{\{firstName\}\}/g, input.firstName)
      .replace(/\{\{count\}\}/g, String(input.lines.length))
      .replace(/\{\{rows\}\}/g, input.lines.join("<br>"));

  const doc = {
    ...COMPLIANCE_CHASE_AGENT,
    subject: fill(COMPLIANCE_CHASE_AGENT.subject),
    blocks: COMPLIANCE_CHASE_AGENT.blocks.map((b) => {
      const rec = b as unknown as Record<string, unknown>;
      return (
        typeof rec.text === "string" ? { ...rec, text: fill(rec.text) } : rec
      ) as unknown as (typeof COMPLIANCE_CHASE_AGENT.blocks)[number];
    }),
  };
  return blocks(doc as unknown as EmailDoc)();
}

/** An agent's own compliance, item 11 - the same shape as the certificate chase. */
export function renderAgentComplianceChase(input: { firstName: string; lines: string[] }): { subject: string; html: string } {
  const n = input.lines.length;
  const fill = (t: string) =>
    t
      .replace(/\{\{firstName\}\}/g, input.firstName)
      .replace(/\{\{count\}\}/g, String(n))
      .replace(/\{\{plural\}\}/g, n === 1 ? "" : "s")
      .replace(/\{\{singular\}\}/g, n === 1 ? "s" : "")
      .replace(/\{\{rows\}\}/g, input.lines.join("<br>"));
  const doc = {
    ...AGENT_COMPLIANCE_CHASE,
    subject: fill(AGENT_COMPLIANCE_CHASE.subject),
    blocks: AGENT_COMPLIANCE_CHASE.blocks.map((b) => {
      const rec = b as unknown as Record<string, unknown>;
      return (typeof rec.text === "string" ? { ...rec, text: fill(rec.text) } : rec) as unknown as (typeof AGENT_COMPLIANCE_CHASE.blocks)[number];
    }),
  };
  return blocks(doc as unknown as EmailDoc)();
}

/** The sign-in link email, filled for one landlord and ready to send. */
export function renderTenantSignIn(input: { firstName: string; link: string }): { subject: string; html: string; text: string } {
  const { subject, html } = renderTleEmail("tenant-sign-in", { firstName: input.firstName, link: input.link });
  return { subject, html, text: `Hi ${input.firstName},\n\nHere is your link to your account with The Letting Experts. It works once and lasts 24 hours.\n\n${input.link}\n\nIf you didn't ask for this, you can ignore it.\n\nThe Letting Experts` };
}

export function renderLandlordSignIn(input: { firstName: string; link: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const fill = (t: string) =>
    t.replace(/\{\{firstName\}\}/g, input.firstName).replace(/\{\{link\}\}/g, input.link);
  const doc = {
    ...LANDLORD_SIGN_IN,
    subject: fill(LANDLORD_SIGN_IN.subject),
    blocks: LANDLORD_SIGN_IN.blocks.map((b) => {
      const rec = b as unknown as Record<string, unknown>;
      const next: Record<string, unknown> = { ...rec };
      if (typeof rec.text === "string") next.text = fill(rec.text);
      if (typeof rec.href === "string") next.href = fill(rec.href);
      if (typeof rec.url === "string") next.url = fill(rec.url);
      if (typeof rec.link === "string") next.link = fill(rec.link);
      return next as unknown as (typeof LANDLORD_SIGN_IN.blocks)[number];
    }),
  };
  const out = blocks(doc as unknown as EmailDoc)();
  const text = [
    `Hi ${input.firstName},`,
    "",
    "Here is your link to your property file with The Letting Experts:",
    input.link,
    "",
    "It works once and lasts 24 hours. If you didn't ask for this, ignore it.",
    "",
    "The Letting Experts",
  ].join("\n");
  return { ...out, text };
}
