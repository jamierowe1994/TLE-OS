import { skyShell } from "@/lib/email/shell-sky";

/**
 * "Phase 2 has now been launched" (James, 21 Sep 2026) - the short note that
 * goes to everybody with an account when the pilot moves on (lib/phases).
 *
 * In the same sky shell as the invitation, so the two read as one series, and
 * for the reason lib/email/pilot-email gives: that shell carries the Outlook
 * dark-mode fixes. Internal mail, to colleagues only. No em dashes, no
 * invented straplines: what changed, and what to do about it.
 */

const FOOT = "Anything that looks wrong, tell Steve in the bottom-right corner: it comes straight to us.";
const FOOT_TEXT = ["Anything that looks wrong, tell Steve in the bottom-right corner: it comes", "straight to us."];

const COPY: Record<2 | 3 | 4, { subject: string; heading: string; intro: string; button: string; footnote: string; text: string[] }> = {
  2: {
    subject: "Phase 2 has started: TLE OS works for real",
    heading: "Phase 2 has started.",
    intro:
      "Leads, market appraisals, listings, viewings and applications now work for real: a record you save is saved, and a contact or property you add goes into REX. Nothing is emailed to a landlord or tenant yet, and nothing goes to the portals. Your practice files are still there: use them to walk the landlord's and the tenant's portal.",
    button: "Open TLE OS",
    footnote: FOOT,
    text: [
      "Phase 2 has started.",
      "",
      "Leads, market appraisals, listings, viewings and applications now work for",
      "real: a record you save is saved, and a contact or property you add goes",
      "into REX. Nothing is emailed to a landlord or tenant yet, and nothing goes",
      "to the portals. Your practice files are still there: use them to walk the",
      "landlord's and the tenant's portal.",
      "",
      ...FOOT_TEXT,
    ],
  },
  3: {
    subject: "Phase 3 has started: emails and the portals are live",
    heading: "Phase 3 has started.",
    intro:
      "From here, an email you send reaches the landlord or the tenant, from your own Outlook, and a listing you push goes to the portals. Your practice test files have been cleared. Portfolio, Emails, Finances and Tools are still to come.",
    button: "Open TLE OS",
    footnote: FOOT,
    text: [
      "Phase 3 has started.",
      "",
      "From here, an email you send reaches the landlord or the tenant, from your",
      "own Outlook, and a listing you push goes to the portals. Your practice test",
      "files have been cleared. Portfolio, Emails, Finances and Tools are still to come.",
      "",
      ...FOOT_TEXT,
    ],
  },
  4: {
    subject: "Phase 4 has started: the back office is open",
    heading: "Phase 4 has started.",
    intro:
      "The back office is now open to you: Portfolio, with compliance, maintenance and inspections, plus Emails, Finances and Tools. Have a proper look round, and try to break it.",
    button: "Open TLE OS",
    footnote: FOOT,
    text: [
      "Phase 4 has started.",
      "",
      "The back office is now open to you: Portfolio, with compliance, maintenance",
      "and inspections, plus Emails, Finances and Tools. Have a proper look round,",
      "and try to break it.",
      "",
      ...FOOT_TEXT,
    ],
  },
};

export function phaseAnnouncement(phase: 2 | 3 | 4, link: string, firstName?: string): { subject: string; html: string; text: string } {
  const c = COPY[phase];
  const name = (firstName ?? "").trim();
  return {
    subject: c.subject,
    text: [name ? `Hi ${name},` : "Hi,", "", ...c.text, "", link].join("\n"),
    html: skyShell({
      /* No name in the heading: "James, phase 2 has started" reads like a
         mail merge. The greeting is in the plain-text part, where it belongs. */
      heading: c.heading,
      intro: c.intro,
      button: c.button,
      link,
      footnote: c.footnote,
    }),
  };
}
