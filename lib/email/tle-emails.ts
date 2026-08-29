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
  SITE,
  type EmailDoc,
} from "@/lib/email/tle-documents";

/* ──────────────────────── the catalogue ──────────────────────── */

export type CatalogEntry = {
  id: string;
  group: string;
  name: string;
  audience: "partner" | "landlord" | "internal";
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

/* An override replaces the WORDS, never the branding: the document in code
   keeps ownership of showSignoff and the rest, so an edit in the builder
   cannot accidentally reinstate the duplicate sign-off. */
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
    trigger: "Sent or scheduled from the Pre-appraisal step, two days before the visit",
    fires: "components/AppraisalTrack.tsx, or the queue in app/api/scheduled-sends/run",
    to: "The landlord",
    summary:
      "What happens on the day, how long it takes, what to have to hand, and a link to their own pre-appraisal page with the agent's photo on it.",
    render: () => renderPlain(subjectFor(SAMPLE_INVITE), bodyFor(SAMPLE_INVITE)),
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
        "Your terms of business — 12 Chorlton Road, Manchester M15 4AZ",
        `Hi Helen,

Just a quick note - the terms of business for 12 Chorlton Road, Manchester M15 4AZ are still waiting on your signature.

They went out on 1 October from DocuSign, so the email will be in your inbox under "The Letting Experts". It's worth a look in your junk folder too; that is where it usually is.

If you can't find it, reply to this and I'll send it straight out again. And if there's anything in it you'd like to talk through first, ring me on 0161 883 2525 - that's often quicker than email.

Kind regards,
Rhiannon Dodge
The Letting Experts`
      ),
  },
];

export const EMAIL_GROUPS = ["Pre-launch", "Market appraisals", "Terms of business", "Accounts"];
