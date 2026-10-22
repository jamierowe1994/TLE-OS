import "server-only";
import { q } from "@/lib/db";
import { sendsAnyway, switchOn } from "@/lib/switches";

/** os_scheduled_sends.kind for an automation's email. ref is "<automation id>:<run id>:<action index>". */
export const AUTOMATION_SEND_KIND = "automation";

/**
 * Should a queued automation email still go? Null when it should, otherwise
 * why it did not, for the log. Asked by the scheduled-sends runner at the
 * moment of sending, so switching an automation off (or an owner switching it
 * off, or Agent automations going off) stops what is already in the queue.
 */
export async function automationSendStands(ref: string, to: string): Promise<string | null> {
  const id = ref.split(":")[0];
  const rows = await q<{ enabled: boolean }>(`SELECT enabled FROM os_automations WHERE id = $1`, [id]).catch(() => null);
  /* Could not look: hold it rather than send on a guess. */
  if (rows === null) return "The automation could not be checked, so it was not sent.";
  if (!rows[0]) return "The automation was deleted before this went, so it was not sent.";
  if (!rows[0].enabled) return "The automation was switched off before this went, so it was not sent.";
  if (!(await switchOn("agent_automations")) && !sendsAnyway(to)) return "Agent automations was switched off before this went, so it was not sent.";
  return null;
}
