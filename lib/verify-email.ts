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
    "If you weren't expecting this, ignore it — nothing happens until the link is opened.",
  ].join("\n");

  return {
    subject: "Confirm your TLE OS account",
    text,
    html: emailShell({
      heading: "Set up your account",
      intro:
        "Click the button below to confirm this address and choose your password. The link works once and lasts 24 hours.",
      button: "Set your password",
      link,
      image: "illustrations/sign-in.gif",
      footnote:
        "We'll never email you a password, and nobody here can see the one you choose. If you weren't expecting this, you can safely ignore it — nothing happens until the link is opened.",
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
    html: emailShell({
      heading: "Set a new password",
      intro:
        "Click the button below to choose a new password. The link works once and lasts an hour.",
      button: "Choose a new password",
      link,
      image: "illustrations/sign-in.gif",
      footnote:
        "If you didn't ask for this, you can safely ignore it. Your password has not changed, and nothing happens until the link is opened.",
    }),
  };
}
