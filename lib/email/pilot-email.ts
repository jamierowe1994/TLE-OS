import { skyShell } from "@/lib/email/shell-sky";
import type { VerifyEmail } from "@/lib/verify-email";

/**
 * The pilot invitation.
 *
 * ── Stripped back to almost nothing, deliberately ─────────────────────────
 *
 * This used to be a full block document: a red wordmark, a paper aeroplane, a
 * headline, several paragraphs on what to do in the first week, how to report
 * a problem from the page it broke on, and a note that we would be asking
 * which parts they never opened. All true, all useful, and all of it competing
 * with the only sentence that matters on the day.
 *
 * James, 29 Aug: "we want to keep it really, really simple and say, so you're
 * in, and then we don't need to add the rest of that in."
 *
 * So it says one thing and offers one button. Everything that was in those
 * paragraphs is the first conversation, or the help centre, or the thing the
 * assistant answers when they ask — none of it needed to be in the doorway.
 *
 * ── What it costs, stated plainly ─────────────────────────────────────────
 *
 * It is no longer a block document, so it has left the email builder: nobody
 * can edit this copy from Admin any more, it is changed here. That is the same
 * trade the account emails already make, and for the same reason — the shared
 * shell carries Outlook dark-mode fixes the block renderer does not do, and a
 * launch email that arrives half-inverted is one nobody clicks.
 */
export function pilotInviteEmail(link: string, firstName?: string): VerifyEmail {
  const name = (firstName ?? "").trim();
  const text = [
    "You're in.",
    "",
    "Welcome to TLE OS. We're building it now, and you're one of the first",
    "through the door - what you tell us over the next few weeks is what",
    "shapes it for everybody else.",
    "",
    "Open the link below to confirm your address and choose a password.",
    "",
    link,
    "",
    "Have your REX sign-in to hand. It is the first thing we ask for, and the",
    "OS has nothing to show you until it is connected.",
    "",
    "Then have a look around when it suits you, and say so when something",
    "feels wrong. The link works once and lasts 24 hours.",
  ].join("\n");

  return {
    /* No emoji and no merge field. "You're in" is the whole message, and a
       name in a subject line is the thing that makes an email look automated
       rather than personal. */
    subject: "You're in",
    text,
    html: skyShell({
      heading: name ? `You're in, ${name}.` : "You're in.",
      /* Enough to say why they should care, and no more. It was one line and
         read as shy for something that is meant to feel like an opening; the
         version before that was six paragraphs and read as a manual. This is
         the middle: welcome, we are building it, and you are part of that. */
      intro:
        "Welcome to TLE OS. We're building it now, and you're one of the first through the door - what you tell us over the next few weeks is what shapes it for everybody else.",
      button: "Set up your account",
      link,
      /* "Nothing to prepare" until 14 Sep 2026, which was not true: setup asks
         for their REX sign-in on the second screen and will not go past it, by
         design (the argument is in lib/setup.ts). An agent who opens this at a
         desk without their REX password gets two screens in and stops, and the
         first thing the pilot learns about the OS is that it lied in the
         doorway. */
      footnote:
        "Have your REX sign-in to hand: it is the first thing we ask for. Then have a look around when it suits you, and say so when something feels wrong.",
    }),
  };
}
