import { hasDb, q } from "@/lib/db";
import { OS_LEAD_PREFIX } from "@/lib/contacts-as-leads";
import { leadSide, type Lead } from "@/lib/leads-sample";

/**
 * Leads taken off the board by hand (James, 11 Sep 2026: "we should have the
 * ability to delete that if it was required"). REX is read-only, so nothing
 * is deleted there: the OS remembers the id and stops showing it. Undo is
 * deleting the row.
 */
export async function hiddenLeadIds(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ id: string }>(`SELECT id FROM os_hidden_leads`).catch(() => []);
  return new Set(rows.map((r) => r.id));
}

export async function hideLead(id: string, by: string | null): Promise<void> {
  await q(
    `INSERT INTO os_hidden_leads (id, hidden_by) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET hidden_by = EXCLUDED.hidden_by, hidden_at = NOW()`,
    [id, by]
  );
}

export async function unhideLead(id: string): Promise<void> {
  await q(`DELETE FROM os_hidden_leads WHERE id = $1`, [id]);
}

/** One archived lead, as the Archived list shows it. No email or phone: the
 *  list is names, and opening the lead again gives the rest. */
export interface ArchivedLead {
  id: string;
  name: string;
  side: "tenant" | "landlord";
  about: string;
  agent: string;
  receivedAt: string | null;
  archivedAt: string;
  archivedBy: string;
}

/**
 * Leads archived by hand, newest first (James Crumpton, 14 Oct 2026: "an
 * Archive button for an applicant that we no longer wish to have live on the
 * system" - hidden, with a list to see them all and reactivate them).
 *
 * Same scope as the board: `rexUserId` narrows to that agent's REX leads and
 * the people `ownEmail` added by hand; null for both is the whole business.
 */
export async function archivedLeads(rexUserId: string | null, ownEmail: string | null): Promise<ArchivedLead[]> {
  if (!hasDb()) return [];
  const hidden = await q<{ id: string; hidden_by: string | null; hidden_at: Date }>(
    `SELECT id, hidden_by, hidden_at FROM os_hidden_leads ORDER BY hidden_at DESC`
  );
  if (!hidden.length) return [];
  const ids = hidden.map((h) => h.id);
  const osIds = ids.filter((id) => id.startsWith(OS_LEAD_PREFIX)).map((id) => id.slice(OS_LEAD_PREFIX.length));
  const [rex, ours, users] = await Promise.all([
    q<{ id: string; payload: Lead; assignee_id: string | null }>(`SELECT id, payload, assignee_id FROM os_leads WHERE id = ANY($1)`, [ids]),
    osIds.length
      ? q<{ id: string; kind: string; name: string; address: string; postcode: string; created_by: string; created_at: Date }>(
          `SELECT id, kind, name, address, postcode, created_by, created_at FROM os_contacts WHERE id = ANY($1)`,
          [osIds]
        )
      : Promise.resolve([]),
    q<{ email: string; name: string | null }>(`SELECT email, name FROM os_users`).catch(() => []),
  ]);
  const nameOf = new Map(users.map((u) => [u.email.trim().toLowerCase(), u.name?.trim() || u.email]));
  const who = (s: string | null) => (s ? nameOf.get(s.trim().toLowerCase()) ?? s : "");
  const rexBy = new Map(rex.map((r) => [r.id, r]));
  const oursBy = new Map(ours.map((c) => [`${OS_LEAD_PREFIX}${c.id}`, c]));
  const out: ArchivedLead[] = [];
  for (const h of hidden) {
    const base = { id: h.id, archivedAt: new Date(h.hidden_at).toISOString(), archivedBy: who(h.hidden_by) };
    const r = rexBy.get(h.id);
    if (r) {
      if (rexUserId && String(r.assignee_id ?? "") !== String(rexUserId)) continue;
      const l = r.payload;
      const about = [l.preferred, l.area, l.address].find((x) => x && x !== "—") ?? "";
      out.push({ ...base, name: l.name || "No name", side: leadSide(l), about, agent: l.agent || "", receivedAt: l.receivedAt ?? null });
      continue;
    }
    const c = oursBy.get(h.id);
    if (c) {
      if ((rexUserId || ownEmail) && c.created_by.trim().toLowerCase() !== (ownEmail ?? "").trim().toLowerCase()) continue;
      out.push({
        ...base,
        name: c.name || "No name",
        side: c.kind === "landlord" ? "landlord" : "tenant",
        about: [c.address, c.postcode].filter(Boolean).join(", "),
        agent: who(c.created_by),
        receivedAt: new Date(c.created_at).toISOString(),
      });
    }
    /* Neither on file: a lead the ledger never kept. Nothing to show it by. */
  }
  return out;
}
