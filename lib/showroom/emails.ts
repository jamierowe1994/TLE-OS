import "server-only";
import { hasDb, q } from "@/lib/db";
import { TLE_EMAILS } from "@/lib/email/tle-emails";
import { TENANT_PROCESS } from "@/lib/process/tenant";
import { LANDLORD_PROCESS } from "@/lib/process/landlord";
import { STATUS_RANK, type ProcessStatus } from "@/lib/process/types";
import { EMAIL_WORDS, SHOWROOM_EMAIL_IDS } from "@/lib/showroom/content";

/**
 * An email as the Showroom shows it (lib/showroom/content): the catalogue's
 * own sample render, with any edits made in the email builder laid on top, so
 * what an agent reads here is what the tenant will get. Only the emails the
 * Showroom lists can be asked for - this is open to every member of staff,
 * where the full catalogue (/api/admin/emails) is not.
 */

const CATALOG = "email-catalog";

async function builderEdit(id: string) {
  if (!hasDb()) return null;
  const rows = await q<{ subject: string; blocks: Record<string, unknown>[] }>(
    `SELECT subject, blocks FROM os_email_templates WHERE campaign_id = $1 AND step_index = 0`,
    [`${CATALOG}:${id}`]
  ).catch(() => []);
  const row = rows[0];
  return row && Array.isArray(row.blocks) && row.blocks.length ? { subject: row.subject, blocks: row.blocks } : null;
}

/** How far along it is, in words an agent can act on - from the tenant process map. */
const SAID: Record<ProcessStatus, { key: "live" | "ready" | "built" | "written" | "planned"; says: string }> = {
  tested: { key: "live", says: "Live" },
  live: { key: "live", says: "Live" },
  reworked: { key: "ready", says: "Ready - goes out once it is switched on" },
  notes: { key: "built", says: "Built, being finished" },
  "with-james": { key: "built", says: "Built, being finished" },
  designed: { key: "built", says: "Built, being finished" },
  built: { key: "built", says: "Built, being finished" },
  written: { key: "written", says: "Written, not sent yet" },
  planned: { key: "planned", says: "Not built yet" },
};

/* One email can sit at two points on the map (the passport invite IS the
   viewing confirmation), so the furthest along of them is the answer. */
const BY_KEY = {
  live: SAID.live, ready: SAID.reworked, built: SAID.built, written: SAID.written, planned: SAID.planned,
} as const;

export function statusOf(id: string) {
  /* Said outright where the process maps do not carry the email. */
  const told = EMAIL_WORDS[id]?.status;
  if (told) return BY_KEY[told];
  const nodes = [...TENANT_PROCESS.nodes, ...LANDLORD_PROCESS.nodes].filter((n) => n.emailId === id);
  if (!nodes.length) return { key: "built" as const, says: "Built, being finished" };
  const best = nodes.reduce((a, b) => ((STATUS_RANK[b.status] ?? 0) > (STATUS_RANK[a.status] ?? 0) ? b : a));
  return SAID[best.status];
}

export function isShowroomEmail(id: string | null | undefined): id is string {
  return Boolean(id && SHOWROOM_EMAIL_IDS.has(id));
}

export function showroomEmailMeta(id: string) {
  const entry = TLE_EMAILS.find((e) => e.id === id);
  if (!entry) return null;
  const words = EMAIL_WORDS[id];
  /* Maintenance's emails go to a contractor, compliance and accounts as well
     (4 Oct 2026); everything else not to a customer is the agent's own. */
  const to =
    entry.audience === "tenant" ? "To the tenant"
    : entry.audience === "landlord" ? "To the landlord"
    : entry.audience === "contractor" ? "To the contractor"
    : id === "works-compliance-done" || id === "certificate-shared-compliance" ? "To compliance"
    : id === "works-accounts-invoice" ? "To accounts"
    : "To you";
  return { id, name: entry.name, when: words?.when ?? entry.trigger, summary: words?.says ?? entry.summary, to, status: statusOf(id) };
}

export async function renderShowroomEmail(id: string): Promise<{ subject: string; html: string } | null> {
  const entry = TLE_EMAILS.find((e) => e.id === id);
  if (!entry) return null;
  const saved = entry.doc ? await builderEdit(id) : null;
  return entry.render(saved ? ({ ...entry.doc!, ...saved } as typeof entry.doc) : undefined);
}
