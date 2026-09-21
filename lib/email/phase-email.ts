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

const COPY: Record<2 | 3, { subject: string; heading: string; intro: string; button: string; footnote: string; text: string[] }> = {
  2: {
    subject: "Phase 2 has started: TLE OS is live",
    heading: "Phase 2 has started.",
    intro:
      "Practice is over and TLE OS is now live for leads, market appraisals, listings, viewings and applications. From here, what you do is real: an email you send reaches the landlord or tenant, and a record you save is saved.",
    button: "Open TLE OS",
    footnote:
      "Your practice test files have been cleared. If something looks wrong, tell Steve in the bottom-right corner: it comes straight to us.",
    text: [
      "Phase 2 has started.",
      "",
      "Practice is over and TLE OS is now live for leads, market appraisals,",
      "listings, viewings and applications. From here, what you do is real: an",
      "email you send reaches the landlord or tenant, and a record you save is saved.",
      "",
      "Your practice test files have been cleared. If something looks wrong, tell",
      "Steve in the bottom-right corner: it comes straight to us.",
    ],
  },
  3: {
    subject: "Phase 3 has started: the back office is open",
    heading: "Phase 3 has started.",
    intro:
      "The back office is now open to you: Portfolio, with compliance, maintenance and inspections, plus Finances and Tools. Have a proper look round, and try to break it.",
    button: "Open TLE OS",
    footnote: "Anything that looks wrong, tell Steve in the bottom-right corner: it comes straight to us.",
    text: [
      "Phase 3 has started.",
      "",
      "The back office is now open to you: Portfolio, with compliance, maintenance",
      "and inspections, plus Finances and Tools. Have a proper look round, and try",
      "to break it.",
      "",
      "Anything that looks wrong, tell Steve in the bottom-right corner: it comes",
      "straight to us.",
    ],
  },
};

export function phaseAnnouncement(phase: 2 | 3, link: string, firstName?: string): { subject: string; html: string; text: string } {
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
