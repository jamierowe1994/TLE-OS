import { skyShell } from "@/lib/email/shell-sky";
import type { VerifyEmail } from "@/lib/verify-email";

/**
 * The launch invitation (James, 12 Oct 2026).
 *
 * The pilot invite says "you're one of the first through the door", which is
 * not true of somebody invited on launch day, so this is its own email. Same
 * sky shell, same one button, same one-time join link. Two differences:
 *
 *   - a second, quieter link to the TLE OS tour (tle-os-demo), so they can
 *     see how it all fits together before or after setting up;
 *   - the link lasts LAUNCH_LINK_DAYS rather than a day, because thirty-odd
 *     people emailed at once will not all open it the same day.
 */
export function launchInviteEmail(
  link: string,
  opts: { firstName?: string; tourUrl: string; days: number }
): VerifyEmail {
  const name = (opts.firstName ?? "").trim();
  const life = `${opts.days} day${opts.days === 1 ? "" : "s"}`;
  const intro =
    "TLE OS is the new home for everything you do at The Letting Experts - your leads, listings, viewings, lets and landlords in one place. Your account is ready for you to set up.";
  const footnote =
    `Have your REX sign-in to hand: it's the first thing we ask for. Once you're in, add your photo and connect your email so everything goes out in your name. This link works once and lasts ${life}.`;

  const text = [
    name ? `Welcome to TLE OS, ${name}.` : "Welcome to TLE OS.",
    "",
    intro,
    "",
    "Set up your account:",
    link,
    "",
    "Take the TLE OS tour (best on a laptop):",
    opts.tourUrl,
    "",
    footnote,
  ].join("\n");

  return {
    subject: "Welcome to TLE OS",
    text,
    html: skyShell({
      heading: name ? `Welcome to TLE OS, ${name}.` : "Welcome to TLE OS.",
      intro,
      button: "Set up your account",
      link,
      secondary: { label: "Take the TLE OS tour", link: opts.tourUrl },
      footnote,
      typeOnly: true,
    }),
  };
}
