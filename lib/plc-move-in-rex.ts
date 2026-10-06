import "server-only";
import { rexCall, rexWritesLocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { markApplicationsFiled } from "@/lib/applications-board";
import { isTestId } from "@/lib/test-overlay";

/**
 * A corrected move-in date goes back onto the REX application.
 *
 * James, 6 Oct 2026: "a corrected move date should always go back into REX."
 * Rhiannon's Room 2 came through as the 5th for a Friday the 9th, the pack was
 * fixed, and REX kept saying the 5th - so the Portfolio showed the tenant in
 * four days early and the next reader of the application got the wrong date.
 *
 * Written AS the person who changed it, so REX stamps their name. Never
 * throws: the pack's date is saved whatever REX says, and the answer travels
 * back so the screen can say whether the application was updated too.
 */
export async function moveInToRex(
  applicationId: string,
  ymd: string,
  actorUserId: string | null
): Promise<{ ok: boolean; note: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { ok: false, note: "Not a date." };
  /* A test file's application lives in the OS only. */
  if (isTestId(applicationId)) return { ok: true, note: "Test application - the date stays in the OS." };
  const id = Number(applicationId);
  if (!Number.isFinite(id)) return { ok: false, note: "This pack has no REX application to update." };
  if (rexWritesLocked("TenancyApplications", "update")) {
    return {
      ok: false,
      note: "Saved on the pack. REX isn't open to this change yet, so the application still has the old date.",
    };
  }
  try {
    const token = await rexTokenFor(actorUserId).catch(() => null);
    const res = await rexCall("TenancyApplications", "update", { data: { id, start_date: ymd } }, token);
    if (!res.ok) return { ok: false, note: `Saved on the pack. REX refused the application: ${res.error ?? res.status}.` };
    /* The board's held copy is older than this now. */
    markApplicationsFiled();
    return { ok: true, note: "Updated on the application in REX too." };
  } catch (e) {
    return { ok: false, note: `Saved on the pack. REX didn't take it: ${e instanceof Error ? e.message : "unknown error"}.` };
  }
}
