import { hasDb, q } from "@/lib/db";

/** The office line, for an email whose sender has no phone on their profile. */
export const OFFICE_PHONE = "0161 883 2525";

const PROFILE_KEY = "tle-profile-v1";

/** The phone on a person's own profile (Profile > Your details), or "". */
export async function agentPhone(userId: string): Promise<string> {
  if (!hasDb()) return "";
  const rows = await q<{ value: { phone?: string } | null }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, PROFILE_KEY]).catch(() => []);
  return (rows[0]?.value?.phone ?? "").trim();
}

/** What an email should print for the sender's phone: theirs, or the office. */
export async function phoneForEmail(userId: string | null | undefined): Promise<string> {
  return (userId ? await agentPhone(userId) : "") || OFFICE_PHONE;
}
