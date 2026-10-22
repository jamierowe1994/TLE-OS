import "server-only";
import type { OsUser } from "@/lib/users";
import { q } from "@/lib/db";
import { defaultTags, readFacts, writeFacts } from "@/lib/lead-facts";
import type { Lead } from "@/lib/leads-sample";

/**
 * A tag on the customer's lead - the OS's own tags (os_lead_facts), the ones
 * the Leads board filters on. Nothing goes to REX. A lead with no tags yet
 * starts from the tags the board was already showing, so adding one never
 * wipes the others.
 */
export async function tagLead(p: { leadId: string; tag: string; by: OsUser }): Promise<{ ok: true } | { ok: false; error: string }> {
  const tag = p.tag.trim().slice(0, 40);
  if (!tag) return { ok: false, error: "No tag." };
  const facts = await readFacts(p.leadId);
  let tags = facts.tags;
  if (!tags) {
    const rows = await q<{ payload: Lead }>(`SELECT payload FROM os_leads WHERE id = $1`, [p.leadId]).catch(() => []);
    tags = rows[0] ? defaultTags(rows[0].payload) : [];
  }
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return { ok: true };
  await writeFacts(p.leadId, { tags: [...tags, tag].slice(0, 40) });
  return { ok: true };
}
