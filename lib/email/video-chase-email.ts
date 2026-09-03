import { emailShell } from "@/lib/email/shell";
import type { VerifyEmail } from "@/lib/verify-email";

/**
 * "You have not recorded a video for this one yet."
 *
 * ── Who it is for, and why that is unusual ────────────────────────────────
 *
 * The AGENT, not the landlord. Almost everything around a market appraisal is
 * addressed outward; this is the one that comes back in, and it is a nudge
 * rather than a notification: the video is optional, the appraisal happens
 * either way, and an email that read as a telling-off would stop being opened.
 * So it asks, and it is easy to ignore.
 *
 * ── Why two days out, when the landlord's email goes one ──────────────────
 *
 * The pre-appraisal email (`appraisal-pre`, PRE_APPRAISAL_LEAD_DAYS = 1) is
 * what carries the deck to the landlord, and the video is the thing ON that
 * deck. So the nudge has to land before the deck is sent, not with it - a day
 * earlier is the smallest gap that still leaves an evening to record one.
 * Any later and the email is asking for something that has already gone out
 * without it.
 *
 * ── The condition is the whole point ──────────────────────────────────────
 *
 * It only goes when there is no recording against that appraisal. An unconditional
 * chase is a chase everybody learns to delete, and the one time it matters they
 * will delete that too.
 *
 * ── The button ────────────────────────────────────────────────────────────
 *
 * Opens the recorder, signed in. The link is a single-use key minted for
 * the recipient (lib/record-link) that /api/record/enter swaps for a
 * session before landing them on /record/<appraisal> - camera, "Saving to
 * 12 Dover Close valuation…", "All done". James, 3 Sep: "when they click
 * that button, it launches us directly into a recording session."
 *
 * Flow has been connected and proven since 3 Sep 2026 (see lib/flow-video).
 */
export function videoChaseEmail(opts: {
  /** Where the recorder lives: the appraisal's own page in the OS. */
  link: string;
  /** The property, as the agent would say it out loud. */
  address: string;
  /** Their first name, when we have it. */
  firstName?: string;
  /** "Thursday", "in two days" — how the visit is being referred to. */
  whenPretty?: string;
}): VerifyEmail {
  const name = (opts.firstName ?? "").trim();
  const when = (opts.whenPretty ?? "").trim();

  const heading = "Record a video?";

  /* Names the property, because an agent may have three appraisals that week
     and "your valuation" would send them to the wrong one. */
  const intro = [
    name ? `${name}, you` : "You",
    ` haven't recorded a video for ${opts.address}`,
    when ? `, and the appraisal is ${when}` : "",
    ". Landlords open the deck far more often when there is a face on it.",
    " It takes about a minute, and you can re-record it as many times as you like.",
  ].join("");

  const text = [
    heading,
    "",
    intro,
    "",
    opts.link,
    "",
    "If you would rather not, ignore this - the appraisal and the deck go out",
    "exactly the same without one.",
  ].join("\n");

  return {
    subject: `Record a quick video for ${opts.address}?`,
    text,
    html: emailShell({
      heading,
      intro,
      button: "Record a video",
      link: opts.link,
      image: "illustrations/record-video.gif",
      /* The out. A nudge that cannot be declined is a demand. */
      footnote:
        "Entirely optional. Ignore this and the appraisal goes ahead exactly the same, deck and all.",
    }),
  };
}
