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
import { tleBrand, type EmailAudience } from "@/lib/campaign-mail";
import { verifyEmailFor, resetEmailFor } from "@/lib/verify-email";
import { pilotInviteEmail } from "@/lib/email/pilot-email";
import { videoChaseEmail } from "@/lib/email/video-chase-email";
import { certificateChaseEmail, ownComplianceEmail, ownComplianceRollupEmail, pretenancyDigestEmail, dealMovedEmail, radarDigestEmail } from "@/lib/email/agent-emails";
import { accountsInvoiceEmail, certificateSharedEmail, complianceJobEmail } from "@/lib/email/works-internal";
import type { WorksOrder } from "@/lib/works-orders";
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
  COMPLIANCE_CHASE_LANDLORD,
  CERTIFICATE_SHARED_LANDLORD,
  CERTIFICATE_SHARED_TENANT,
  CERTIFICATE_SHARED_CONTRACTOR,
  TENANT_PASSPORT_INVITE,
  LANDLORD_SIGN_IN,
  TENANT_SIGN_IN,
  WORKS_CONTRACTOR_ORDER,
  WORKS_CONTRACTOR_BOOKED,
  WORKS_CONTRACTOR_CANCELLED,
  WORKS_TENANT_RECEIVED,
  WORKS_TENANT_BOOKED,
  WORKS_TENANT_DONE,
  WORKS_LANDLORD_APPROVAL,
  WORKS_LANDLORD_REPORT,
  WORKS_CONTRACTOR_REPORT,
  WORKS_TENANT_FOUND,
  WORKS_LANDLORD_ARRANGED,
  WORKS_CONTRACTOR_DONE_REQUEST,
  WORKS_TENANT_HAPPY,
  INSPECTION_TENANT_ACCESS,
  INSPECTION_TENANT_BOOKED,
  INSPECTION_LANDLORD_REPORT,
  INVOICE_SENT,
  LANDLORD_CONTRACT_PACK,
  LANDLORD_QUESTIONS_CHASE,
  LANDLORD_CONTRACT_NUDGE,
  LANDLORD_MESSAGE_REPLY,
  LANDLORD_DOCS_NUDGE,
  VIEWING_CANCELLED,
  VIEWING_MOVED,
  APPLICATION_ACCEPTED_LANDLORD,
  APPLICATION_ACCEPTED_TENANT,
  TENANT_ENQUIRY_REPLY,
  TENANT_ADDED_WELCOME,
  TENANT_PASSPORT_NUDGE_1,
  TENANT_PASSPORT_NUDGE_2,
  TENANT_MATCHES,
  TENANT_MATCHES_AGAIN,
  VIEWING_REMINDER,
  VIEWING_REBOOK,
  VIEWING_FEEDBACK,
  VIEWING_NOT_FOR_THEM,
  APPLICATION_RECEIVED,
  APPLICATION_DECLINED,
  APPLICATION_ITS_YOURS,
  REFERENCING_INVITE,
  GUARANTOR_INVITE,
  REFERENCING_CHASE,
  HOLDING_FEE_WORDING,
  WEEK_AHEAD_LINES,
  SITE,
  type EmailDoc } from "@/lib/email/tle-documents";

/* ──────────────────────── the catalogue ──────────────────────── */

export type CatalogEntry = {
  id: string;
  group: string;
  name: string;
  audience: "partner" | "landlord" | "tenant" | "contractor" | "internal";
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
  /* The renewed-certificate fan-out: the one line that changes per recipient,
     so the preview has to show it rather than leave a placeholder in the
     middle of a paragraph. */
  alsoLine: "The tenant has been sent a copy as well.",
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
    /* The preheader too (15 Sep 2026): it is the grey line an inbox shows
       under the subject, and it was never filled - so four emails would have
       arrived reading "Due {{dueDate}}" before anybody opened them. */
    ...(typeof doc.preheader === "string" ? { preheader: fill(doc.preheader) } : {}),
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
export function renderTleEmail(
  id: string,
  vars: Record<string, string>,
  /** Blocks only this send carries, placed after the named block (the viewing's Add to calendar buttons). */
  extra?: { after: string; blocks: Record<string, unknown>[] }
): { subject: string; html: string } {
  const entry = TLE_EMAILS.find((e) => e.id === id);
  if (!entry?.doc) throw new Error(`No email document for ${id}.`);
  const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
  const doc = entry.doc;
  const filled: EmailDoc = {
    ...doc,
    subject: fill(doc.subject),
    /* The inbox preview line, filled like everything else (see withSample). */
    ...(typeof doc.preheader === "string" ? { preheader: fill(doc.preheader) } : {}),
    blocks: doc.blocks.map((b) => {
      const anyB = b as unknown as Record<string, unknown>;
      const next: Record<string, unknown> = { ...anyB };
      for (const key of ["text", "label", "href", "url"]) {
        if (typeof anyB[key] === "string") next[key] = fill(anyB[key] as string);
      }
      return next as unknown as EmailDoc["blocks"][number];
    }).flatMap((b) =>
      extra && (b as unknown as { id?: string }).id === extra.after
        ? [b, ...(extra.blocks as unknown as EmailDoc["blocks"])]
        : [b]
    ),
  };
  return blocks(filled, entry.audience)();
}

/**
 * The same, but with the builder's edit applied first. Edits are stored in
 * os_email_templates under campaign_id "email-catalog:<id>", step 0 - keyed
 * by the email's id since 7 Sep 2026, not its position in this list, which
 * moved every time an email was added. The send paths call THIS, so what
 * Francesca changed is what goes out.
 */
export async function renderTleEmailLive(id: string, vars: Record<string, string>): Promise<{ subject: string; html: string }> {
  const entry = TLE_EMAILS.find((e) => e.id === id);
  if (!entry?.doc) throw new Error(`No email document for ${id}.`);
  let doc: EmailDoc = entry.doc;
  try {
    const { hasDb, q } = await import("@/lib/db");
    if (hasDb()) {
      const rows = await q<{ subject: string; blocks: unknown }>(
        `SELECT subject, blocks FROM os_email_templates WHERE campaign_id = $1 AND step_index = 0`,
        [`email-catalog:${id}`]
      );
      if (rows[0] && Array.isArray(rows[0].blocks)) doc = { ...doc, subject: rows[0].subject || doc.subject, blocks: rows[0].blocks as EmailDoc["blocks"] };
    }
  } catch {
    /* the words in code, then */
  }
  const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
  const filled: EmailDoc = {
    ...doc,
    subject: fill(doc.subject),
    ...(typeof doc.preheader === "string" ? { preheader: fill(doc.preheader) } : {}),
    blocks: doc.blocks.map((b) => {
      const anyB = b as unknown as Record<string, unknown>;
      const next: Record<string, unknown> = { ...anyB };
      for (const key of ["text", "label", "href", "url"]) {
        if (typeof anyB[key] === "string") next[key] = fill(anyB[key] as string);
      }
      return next as unknown as EmailDoc["blocks"][number];
    }),
  };
  return blocks(filled, entry.audience)();
}

/* Rendered on the letterhead for the entry's audience (11 Sep 2026): the
   customer palette for landlords and tenants, the red for the team and the
   trades. See tleBrand in lib/campaign-mail. */
const blocks = (doc: EmailDoc, audience?: EmailAudience) => (override?: EmailDoc) =>
  renderTemplate(
    { ...doc, ...(override ?? {}), branding: doc.branding },
    { brand: { ...tleBrand(audience), ...(doc.branding ?? {}) } }
  ) as { subject: string; html: string };
const blocksAs = (audience: EmailAudience) => (doc: EmailDoc) => blocks(doc, audience);

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
    render: blocksAs("partner")(LAUNCH_ANNOUNCEMENT),
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
    /* No `doc` since 6 Sep 2026: it is on the shared TLE OS shell with the
       other agent emails, hand-rolled, so the builder no longer owns it. */
    render: () => {
      const m = certificateChaseEmail({ firstName: "Helen", lines: COMPLIANCE_SAMPLE.rows.split("<br>") });
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "own-compliance",
    group: "Compliance",
    name: "Your Own Compliance — Agent",
    audience: "partner",
    trigger: "Daily, when something an agent holds personally is missing or runs out within 30, 14 or 7 days",
    fires: "app/api/agent-compliance/remind (cron, POST with x-cron-key)",
    to: "The agent, and a roll-up to whoever holds the compliance role",
    summary:
      "Michael's list, read back to each agent: what they hold personally that is not on file or running out. Marking it done on the profile stops the reminder.",
    render: () => {
      const m = ownComplianceEmail({
        firstName: "Helen",
        lines: ["Right to Rent training - expired 2026-08-30", "Professional indemnity - runs out 2026-09-28 (22 days)", "DBS check - not on file"],
      });
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "pretenancy-digest",
    group: "Pre-tenancy",
    name: "Pre-tenancy Digest",
    audience: "partner",
    trigger: "Every morning, when the pipeline and PayProp disagree about a deal",
    fires: "app/api/pretenancy/alerts/run (cron, POST with x-cron-key)",
    to: "Whoever holds see:pretenancy - Kirstie, Susan, James",
    summary:
      "One property at a time, worst first: a deal past Deposit with nothing registered, a move-in date passed with no rent schedule, and the tenancies that have started paying. Nothing here is a tick somebody made.",
    render: () => {
      const m = pretenancyDigestEmail([
        { dealId: "d1", stageKey: "deposit", key: "d1:deposit", tone: "attention", address: "12 Test Street, Northampton", agentName: "Rhiannon", text: "Past Deposit for 9 days, nothing registered in PayProp" },
        { dealId: "d1", stageKey: "rent_payment", key: "d1:rent", tone: "attention", address: "12 Test Street, Northampton", agentName: "Rhiannon", text: "Move-in was 2 Sep and there is no rent schedule" },
        { dealId: "d2", stageKey: "holding", key: "d2:holding", tone: "attention", address: "Flat 2, Mercer Street, Bedford", agentName: "Dan", text: "Holding fee invoiced 6 days ago, not reconciled" },
        { dealId: "d3", stageKey: "rent_payment", key: "d3:rent", tone: "good", address: "9 Example Close, Kettering", agentName: "Sean", text: "First rent of £925 in on 4 Sep" },
      ]);
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "deal-moved",
    group: "Pre-tenancy",
    name: "Your Deal Moved",
    audience: "partner",
    trigger: "When Propoly moves an agent's deal: references back, agreement out, complete, cancelled, rent in, ready to move in",
    fires: "lib/business/deal-watch (the five-minute watcher, behind the Tell agents switch)",
    to: "The agent who manages the property in Propoly",
    summary:
      "One event, one email: what happened and what the agent does next. Held until the Tell agents switch is on; the feed records every move regardless.",
    render: () => {
      const m = dealMovedEmail(
        { id: 1, dealId: "d1", property: "12 Test Street, Northampton", event: "references_back", fromStatus: "references", toStatus: "plc", at: new Date().toISOString(), amount: null, agentEmail: null, agentName: "Rhiannon" } as never,
        SITE
      );
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "radar-digest",
    group: "Tools",
    name: "Landlord Radar Morning Note",
    audience: "partner",
    trigger: "Every morning after the sweep, to the addresses in RADAR_DIGEST_TO",
    fires: "lib/radar sendDigest (the radar cron)",
    to: "Whoever works the Bond list",
    summary: "What Radar found overnight and the ten best doors nobody has knocked on yet.",
    render: () => {
      const m = radarDigestEmail({
        dateLabel: "Monday 7 September",
        active: 184,
        districts: 6,
        newToday: 11,
        signals: [{ label: "Long on market", count: 92 }, { label: "Price drop", count: 48 }, { label: "Relisted", count: 31 }, { label: "Sold recently", count: 13 }],
        top: [
          { score: 86, address: "14 Martins Lane NN5 4WJ", rent: "£1,150 pcm", agent: "Connells", why: "On the market 71 days; reduced twice" },
          { score: 79, address: "2 Norwich Street MK40 1AB", rent: "£925 pcm", agent: "Haart", why: "Relisted after 3 weeks off; price drop of £50" },
          { score: 74, address: "Flat 9, 29 Springfield Street NN1 3DA", rent: "£800 pcm", agent: null, why: "On the market 58 days" },
        ],
      });
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "compliance-chase-landlord",
    group: "Compliance",
    name: "Certificate Renewal — Landlord",
    audience: "landlord",
    trigger:
      "The same bands, but one email per property per certificate — a landlord owns one or two houses and a list means nothing to them",
    fires:
      "NOT WIRED — lib/email-policy refuses every non-internal address until the public Letting Experts domain exists. This is what it will say on the day that lands.",
    to: "The landlord, with their agent copied",
    draft: true,
    summary:
      "One property, one certificate, one date. States the obligation plainly and offers the two real paths — they arrange it and send it in, or we book a contractor. No urgency dressing: a certificate is a legal obligation, and making every reminder shout leaves nothing to distinguish the genuinely urgent ones.",
    doc: COMPLIANCE_CHASE_LANDLORD,
    render: (o) => blocksAs("landlord")(withSample(o ?? COMPLIANCE_CHASE_LANDLORD))(),
  },
  /* ── The renewed certificate, out to all three parties (14 Sep 2026) ──
     One document per party rather than one with conditional paragraphs: a
     landlord and a tenant are owed different things by the same piece of
     paper, and Francesca signs off three short emails far more readily than
     one that tries to be all of them. lib/certificate-share.ts sends them. */
  {
    id: "certificate-shared-landlord",
    group: "Compliance",
    name: "Renewed Certificate — Landlord",
    audience: "landlord",
    trigger:
      "A renewed certificate is filed on a let home, by any door: attached on the OS, dropped on the contractor's page, or emailed over by the landlord and filed here",
    fires: "lib/certificate-share.ts → shareCertificate(), behind the certificate_share switch",
    to: "The landlord on the REX record, with the certificate attached",
    summary:
      "Their copy, and the fact that we hold it. Leads on it being filed rather than on the attachment, because a landlord who knows we have it stops keeping a parallel folder - which is the habit that produces two different expiry dates for one boiler. No invoice and no cost, ever.",
    doc: CERTIFICATE_SHARED_LANDLORD,
    render: (o) => blocksAs("landlord")(withSample(o ?? CERTIFICATE_SHARED_LANDLORD))(),
  },
  {
    id: "certificate-shared-tenant",
    group: "Compliance",
    name: "Renewed Certificate — Tenant",
    audience: "tenant",
    trigger: "The same moment, when somebody is living there",
    fires: "lib/certificate-share.ts → shareCertificate(), behind the certificate_share switch",
    to: "The sitting tenant, with the certificate attached",
    summary:
      "The legal one: the tenant is entitled to a copy and by law must have it within 30 days, which Michael does by hand in Propoly today. The second line says nothing is wrong, because a document arriving unannounced from a letting agent reads as a problem and produces a phone call.",
    doc: CERTIFICATE_SHARED_TENANT,
    render: (o) => blocksAs("tenant")(withSample(o ?? CERTIFICATE_SHARED_TENANT))(),
  },
  {
    id: "certificate-shared-contractor",
    group: "Compliance",
    name: "Renewed Certificate — Contractor",
    audience: "contractor",
    trigger: "The certificate came in from the contractor's own page",
    fires: "lib/certificate-share.ts → shareCertificate(), behind the certificate_share switch",
    to: "The contractor who produced it",
    summary:
      "Closes the loop on the one thing they cannot see from their own page: that the document reached the landlord and the tenant, and what date we will chase the next renewal from. Not a receipt, and nothing about their invoice.",
    doc: CERTIFICATE_SHARED_CONTRACTOR,
    render: (o) => blocksAs("contractor")(withSample(o ?? CERTIFICATE_SHARED_CONTRACTOR))(),
  },
  {
    id: "certificate-shared-compliance",
    group: "Compliance",
    name: "Certificate Sent — Audit Trail",
    audience: "internal",
    trigger: "Every armed fan-out, including the ones that reached nobody. Shadow runs are recorded on the certificate rather than emailed, so the backlog cannot bury this inbox",
    fires: "lib/certificate-share.ts → shareCertificate()",
    to: "The compliance inbox set under Maintenance, Invoices",
    summary:
      "James, 14 Sep 2026: \"that needs to go out to all parties via email for audit log trail purposes.\" There is a table behind this too (os_certificate_sends), but a dated email in the compliance mailbox is evidence that does not depend on us. Lists the failures as loudly as the sends, because a fan-out that reached the landlord and not the tenant is the case that matters.",
    render: () => {
      const m = certificateSharedEmail({
        label: "Gas safety (CP12)",
        propertyName: "41 Harewood Road, Coventry CV4 8LP",
        expiry: "12 September 2027",
        fileName: "CP12-41-Harewood-Road.pdf",
        source: "the contractor's page",
        armed: true,
        link: `${SITE}/portfolio`,
        outcomes: [
          { role: "landlord", name: "Helen Prior", address: "helen.prior@example.com", sent: true, note: "sent with the certificate attached" },
          { role: "tenant", name: "Sophie Adeyemi", address: "sophie.a@example.com", sent: true, note: "sent with the certificate attached" },
          { role: "contractor", name: "Redland Plumbing & Heating", address: "dev@redlandph.example.com", sent: true, note: "sent with the certificate attached" },
        ],
      });
      return { subject: m.subject, html: m.html };
    },
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
    fires: "Opened after booking on the appraisal file (components/appraisal/ConfirmLine) and the lead (AppraisalTrack) → components/ConfirmSheet → /api/confirmations → lib/appraisal-confirm.ts; recorded in lib/confirmations so it is never sent twice by accident",
    to: "The landlord",
    summary:
      "Short, sent the moment it is booked, however it was booked. The date, time, address and agent on their own lines in bold, and the calendar invite attached. One of only two emails before the visit: this, and the pre-presentation the day before.",
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
      "The day before. A button straight to their pre-presentation - who is coming, what happens on the day, how long it takes - which opens without an account. Nothing to set up until after the valuation.",
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
    summary: "The same for every landlord: the suggested rent, the fee, a button to their presentation and terms, and let me know what you think. Never the agent's own notes.",
    render: () =>
      renderPlain(postSubjectFor(SAMPLE_INVITE), postBodyFor(SAMPLE_INVITE, {
        valuation: 1250,
        askingRent: 1300,
        feePercent: 10,
        availableFrom: null,
        summary: "Wants it on the market before Christmas. Weighing us against one other agent.",
        fileUrl: `${SITE}/landlord/enter?token=example`,
      })),
  },

  {
    id: "landlord-contract-pack",
    group: "Market appraisals",
    name: "Your Presentation and Your Contract",
    audience: "landlord",
    trigger: "The agent presses Send on Prepare and send, after reading the deck, checking the figures and signing their half. Send a reminder on the file sends it again",
    fires: "Wired 15 Sep 2026. components/appraisal/PrepareAndSend.tsx and TermsCard.tsx → POST /api/appraisals/[id]/terms → lib/contract-send.ts, on the public sender, reply-to the agent.",
    to: "The landlord on the appraisal",
    summary:
      "Susan's one send (14 Sep): the post-appraisal presentation and the contract together, from the agent, instead of DocuSeal's own invite with the deck going separately. The deck opens without signing in; the contract is signed inside their property file, which the second button signs them straight into.",
    doc: LANDLORD_CONTRACT_PACK,
    render: (o) =>
      blocksAs("landlord")(
        withSample(o ?? LANDLORD_CONTRACT_PACK, {
          firstName: "Helen",
          address: "12 Chorlton Road",
          rent: "£1,300",
          serviceLevel: "Fully managed",
          serviceLine: "a fully managed service",
          agentName: "Rhiannon Dodge",
          agentFirst: "Rhiannon",
          deckLink: `${SITE}/present/example`,
          link: `${SITE}/landlord/enter?token=example`,
        })
      )(),
  },
  {
    id: "landlord-docs-nudge",
    group: "Market appraisals",
    name: "Just the Paperwork Left",
    audience: "landlord",
    trigger: "The agent presses Send a nudge for the documents at the end of the take-on write-up",
    fires: "Wired 17 Sep 2026. components/appraisal/TakeOnWizard.tsx → POST /api/appraisals/[id]/docs-nudge, on the public sender, reply-to the agent.",
    to: "The landlord whose documents are outstanding",
    summary: "Names what is actually missing and lands them on their own documents page. Sent when the photographs are done and the paperwork is the only thing holding the advert up.",
    doc: LANDLORD_DOCS_NUDGE,
    render: (o) =>
      blocksAs("landlord")(
        withSample(o ?? LANDLORD_DOCS_NUDGE, {
          firstName: "Helen",
          address: "12 Chorlton Road",
          what: "your EPC and your gas safety certificate",
          whatCap: "Your EPC and your gas safety certificate",
          link: `${SITE}/landlord/enter?token=example&next=/landlord/documents`,
        })
      )(),
  },
  {
    id: "landlord-message-reply",
    group: "Market appraisals",
    name: "A Reply From Your Agent",
    audience: "landlord",
    trigger: "The agent replies to a landlord's message from the Messages panel on the appraisal",
    fires: "Wired 17 Sep 2026. app/(os)/market-appraisals/[id] → POST /api/appraisals/[id]/messages → lib/appraisal-messages.ts, on the public sender, reply-to the agent.",
    to: "The landlord who messaged",
    summary: "The reply in full, so a short answer needs no click, and a button into the thread on their file.",
    doc: LANDLORD_MESSAGE_REPLY,
    render: (o) =>
      blocksAs("landlord")(
        withSample(o ?? LANDLORD_MESSAGE_REPLY, {
          firstName: "Helen",
          agentFirst: "Rhiannon",
          address: "12 Chorlton Road",
          preview: "Yes, Thursday works - I'll bring the keys.",
          bodyHtml: "Yes, Thursday works - I'll bring the keys.",
          link: `${SITE}/landlord/enter?token=example&next=/landlord/messages`,
        })
      )(),
  },
  {
    id: "landlord-contract-nudge",
    group: "Market appraisals",
    name: "A Reminder to Sign Your Contract",
    audience: "landlord",
    trigger: "The agent presses Nudge to sign on the appraisal, and on its own two, five and nine days after the terms were sent, until they are signed",
    fires: "Wired 17 Sep 2026. components/appraisal/TermsCard.tsx → POST /api/appraisals/[id]/nudge, and os-cron-scheduled-sends → lib/contract-nudge.ts, on the public sender, reply-to the agent.",
    to: "The landlord on the appraisal",
    summary:
      "James, 17 Sep: a nudge the agent can send from the file that also runs on its own. The button signs them in and opens the contract on their property file.",
    doc: LANDLORD_CONTRACT_NUDGE,
    render: (o) =>
      blocksAs("landlord")(
        withSample(o ?? LANDLORD_CONTRACT_NUDGE, {
          firstName: "Helen",
          address: "12 Chorlton Road",
          agentFirst: "Rhiannon",
          link: `${SITE}/landlord/enter?token=example`,
        })
      )(),
  },
  {
    id: "landlord-questions-chase",
    group: "Market appraisals",
    name: "Signed - A Few Questions Left",
    audience: "landlord",
    trigger: "Two, five and nine days after a landlord signs, while their property questions are not finished. Never once they are",
    fires: "Wired 15 Sep 2026. os-cron-daily → POST /api/landlord/property-answers/chase → lib/property-answers-chase.ts, on the public sender.",
    to: "The landlord who signed",
    summary:
      "Susan, 14 Sep: the questionnaire keeps emailing them until it is finished. Says how far they got, lands them on the questions rather than their home page, and stops at three - a chase that never ends is one that gets filtered.",
    doc: LANDLORD_QUESTIONS_CHASE,
    render: (o) =>
      blocksAs("landlord")(
        withSample(o ?? LANDLORD_QUESTIONS_CHASE, {
          firstName: "Helen",
          address: "12 Chorlton Road, Manchester M15 4AZ",
          left: "three short parts",
          leftCap: "Three short parts",
          link: `${SITE}/landlord/enter?token=example&next=/landlord/questions`,
        })
      )(),
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
     until the public Letting Experts sending domain exists - lib/email-policy
     refuses every non-internal address, so as things stand these can only be
     sent to a colleague from Admin -> Emails. That is exactly what they are
     for today: reading the words, and deciding what the screens behind them
     have to deliver. ── */
  {
    id: "application-accepted-landlord",
    group: "Doorways",
    name: "Application Accepted (landlord)",
    audience: "landlord",
    trigger: "An offer is accepted and the handover runs",
    fires: "Wired 16 Sep 2026. lib/handover.ts, from the agent's own mailbox (lib/send-as-agent). Howard's REX template 10978, carried across word for word - still to be rewritten and styled.",
    to: "The landlord whose property it is",
    summary: "Tells the landlord the application is accepted, lists what was agreed, and says references are starting. Howard's wording, not ours yet.",
    doc: APPLICATION_ACCEPTED_LANDLORD,
    render: (o) =>
      blocksAs("landlord")(
        withSample(o ?? APPLICATION_ACCEPTED_LANDLORD, {
          landlordName: "Mr Raj Patel",
          address: "Flat 2, Mercer Street, Manchester M4 1SL",
          detailsList:
            "Offer amount: £1,250 pcm<br>Start date: 01/10/2026<br>Length of tenancy: 12 months<br>Conditions: none<br>Date received: 16/09/2026<br>Has pets: No<br>Number of occupants: 2<br>Tenant names: Sophie Clark, Daniel Clark",
          agentName: "Rhiannon Dodge",
          agentPhone: "0161 883 2525",
          agentEmail: "rhiannon@thelettingexperts.co.uk",
        })
      )(),
  },
  {
    id: "application-accepted-tenant",
    group: "Doorways",
    name: "Application Accepted (tenant)",
    audience: "tenant",
    trigger: "An offer is accepted and the handover runs",
    fires: "RETIRED 16 Sep 2026. The handover sends The Landlord Has Said Yes (application-its-yours) instead. Kept so its words can still be read.",
    draft: true,
    to: "Each tenant on the application",
    summary: "Tells the tenant the landlord has accepted, subject to references and contracts, lists what was agreed and what to do next. The holding-fee sentence changes in Scotland and that wording is a placeholder.",
    doc: APPLICATION_ACCEPTED_TENANT,
    render: (o) =>
      blocksAs("tenant")(
        withSample(o ?? APPLICATION_ACCEPTED_TENANT, {
          tenantName: "Sophie Clark",
          address: "Flat 2, Mercer Street, Manchester M4 1SL",
          detailsList:
            "Offer amount: £1,250 pcm<br>Start date: 01/10/2026<br>Length of tenancy: 12 months<br>Conditions: none<br>Date received: 16/09/2026<br>Has pets: No<br>Number of occupants: 2<br>Tenant names: Sophie Clark, Daniel Clark",
          payLine:
            "You will now receive an invite from Propoly to pay the holding fee, if applicable, and to complete your referencing information.",
          agentName: "Rhiannon Dodge",
          agentPhone: "0161 883 2525",
          agentEmail: "rhiannon@thelettingexperts.co.uk",
        })
      )(),
  },
  {
    id: "viewing-cancelled",
    group: "Doorways",
    name: "Viewing Cancelled",
    audience: "tenant",
    trigger: "The agent cancels a booked viewing on the Viewings drawer",
    fires: "Wired 15 Sep 2026. components/ViewingDrawer.tsx → POST /api/viewings/change → lib/viewing-change.ts, on the public sender, reply-to the agent.",
    to: "The applicant who was booked",
    summary: "Says it is off, says sorry once, gives the reason in plain words when there is one, and offers another time by reply. The landlord sees the cancellation on their portal, not by email.",
    doc: VIEWING_CANCELLED,
    render: (o) =>
      blocksAs("tenant")(
        withSample(o ?? VIEWING_CANCELLED, {
          firstName: "Sophie",
          address: "Flat 2, Mercer Street, Manchester M4 1SL",
          whenPretty: "Thursday 4 September at 5:30pm",
          reasonLine: "The landlord needs the property that afternoon.",
          agentName: "Rhiannon Dodge",
        })
      )(),
  },
  {
    id: "viewing-moved",
    group: "Doorways",
    name: "Viewing Moved",
    audience: "tenant",
    trigger: "The agent reschedules a booked viewing on the Viewings drawer",
    fires: "Wired 15 Sep 2026. components/ViewingDrawer.tsx → POST /api/viewings/change → lib/viewing-change.ts, on the public sender, reply-to the agent, with the new time as a calendar file.",
    to: "The applicant who was booked",
    summary: "Old time, new time, who is meeting them, and the new time attached so it goes straight into their calendar.",
    doc: VIEWING_MOVED,
    render: (o) =>
      blocksAs("tenant")(
        withSample(o ?? VIEWING_MOVED, {
          firstName: "Sophie",
          address: "Flat 2, Mercer Street, Manchester M4 1SL",
          oldWhen: "Thursday 4 September at 5:30pm",
          whenPretty: "Friday 5 September at 12:30pm",
          agentName: "Rhiannon Dodge",
          meetLine: "Rhiannon Dodge will meet you there.",
        })
      )(),
  },
  {
    id: "tenant-passport-invite",
    group: "Doorways",
    name: "Viewing Booked - Start Your Passport",
    audience: "tenant",
    trigger: "A viewing is booked for a tenant",
    fires: "Wired. Opened for the agent after every booking (17 Sep 2026: read, edit, Send - never sent on its own), by lib/viewing-confirm.ts, from the agent's own Outlook where it is connected, with the calendar file; also by hand from a viewing (Invite to the passport). Mints the passport and links to it.",
    to: "The tenant who booked the viewing",
    /* Not a draft since 15 Sep 2026: lib/viewing-confirm.ts sends it on every
       booking with an applicant email. */
    draft: false,
    summary:
      "Turns a booked viewing into a started passport. Leads on the payoff to THEM - fill it in once and it answers every application - rather than on us needing documents. Says plainly, in the body rather than a footnote, that nothing is shared with a landlord until they apply: referencing and right-to-rent are intrusive to hand over, and somebody who thinks a landlord can already see it will not fill it in.",
    doc: TENANT_PASSPORT_INVITE,
    render: (o) =>
      blocksAs("tenant")(
        withSample(o ?? TENANT_PASSPORT_INVITE, {
          firstName: "Sophie",
          address: "Flat 2, Mercer Street, Manchester M4 1SL",
          whenPretty: "Thursday 4 September at 5:30pm",
          agentName: "Rhiannon Dodge",
          meetLine: "Rhiannon Dodge will meet you there.",
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
    fires: "Wired 2 Sep 2026. Goes on the public Letting Experts sender (RESEND_FROM_PUBLIC) to the email on the landlord's REX owner contact.",
    to: "The landlord, at the address REX holds for them",
    draft: false,
    summary:
      "No password. The link is the sign-in, single use and a day long, the same way the deck and the passport already work. It only ever goes to an address that is the owner contact on a managed listing, so a stranger typing an email gets the same on-screen answer and no email.",
    doc: LANDLORD_SIGN_IN,
    render: (o) =>
      blocksAs("landlord")(
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
      blocksAs("tenant")(
        withSample(o ?? TENANT_SIGN_IN, {
          firstName: "Sophie",
          link: `${SITE}/tenant/enter?token=sample`,
        })
      )(),
  },
];


/* One worked job, so every maintenance email previews as a real one. */
const WORKS_SAMPLE: Record<string, string> = {
  ref: "1042", title: "Boiler not firing, no hot water", address: "41 Harewood Road, Coventry CV4 8LP", category: "Heating & boiler",
  urgency: "Urgent", dueBy: "Thursday 10 September, 09:00", scheduledAt: "Tuesday 8 September, 10:00", contractorName: "R. Holt Heating", contractorGreeting: "Rob",
  contractorPhone: "07700 900123", tenantName: "Marcus", tenantPhone: "07700 900456", landlordName: "Helen", access: "Tenant home after 5pm; dog in the garden",
  description: "Tenant rang at 8am. Pressure gauge reads zero, boiler shows fault code F22.", quote: "£240", authority: "£150",
  agentName: "Michael Healy", agentEmail: "michael@thelettingexperts.co.uk", agentPhone: "0115 123 4567", completionNote: "PCB replaced, system repressurised and tested.",
  number: "INV-00042", toName: "Helen", total: "£264", dueDate: "21 September 2026", reference: "job #1042, boiler repair", link: `${SITE}/invoice/sample`,
  contractorLink: `${SITE}/contractor/sample`, happyLink: `${SITE}/repair/sample?happy=yes`, notHappyLink: `${SITE}/repair/sample?happy=no`,
};
const worksEntry = (id: string, name: string, audience: CatalogEntry["audience"], trigger: string, to: string, summary: string, doc: EmailDoc, group = "Maintenance"): CatalogEntry => ({
  id, group, name, audience, trigger, fires: "lib/works-emails, from the job's own moves", to, summary, doc,
  render: (o) => blocks(withSample(o ?? doc, WORKS_SAMPLE), audience)(),
});
TLE_EMAILS.push(
  worksEntry("works-contractor-order", "Works Order to the Contractor", "contractor", "When a contractor is put on a job", "The contractor", "The job sheet by email: what, where, how urgent, access, the tenant to arrange with, and the rule that anything over the landlord's authority needs a quote first.", WORKS_CONTRACTOR_ORDER as unknown as EmailDoc),
  worksEntry("works-contractor-booked", "Booking Confirmed to the Contractor", "contractor", "When a job is booked for a date", "The contractor", "The date, the address, the access. Short, because they have the order already.", WORKS_CONTRACTOR_BOOKED as unknown as EmailDoc),
  worksEntry("works-contractor-cancelled", "Cancelled to the Contractor", "contractor", "When a job with a contractor on it is cancelled", "The contractor", "Don't attend, and why.", WORKS_CONTRACTOR_CANCELLED as unknown as EmailDoc),
  worksEntry("works-tenant-received", "Repair Logged to the Tenant", "tenant", "When a repair is reported and the tenant's address is on the job", "The tenant", "It's logged, how urgent we've marked it, when to expect somebody, and what to do if it gets worse.", WORKS_TENANT_RECEIVED as unknown as EmailDoc),
  worksEntry("works-tenant-booked", "Contractor Booked to the Tenant", "tenant", "When a job is booked for a date", "The tenant", "Who is coming and when, and how to move it.", WORKS_TENANT_BOOKED as unknown as EmailDoc),
  worksEntry("works-tenant-done", "Job Done to the Tenant", "tenant", "When a job is marked done", "The tenant", "It's done, here's what was done, tell us if it isn't right.", WORKS_TENANT_DONE as unknown as EmailDoc),
  worksEntry("works-landlord-approval", "Quote for Approval to the Landlord", "landlord", "When a quote comes in over the landlord's authority", "The landlord", "The quote, why we're asking, and a one-word reply to go ahead.", WORKS_LANDLORD_APPROVAL as unknown as EmailDoc),
  worksEntry("works-landlord-report", "Repair Reported to the Landlord", "landlord", "Step 1: when the agent emails the report after ringing", "The landlord", "What the tenant reported, how urgent, and the two ways forward: they arrange it, or we do.", WORKS_LANDLORD_REPORT as unknown as EmailDoc),
  worksEntry("works-contractor-report", "Can You Take This? to the Contractor", "contractor", "Step 4: when the agent contacts a contractor about a job", "The contractor", "The job in brief and a yes-or-no. The works order follows once they say yes.", WORKS_CONTRACTOR_REPORT as unknown as EmailDoc),
  worksEntry("works-tenant-found", "We've Found Someone to the Tenant", "tenant", "Step 5: the moment a contractor confirms, alongside the works order", "The tenant", "Who's coming, that they'll be in touch to arrange access, and what to do if they aren't.", WORKS_TENANT_FOUND as unknown as EmailDoc),
  worksEntry("works-landlord-arranged", "Arranged to the Landlord", "landlord", "Step 6: once a date is set", "The landlord", "Who's booked and when, and that nothing is needed from them.", WORKS_LANDLORD_ARRANGED as unknown as EmailDoc),
  worksEntry("works-contractor-done-request", "All Done? to the Contractor", "contractor", "Step 7: the day after the booked date", "The contractor", "One page to mark it done, add photos and drop in the invoice, which goes straight to accounts.", WORKS_CONTRACTOR_DONE_REQUEST as unknown as EmailDoc),
  worksEntry("works-tenant-happy", "Are You Happy? to the Tenant", "tenant", "Step 8: when the job is marked done", "The tenant", "A yes and a no. A no comes straight back to the agent.", WORKS_TENANT_HAPPY as unknown as EmailDoc),
  worksEntry("invoice-sent", "Invoice to the Landlord", "landlord", "When an invoice is sent from Maintenance, Invoices", "Whoever the invoice is to - usually the landlord", "The figure, the due date and the button that opens the invoice page.", INVOICE_SENT as unknown as EmailDoc, "Invoices"),
);

/* One worked visit, so the inspection emails preview as real ones. */
const INSPECTION_SAMPLE: Record<string, string> = {
  address: "41 Harewood Road, Coventry CV4 8LP", tenantName: "Marcus", landlordName: "Helen", inspector: "Rhiannon Dodge",
  howLong: "20 minutes", noticeHours: "24", whenPretty: "Tuesday 22 September at 10:00", conditionWord: "in good order",
  slots: "Tuesday 22 September, 10:00<br>Wednesday 23 September, 14:00<br>Friday 25 September, 09:30",
  summary: "The property is being looked after. The garden is tidy, no damp anywhere and the alarms all tested fine.",
  findings: "Kitchen - extractor fan noisy, we will get somebody out.<br>Bathroom - sealant around the bath going black, on the list.<br>Outside - gutter above the front door needs clearing.",
  accessLink: `${SITE}/visit/sample`, reportLink: `${SITE}/inspections?open=sample`,
  agentName: "Rhiannon Dodge", agentPhone: "0115 123 4567",
};
const inspectionEntry = (id: string, name: string, audience: CatalogEntry["audience"], trigger: string, to: string, summary: string, doc: EmailDoc): CatalogEntry => ({
  id, group: "Inspections", name, audience, trigger, fires: "lib/inspection-emails, from the inspection's own moves", to, summary, doc,
  render: (o) => blocks(withSample(o ?? doc, INSPECTION_SAMPLE), audience)(),
});
TLE_EMAILS.push(
  inspectionEntry("inspection-tenant-access", "Can We Visit? to the Tenant", "tenant", "When an agent asks the tenant for access on an inspection", "The tenant", "The ask, not the telling: why we come, how long it takes, the dates on offer and a link to choose one or say none of them work. Their answer is what the OS keeps as the permission.", INSPECTION_TENANT_ACCESS as unknown as EmailDoc),
  inspectionEntry("inspection-tenant-booked", "Visit Confirmed to the Tenant", "tenant", "When a date is agreed and confirmed", "The tenant", "The date in writing, which is the notice, plus an invitation to raise anything bothering them before we arrive.", INSPECTION_TENANT_BOOKED as unknown as EmailDoc),
  inspectionEntry("inspection-landlord-report", "Visit Report to the Landlord", "landlord", "When the report is sent from the inspection sheet", "The landlord", "How their property is being kept, what we found room by room, and what happens next about each of it.", INSPECTION_LANDLORD_REPORT as unknown as EmailDoc),
);


export const EMAIL_GROUPS = ["Pre-launch", "Market appraisals", "Compliance", "Pre-tenancy", "Maintenance", "Inspections", "Invoices", "Terms of business", "Accounts", "Tools"];

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
export function renderComplianceAgentChase(input: { firstName: string; lines: string[] }): { subject: string; html: string } {
  /* Since 6 Sep 2026 this is the shared TLE OS shell, not the block document
     - see lib/email/agent-emails. Kept under its old name for any caller. */
  const m = certificateChaseEmail(input);
  return { subject: m.subject, html: m.html };
}

/** An agent's own compliance, item 11 - the same shape as the certificate chase. */
export function renderAgentComplianceChase(input: { firstName: string; lines: string[] }): { subject: string; html: string } {
  const m = ownComplianceEmail(input);
  return { subject: m.subject, html: m.html };
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
  const out = blocks(doc as unknown as EmailDoc, "landlord")();
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

/* ── The three that were never in the catalogue ──────────────────────────
 *
 * All three go to OUR OWN inboxes, and all three were invisible here: the
 * roll-up because it was never added, and the two maintenance ones because
 * their words were written inline inside the sending code, so the only way
 * to read one was to make a job move and send it.
 *
 * This screen exists so an email can be read before it goes out. An email
 * that cannot be read here is the one that goes out wrong.
 */

/** One finished job, so both maintenance inbox emails preview as real ones. */
const JOB_SAMPLE = {
  id: "job-sample",
  ref: 1042,
  kind: "repair",
  category: "Heating & boiler",
  title: "Boiler not firing, no hot water",
  propertyName: "41 Harewood Road",
  locality: "Coventry CV4 8LP",
  landlord: "Helen Marsh",
  contractorName: "R. Holt Heating",
  completedAt: "2026-09-08T10:30:00.000Z",
  completionNote: "PCB replaced, system repressurised and tested.",
  completionNote2: "",
  payee: "contractor",
  raisedBy: "Michael Healy",
  invoicePence: 26400,
  invoiceRef: "INV-00042",
  files: [{ name: "Gas safety certificate.pdf" }, { name: "Boiler photo.jpg" }],
} as unknown as WorksOrder;

TLE_EMAILS.push(
  {
    id: "own-compliance-rollup",
    group: "Compliance",
    name: "Own Compliance Roll-up — Compliance",
    audience: "internal",
    trigger: "Every morning, alongside the agents' own reminders",
    fires: "app/api/agent-compliance/remind (cron, POST with x-cron-key)",
    to: "Whoever holds the compliance role — Michael",
    summary:
      "The same morning as every short agent gets their own reminder, one list of who is short and on what, from the other side. Nobody is chased twice by it: it reports, it does not ask.",
    render: () => {
      const m = ownComplianceRollupEmail({
        people: [
          { name: "Helen Marsh", lines: ["Right to Rent training - expired 2026-08-30", "DBS check - not on file"] },
          { name: "Dan Richards", lines: ["Professional indemnity - runs out 2026-09-28 (22 days)"] },
        ],
      });
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "works-accounts-invoice",
    group: "Maintenance",
    name: "Invoice In — Accounts",
    audience: "internal",
    trigger: "When a contractor's invoice lands on a job",
    fires: "lib/works-emails → tellAccounts",
    to: "The accounts inbox set under Maintenance, Invoices",
    summary:
      "A figure to key into PayProp, not a receipt: nothing in it has been paid. Says who is owed, against which job and which property, and drops off the accounts list once it is marked paid.",
    render: () => {
      const m = accountsInvoiceEmail(JOB_SAMPLE);
      return { subject: m.subject, html: m.html };
    },
  },
  {
    id: "works-compliance-done",
    group: "Maintenance",
    name: "Job Finished — Compliance",
    audience: "internal",
    trigger: "When a job is marked done, and again if a document lands on a job that is already finished",
    fires: "lib/works-emails → tellCompliance",
    to: "The compliance inbox set under Maintenance, Invoices — Michael",
    summary:
      "Compliance hears twice at most and never while a job is open. Once when it is finished with every document on it listed, and again for the certificate that follows the visit. A photo taken mid-visit is silent.",
    render: () => {
      const m = complianceJobEmail(JOB_SAMPLE, "done");
      return { subject: m.subject, html: m.html };
    },
  }
);


/* ── The tenant process (16 Sep 2026) ──────────────────────────────────────

   Every email the tenant process map had as Planned, written. None of them is
   sent by anything yet, and each entry's `fires` says what it is waiting on -
   the map shows them as Written for the same reason. One worked tenant runs
   through all of them, so the set reads as one person's journey. */

const TENANT_SAMPLE: Record<string, string> = {
  firstName: "Sophie",
  tenantName: "Sophie Clark",
  address: "Flat 2, Mercer Street, Manchester M4 1SL",
  rent: "£1,250 pcm",
  agentName: "Rhiannon Dodge",
  agentPhone: "0161 883 2525",
  agentEmail: "rhiannon@thelettingexperts.co.uk",
  link: `${SITE}/tenant/next`,
  passportLink: `${SITE}/tenant/welcome`,
  whenPretty: "Thursday 4 September at 5:30pm",
  timePretty: "5:30pm",
  viewedOn: "this afternoon",
  meetLine: "Rhiannon Dodge will meet you at the front door.",
  contactLine: "Call Rhiannon on <strong>0161 883 2525</strong> or reply to this email, and we'll move it.",
  mapLink: "https://www.google.com/maps/search/?api=1&query=Mercer+Street+Manchester+M4+1SL",
  count: "3",
  availableLine: "Good news: it's still available, from 1 October.",
  moveInList:
    "Holding fee (one week's rent): <strong>£288</strong><br>Deposit (five weeks' rent): <strong>£1,442</strong><br>First month's rent: <strong>£1,250</strong>",
  slotsList: "<strong>Thursday 4 September</strong>, 5:30pm<br><strong>Friday 5 September</strong>, 12:30pm<br><strong>Saturday 6 September</strong>, 10:00am",
  onNowLine: "We have 14 homes on in Manchester right now.",
  homesList:
    "<strong>£1,195 pcm</strong> · 2 bed apartment, Ancoats M4<br><strong>£1,250 pcm</strong> · 2 bed apartment, Northern Quarter M1<br><strong>£1,100 pcm</strong> · 1 bed apartment with parking, Castlefield M3",
  reasonLine: "You said the second bedroom was too small for a desk.",
  offerLine: "You offered <strong>£1,250 pcm</strong>, from <strong>1 October</strong>, for 12 months.",
  holdingFee: "£288",
  adultsLine: "Everyone over 18 who is moving in gets their own link and fills in their own form.",
  termLine: "The tenancy is for 12 months from 1 October.",
  missingList: "<strong>Your employer's contact email</strong><br><strong>Your address history</strong> for 2023 and 2024<br><strong>Daniel Clark</strong> hasn't started his form yet",
};

const tenantEntry = (
  id: string,
  name: string,
  trigger: string,
  fires: string,
  to: string,
  summary: string,
  doc: EmailDoc,
  extra: Record<string, string> = {}
): CatalogEntry => ({
  id,
  group: "Tenant process",
  name,
  audience: "tenant",
  trigger,
  fires,
  to,
  /* Wired ones say "Wired" first in `fires`; the rest are drafts. */
  draft: !fires.startsWith("Wired"),
  summary,
  doc,
  render: (o) => blocksAs("tenant")(withSample(o ?? doc, { ...TENANT_SAMPLE, ...extra }))(),
});

TLE_EMAILS.push(
  tenantEntry(
    "tenant-enquiry-reply",
    "About the Home You Asked About",
    "A tenant enquires about one property",
    "Wired 16 Sep 2026. lib/tenant-journey-emails enquiryReplies, on the leads scan every five minutes: a Letting lead first seen in the last two hours on a home still live with a rent. The move-in costs are worked out from the rent, England and Scotland apart. The button is their passport. Needs the Automatic tenant emails switch and customer email.",
    "The person who enquired",
    "Straight away: is it still there, what the rent is, the three things it costs to move in, the next viewing times, and the passport as a single link rather than a second button. The move-in costs are one list the send path builds from the rent.",
    TENANT_ENQUIRY_REPLY,
    { link: `${SITE}/tenant/welcome`, feesLine: "No admin fees and no referencing fees. The holding fee goes towards your first month's rent." }
  ),
  tenantEntry(
    "tenant-added-welcome",
    "Let's Find You a Home",
    "An agent registers a tenant with no property in mind",
    "Wired 16 Sep 2026. POST /api/contacts, when an agent adds a tenant with an email address, from that agent. The button is their passport. Needs the Automatic tenant emails switch and customer email.",
    "The tenant who was added",
    "The search, not a property: what we need to know, one button into the passport where they tell us, and a promise to send what fits the same day.",
    TENANT_ADDED_WELCOME,
    { link: `${SITE}/tenant/welcome` }
  ),
  tenantEntry(
    "tenant-passport-nudge-1",
    "Passport Nudge: Two Days",
    "Two days after a passport invite, with nothing typed",
    "Wired 16 Sep 2026. lib/tenant-reminders, hourly from os-cron-reminders via /api/tenant/reminders/run: passports invited two to five days ago with nothing typed. Once per passport. Needs the Tenant reminders switch and customer email on.",
    "The tenant who was invited",
    "Short on purpose: it is still waiting, ten minutes, stop and come back, nothing shared until they apply.",
    TENANT_PASSPORT_NUDGE_1,
    { link: `${SITE}/tenant/welcome` }
  ),
  tenantEntry(
    "tenant-passport-nudge-2",
    "Passport Nudge: a Week",
    "Seven days after a passport invite, still nothing",
    "Wired 16 Sep 2026. Same run as the two-day nudge, for passports invited seven to ten days ago with nothing typed. The last one: there is no third. Needs the Tenant reminders switch and customer email on.",
    "The tenant who was invited",
    "Not a louder reminder but the reason: the same details every time, and ready applications go first. Ends with a way out if they have found somewhere.",
    TENANT_PASSPORT_NUDGE_2,
    { link: `${SITE}/tenant/welcome` }
  ),
  tenantEntry(
    "tenant-matches",
    "Homes That Fit",
    "A tenant is qualified, and again when an agent sends homes from a lead",
    "Wired 16 Sep 2026. A lead's Email properties -> POST /api/leads/email-properties, from the agent's own Outlook where that is armed and connected, otherwise the Letting Experts sender. Mints the passport the button opens. Needs customer email on.",
    "The tenant on the lead",
    "The homes the agent ticked, one line each with the rent first, and one ask: reply with the ones to see. The button is their passport, so the one that fits can be applied for the same day.",
    TENANT_MATCHES,
    { introLine: "Here are the homes on with us right now that I think fit what you're after.", link: `${SITE}/tenant/welcome` }
  ),
  tenantEntry(
    "tenant-matches-again",
    "Anything Close?",
    "Four days after homes were sent, with no reply",
    "Wired 16 Sep 2026. Hourly: four to seven days after Homes That Fit, when no viewing has been booked for them since and something has come on near the homes sent, published after the send. Nothing new, nothing sent. Needs the Automatic tenant emails switch and customer email.",
    "The tenant",
    "Asks whether the brief has changed, shows what has come on since, and lets them stop the emails by saying they have found somewhere.",
    TENANT_MATCHES_AGAIN,
    { link: `${SITE}/tenant/welcome` }
  ),
  tenantEntry(
    "viewing-reminder",
    "Your Viewing Is Today",
    "7am on the day of a booked viewing",
    "Wired 16 Sep 2026. lib/tenant-reminders, hourly: from 7am to 1pm London time, today's TLE viewings in the ledger that have not started or been cancelled. Once per applicant per viewing, as the agent where their Outlook is connected. Needs the Tenant reminders switch and customer email on.",
    "The applicant who is booked",
    "The one email that stops a no-show: the time, the address with a map button, who is meeting them, the agent's mobile, and how to move it without a fuss.",
    VIEWING_REMINDER
  ),
  tenantEntry(
    "viewing-rebook",
    "Shall We Rebook?",
    "Two hours after a viewing is closed as a no-show",
    "Wired 16 Sep 2026. Hourly: two hours to three days after the agent records a no-show on the viewing drawer, from that agent. Rebooked by reply. Needs the Automatic tenant emails switch and customer email.",
    "The applicant who didn't turn up",
    "No telling off: we missed you, things come up, here are three more times, and a way to say it is not the one.",
    VIEWING_REBOOK,
    { whenPretty: "on Thursday 4 September" }
  ),
  tenantEntry(
    "viewing-feedback",
    "How Was It?",
    "Two hours after a viewing is closed as happened",
    "Wired 16 Sep 2026. Hourly: two to twenty-six hours after a TLE viewing ends, unless it was recorded as a no-show. The link carries a per-applicant token (os_tenant_feedback) and opens /tenant/feedback on the home they saw; the answers go to the agent by email. Needs the Automatic tenant emails switch and customer email.",
    "The applicant who viewed",
    "One button, to the feedback page already signed in, where they can also put an offer in. Says why it matters to them: it decides what we send next.",
    VIEWING_FEEDBACK,
    { link: `${SITE}/tenant/feedback` }
  ),
  tenantEntry(
    "viewing-not-for-them",
    "Not That One, Try These",
    "The same day feedback says the home wasn't for them",
    "Wired 16 Sep 2026. Straight after the tenant answers Not this one on the feedback page: live homes in the same postcode district at a rent within a fifth, quoting their concern back. Nothing similar, nothing sent. Needs the Automatic tenant emails switch and customer email.",
    "The applicant who viewed",
    "Repeats back what they didn't like, so they know it was heard, and shows homes that don't have it.",
    VIEWING_NOT_FOR_THEM,
    { reasonLine: "You said: \"The second bedroom was too small for a desk.\"" }
  ),
  tenantEntry(
    "application-received",
    "We Have Your Application",
    "A tenant applies for a property",
    "Wired 16 Sep 2026. Hourly: an application REX shows as received in the last three days, the first time the OS sees it, to each applicant with an email. The first run after switching on records the book and sends nothing. Needs the Automatic tenant emails switch and customer email.",
    "The tenant who applied",
    "What we do with it, when they will hear (the moment the landlord answers, either way), the holding fee if it is a yes, and the four things to have ready for referencing.",
    APPLICATION_RECEIVED,
    { holdingFeeLine: HOLDING_FEE_WORDING.england.ifYes("£288.46") }
  ),
  tenantEntry(
    "application-declined",
    "Not This One",
    "The landlord declines an application",
    "Wired 16 Sep 2026. Hourly: an application REX moves to unsuccessful, seen after the first run, to each applicant, with live homes nearby at a similar rent. Nothing declined before switching on is ever written to. Needs the Automatic tenant emails switch and customer email.",
    "The tenant who applied",
    "Same day, never silence. Says sorry once, gives the reason if we have one, says it is not the end, and puts the next homes straight in front of them.",
    APPLICATION_DECLINED,
    { reasonLine: "" }
  ),
  tenantEntry(
    "application-its-yours",
    "The Landlord Has Said Yes",
    "An offer is accepted",
    "Wired 16 Sep 2026. lib/handover.ts sends this to each tenant when an offer is accepted, from the agent's own mailbox, in place of Howard's wording. Shadow mode until the handover switch is on. The holding fee is one week's rent rounded down to the penny; Scotland gets its own line (HOLDING_FEE_WORDING).",
    "Each tenant on the application",
    "Our rewrite of the acceptance email: the yes, the holding fee (what it is, where it goes, when it comes back and when it can be kept), then every step to the keys in order, with the tenancy page as the place to watch it happen.",
    APPLICATION_ITS_YOURS,
    { holdingFeeLine: HOLDING_FEE_WORDING.england.accepted("£288"), weekAheadList: WEEK_AHEAD_LINES, link: `${SITE}/tenant/tenancy` }
  ),
  tenantEntry(
    "referencing-invite",
    "Time to Get Referenced",
    "The deal moves to referencing",
    "NOT WIRED YET. Blocked on the biggest gap on the map: our own referencing form, and which referencing provider runs the checks. Until then tenants get the provider's own invite. The link goes to the tenancy page.",
    "Each adult tenant",
    "What we ask, why, what to have to hand, how long it takes, and that every adult gets their own link.",
    REFERENCING_INVITE,
    { link: `${SITE}/tenant/tenancy` }
  ),
  tenantEntry(
    "guarantor-invite",
    "Your Guarantor",
    "Referencing says a guarantor is needed",
    "NOT WIRED YET. Wants the guarantor's own form and link (planned on the map) and the referencing outcome that asks for one.",
    "The guarantor, never the tenant",
    "Written to the guarantor: who named them, for what home and rent, what a guarantor is actually agreeing to, that their details stay private from the tenant, and an easy way to say no.",
    GUARANTOR_INVITE,
    { firstName: "Karen", link: `${SITE}/tenant/tenancy` }
  ),
  tenantEntry(
    "referencing-chase",
    "Chase: Your References",
    "Three days into referencing with forms missing",
    "NOT WIRED YET. Wants the referencing form's own progress per adult, which does not exist until the form does.",
    "Each adult with something missing",
    "What is still missing, by name, why today matters (the landlord is holding the home), and an offer to help with the usual blocker.",
    REFERENCING_CHASE,
    { link: `${SITE}/tenant/tenancy` }
  )
);
