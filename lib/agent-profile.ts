import { q } from "@/lib/db";

/**
 * The agent's introduction, from their own OS profile.
 *
 * The key here was 'presentation_profile', which NOTHING in the codebase has
 * ever written. The profile page saves under 'tle-profile-v1' (PROFILE_KEY in
 * app/(os)/profile/page.tsx). So this returned "" for every agent who had ever
 * typed a bio, and every deck quietly fell through to the generic default —
 * the page told them "shows on your listings, your emails and the landlord
 * review pages" and then showed it nowhere.
 *
 * Empty here is still a fine answer: presentAgentFor falls back to the TEG
 * Hub's bio, so a partner who never opened this page still gets a real
 * introduction rather than the stock one.
 *
 * Moved out of /api/presentations (1 Oct 2026) so a booking can mint the
 * pre-presentation as the agent doing the visit (lib/pre-send).
 */
export async function agentProfile(userId: string): Promise<{ bio: string; photo: string | null }> {
  const rows = await q<{ value: { bio?: string; photo?: string } }>(
    `SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = 'tle-profile-v1'`,
    [userId]
  ).catch(() => []);
  return {
    bio: (rows[0]?.value?.bio ?? "").trim(),
    /* The uploader saves a data URL. Read back out for the deck, which used to
       ask REX and the Hub only — and both hold nothing for TLE, so an agent
       who had uploaded their own face still went out as a monogram. */
    photo: (rows[0]?.value?.photo ?? "").trim() || null,
  };
}
