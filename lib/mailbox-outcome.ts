/**
 * What the Microsoft round trip is telling the person who took it.
 *
 * Deliberately NOT in lib/microsoft.ts, which is server-only: the setup
 * wizard and the pre-launch board are both client components, and they must
 * say the same words as each other or the same failure reads as two different
 * problems depending on which screen you were standing on.
 *
 * ── Why "state" became four codes ─────────────────────────────────────────
 *
 * The callback used to answer `mail=state` for four unrelated failures: no
 * code from Microsoft, no nonce cookie, a nonce that did not match, and a
 * nonce belonging to somebody else. One word for four causes meant a failure
 * told nobody anything - not the person in front of it, and not us reading it
 * back afterwards. They are separate now, and each one names the thing to
 * actually do about it.
 */
export const MAIL_OUTCOME: Record<string, string> = {
  denied:
    "Microsoft would not allow that. If you cancelled, you can skip this and connect it later.",
  expired:
    "That took too long and the sign-in expired. Connecting has to be finished within ten minutes. Try again.",
  mismatch:
    "That sign-in did not match the one this browser started. If you have the OS open in more than one tab, close the others and try again from this one.",
  wronguser:
    "That sign-in was started by a different account on this browser. Sign out of the other one and try again.",
  nocode:
    "Microsoft sent you back without an authorisation code, so there was nothing to exchange. Try again.",
  norefresh:
    "Microsoft connected but did not grant a lasting permission, so it would stop working within the hour. Try again, and accept the permissions it asks for.",
  failed:
    "Something went wrong connecting Microsoft. You can skip this and try later from your profile.",
  signin: "You were signed out on the way back. Sign in and try again.",
  /* Kept so a link from before the codes were split still says something
     sensible rather than falling through to the catch-all. */
  state: "That sign-in could not be verified. Try connecting again.",
};

/** The sentence for an outcome, or null when it worked or there was none. */
export function mailboxProblem(mail: string | null | undefined): string | null {
  if (!mail || mail === "connected") return null;
  return MAIL_OUTCOME[mail] ?? "That did not connect. You can skip this and try later.";
}
