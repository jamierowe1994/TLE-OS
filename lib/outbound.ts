import "server-only";

/**
 * THE SWITCH FOR AGENT-COMPOSED EMAIL. Off, and off by default forever.
 *
 * ── Why this exists when lib/resend already has a lock ────────────────────
 *
 * `RESEND_ALLOW_SEND` unlocks the transport. It is already "yes" on
 * production, because the pilot invites and the confirm emails go out through
 * it. Reusing it here would mean the composer shipped switched ON, which is
 * exactly what must not happen.
 *
 * These are different risks and they deserve different switches. One is "can
 * this environment send at all". This one is "may an agent type something and
 * put it in front of a landlord". James, 30 Aug: *"don't send anything yet.
 * especially to landlords or tenants."*
 *
 * ── Fails shut ────────────────────────────────────────────────────────────
 *
 * Unset means off. Anything other than the exact word means off. There is no
 * truthy-string parsing here on purpose: `Boolean("false")` is `true`, and a
 * variable set to "false" reading as ON is the kind of mistake that only shows
 * up in somebody's inbox.
 *
 * Read per request rather than at module scope, so switching it on in Railway
 * does not need a redeploy — and so that switching it OFF takes effect at once,
 * which matters more.
 */
export function composerSendEnabled(): boolean {
  return (process.env.OUTBOUND_COMPOSER_SEND ?? "").trim().toLowerCase() === "yes";
}

/** Said the same way everywhere, so the reason is never a shrug. */
export const COMPOSER_LOCKED_REASON =
  "Sending is switched off. The email has been composed and previewed but not sent, " +
  "and nothing has reached the recipient. Set OUTBOUND_COMPOSER_SEND=\"yes\" in Railway " +
  "to turn it on, once the templates have been reviewed.";
