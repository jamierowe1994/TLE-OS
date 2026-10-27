/**
 * The verification email itself.
 *
 * Composed here as data rather than as a string inside a route, for the same
 * reason the pre-appraisal is: the wording is one file to change, and it can
 * be previewed without sending.
 *
 * ── What this email must not do ───────────────────────────────────────────
 *
 * It must not carry a password, a temporary password, or anything that could
 * be mistaken for one. The link proves the address; the password is chosen on
 * the far side of it, by its owner, and nobody else ever knows it.
 *
 * It must not be alarming when it arrives unrequested. Somebody who did not
 * ask for this should read it, understand that ignoring it is safe and
 * sufficient, and get on with their day.
 */

export interface VerifyEmail {
  subject: string;
  html: string;
  text: string;
}

import { emailShell } from "@/lib/email/shell";
import { skyListShell } from "@/lib/email/shell-sky";

export function verifyEmailFor(link: string): VerifyEmail {
  const text = [
    "Set up your TLE OS account",
    "",
    "Open the link below to confirm this address and choose your password.",
    "",
    link,
    "",
    "The link works once and lasts 24 hours.",
    "",
    "We'll never email you a password, and nobody here can see the one you choose.",
    "If you weren't expecting this, ignore it - nothing happens until the link is opened.",
  ].join("\n");

  return {
    subject: "Confirm your TLE OS account",
    text,
    html: skyListShell({
      heading: "Set up your account",
      intro: "Click the button below to confirm your email address and choose your password.",
      button: "Set your password",
      link,
      hero: "hero-account.png",
      /* The three worries that stop somebody pressing the button, answered
         beside it rather than buried in a paragraph underneath. The 24 hours
         moved up here out of the intro for the same reason: it is a fact
         about the link, not part of the instruction. */
      assurances: [
        { icon: "say-once.png", text: "The link works once and lasts 24 hours." },
        { icon: "say-never.png", text: "We'll never email you a password." },
        { icon: "say-private.png", text: "Nobody here can see the one you choose." },
      ],
      /* Kept from the old shell, and not negotiable: somebody who did not ask
         for this has to be able to read one line and get on with their day. */
      tip: "If you weren't expecting this, you can safely ignore it - nothing happens until the link is opened. Any questions, just hit reply.",
      tipQuiet: true,
    }),
  };
}

export function resetEmailFor(link: string): VerifyEmail {
  const text = [
    "Setting a new TLE OS password",
    "",
    "Open the link below to choose a new password.",
    "",
    link,
    "",
    "The link works once and lasts an hour.",
    "",
    "If you didn't ask for this, ignore it. Your password has not changed and",
    "nothing happens until the link is opened.",
  ].join("\n");

  return {
    subject: "Set a new TLE OS password",
    text,
    /* Same shell, different words. A reset arriving unrequested is the one
       that makes somebody think they have been hacked, so the quiet line says
       plainly that nothing has changed yet and that ignoring it is enough. */
    html: skyListShell({
      /* What happened, rather than what to do about it. The button says what
         to do; the heading is for the person working out why this arrived. */
      heading: "Forgot your password?",
      intro:
        "No problem. Click the button below to choose a new password. The link works once and lasts an hour.",
      button: "Choose a new password",
      link,
      /* Its own picture since 6 Sep 2026 - it shared the sign-in squiggle
         with the set-up email, and two different emails with the same
         picture read as the same email sent twice. */
      hero: "hero-reset.png",
      /* No strip of reassurances here, unlike the set-up mail. That one has
         three worries to answer before somebody will press the button; this
         one has a single line to say, and it matters more than any of them. */
      tip: "If you didn't ask for this, you can safely ignore it. Your password has not changed, and nothing happens until the link is opened.",
      tipQuiet: true,
    }),
  };
}

/**
 * The every-few-days check that it's still them (lib/email-check, 26 Oct
 * 2026). The code is the whole message: big, first, and said again in the
 * plain text for a phone's lock screen.
 */
export function emailCheckEmailFor(code: string, name: string | null): VerifyEmail {
  const first = (name ?? "").trim().split(/\s+/)[0] || "";
  const origin = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");
  const text = [
    `Your TLE OS code: ${code}`,
    "",
    `${first ? `Hi ${first}, every` : "Every"} few days TLE OS checks it's really you by sending a code to your work email.`,
    "Type it on the screen that asked for it. It lasts 15 minutes.",
    "",
    "If you didn't just sign in to TLE OS, don't type it anywhere, and tell James.",
  ].join("\n");
  return {
    subject: `Your TLE OS code: ${code}`,
    text,
    html: skyListShell({
      heading: code,
      subheading: "Your TLE OS code",
      intro: `${first ? `Hi ${first}, every` : "Every"} few days TLE OS checks it's really you by sending a code to your work email. Type it on the screen that asked for it. It lasts 15 minutes.`,
      button: "Open TLE OS",
      link: `${origin}/check-email`,
      /* No picture: the reset one says "New password", and this changes nothing. The code is the message. */
      headingFirst: true,
      tip: "If you didn't just sign in to TLE OS, don't type this code anywhere, and tell James.",
      tipQuiet: true,
    }),
  };
}
