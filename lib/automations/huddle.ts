import "server-only";
import { q } from "@/lib/db";
import type { OsUser } from "@/lib/users";

/**
 * An automation's line in a Huddle, posted as the agent it belongs to - only
 * into a room they are in (or the company room everybody is in), found by its
 * name as Huddles shows it. Never a room they could not post in by hand.
 */
export async function postToHuddle(p: { owner: OsUser; room: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = p.room.trim().toLowerCase();
  if (!name) return { ok: false, error: "No Huddle named." };
  const rooms = await q<{ id: string }>(
    `SELECT r.id FROM os_team_rooms r
      WHERE LOWER(TRIM(r.name)) = $1
        AND (r.kind = 'general' OR EXISTS (SELECT 1 FROM os_team_members m WHERE m.room_id = r.id AND m.user_id = $2))
      LIMIT 1`,
    [name, p.owner.id]
  ).catch(() => []);
  if (!rooms[0]) return { ok: false, error: `There is no Huddle called "${p.room}" that you're in.` };
  const { postMessage } = await import("@/lib/chats");
  await postMessage(p.owner, rooms[0].id, p.text.slice(0, 2000), false, null);
  return { ok: true };
}
