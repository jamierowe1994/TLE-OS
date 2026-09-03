import { hasDb, q } from "@/lib/db";

/**
 * WHO TO WRITE TO, and why it is not simply the signed-in user.
 *
 * An appraisal names an agent, and that agent is who needs to know — an
 * office manager minting a deck on somebody's behalf must not be the only
 * person told. The name is matched against os_users the same way the
 * compliance chases do it, because that is the only link between the two.
 *
 * When the name cannot be matched the signed-in user is used INSTEAD, and the
 * caller is told so. Silently writing to the wrong colleague would be worse
 * than not writing at all; silently writing to nobody would be worse still.
 *
 * Shared by the agent briefing and the video nudge, which are the two emails
 * in the OS that go back IN to a colleague rather than out to a landlord.
 */
export async function recipientFor(
  agentName: string | null,
  me: { email: string; name: string }
): Promise<{ email: string; name: string; matched: boolean }> {
  const key = (agentName ?? "").trim().toLowerCase();
  if (key && hasDb()) {
    try {
      const rows = await q<{ email: string; name: string }>(
        `SELECT email, name FROM os_users WHERE lower(trim(name)) = $1 AND email <> '' LIMIT 1`,
        [key]
      );
      if (rows[0]) return { email: rows[0].email, name: rows[0].name, matched: true };
    } catch {
      /* Unreadable is not a reason to write to the wrong person — fall through
         to the signed-in user, which the caller is told about. */
    }
  }
  return { email: me.email, name: me.name, matched: false };
}
