import "server-only";
import { createHash } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { DEMO_CONTACT_ID } from "@/lib/passport";
import { internalDomains } from "@/lib/email-policy";
import type { DonePassport } from "@/lib/passports-done-shape";

/**
 * Every tenant who has FINISHED their passport, newest first.
 *
 * Kirstie, 6 Oct 2026: she never books a viewing until the passport is in,
 * and she has many homes on the market at once. The only sign was a pill
 * inside one lead's drawer, so finding who was ready meant opening every
 * lead. This is the list behind Leads > Tenants > Passports done and the
 * dashboard tile.
 *
 * ── Whose ──────────────────────────────────────────────────────────────────
 *
 * Scoped the way the lead board is (lib/scope leadScope): the office and the
 * owners see every passport, an agent sees the ones minted against them. A
 * passport's agent_id is an os_users id and the scope is a REX id, so the
 * join is through os_users.rex_user_id - which also makes view-as work.
 *
 * ── What is left out ──────────────────────────────────────────────────────
 *
 * Demo throwaways (contact_id "demo") and anything Create a test made: a
 * contact flagged is_test, or a token written down in os_test_kits. The same
 * three marks lib/test-guard reads. And one sent to our own address, which
 * is somebody on staff trying it (the invite route treats it as a test too).
 *
 * One row per tenant: a tenant two agents each sent a passport to is one
 * person who is ready, shown at the newest finish.
 *
 * Three reads in all, whatever the count - never one per row.
 */
export async function donePassports(p: { rexUserId: string | null; limit: number }): Promise<DonePassport[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    token: string; name: string; email: string; contact_id: string | null; mobile: string | null;
    legal_name: string | null; submitted_at: string | Date; agent_name: string | null; invited_by: string | null;
  }>(
    `SELECT * FROM (
       SELECT DISTINCT ON (COALESCE(NULLIF(lower(trim(p.email)), ''), p.token))
              p.token, p.name, p.email, p.contact_id,
              p.data->>'mobile' AS mobile, p.data->>'legalName' AS legal_name,
              p.submitted_at, u.name AS agent_name, p.invited_by
         FROM os_tenant_passports p
         LEFT JOIN os_users u ON u.id = p.agent_id
        WHERE p.submitted_at IS NOT NULL
          AND COALESCE(p.contact_id, '') <> $1
          AND ($2::text IS NULL OR p.agent_id IN (SELECT id FROM os_users WHERE rex_user_id = $2))
          AND NOT EXISTS (SELECT 1 FROM os_contacts c WHERE c.is_test AND c.id = p.contact_id)
          AND NOT EXISTS (SELECT 1 FROM os_test_kits k WHERE k.refs->'passports' ? p.token)
          AND split_part(lower(trim(p.email)), '@', 2) <> ALL($4::text[])
        ORDER BY COALESCE(NULLIF(lower(trim(p.email)), ''), p.token), p.submitted_at DESC
     ) d
     ORDER BY d.submitted_at DESC
     LIMIT $3`,
    [DEMO_CONTACT_ID, p.rexUserId, p.limit, internalDomains()]
  );
  if (!rows.length) return [];

  const emails = [...new Set(rows.map((r) => r.email.trim().toLowerCase()).filter((e) => e.includes("@")))];
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((c): c is string => Boolean(c)))];

  /* The homes they asked about: the portal's own enquiries, and the REX
     enquiries the ledger holds - an agent's own only, when scoped. The REX
     row is also the lead to open; valuations are a landlord's, not this. */
  const [asked, contacts] = await Promise.all([
    emails.length
      ? q<{ em: string; address: string; at: string | null; lead_id: string | null }>(
          `SELECT lower(email) AS em, address, created_at::text AS at, NULL::text AS lead_id
             FROM os_tenant_enquiries
            WHERE lower(email) = ANY($1) AND address <> ''
           UNION ALL
           SELECT lower(email), COALESCE(address, ''), received_at::text, id
             FROM os_leads
            WHERE lower(email) = ANY($1)
              AND COALESCE(enquiry, '') <> 'Valuation'
              AND ($2::text IS NULL OR assignee_id = $2)
              AND id NOT IN (SELECT id FROM os_hidden_leads)`,
          [emails, p.rexUserId]
        ).catch(() => [])
      : Promise.resolve([]),
    /* People added in the OS are leads too (os-<id>), when REX has none. */
    q<{ id: string; em: string }>(
      `SELECT id, lower(email) AS em FROM os_contacts
        WHERE NOT is_test AND kind = 'tenant'
          AND (id = ANY($1) OR lower(email) = ANY($2))
          AND ('os-' || id) NOT IN (SELECT id FROM os_hidden_leads)`,
      [contactIds, emails]
    ).catch(() => []),
  ]);

  const newestFirst = [...asked].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return rows.map((r) => {
    const em = r.email.trim().toLowerCase();
    const mine = em ? newestFirst.filter((a) => a.em === em) : [];
    const homes = [...new Set(mine.map((a) => a.address.trim()).filter(Boolean))].slice(0, 5);
    const rexLead = mine.find((a) => a.lead_id)?.lead_id ?? null;
    const os = contacts.find((c) => c.id === r.contact_id) ?? (em ? contacts.find((c) => c.em === em) : undefined);
    return {
      id: createHash("sha256").update(r.token).digest("hex").slice(0, 12),
      name: r.name.trim() || (r.legal_name ?? "").trim() || r.email,
      email: r.email,
      phone: (r.mobile ?? "").trim() || null,
      submittedAt: new Date(r.submitted_at).toISOString(),
      agent: r.agent_name || r.invited_by || null,
      homes,
      leadId: rexLead ?? (os ? `os-${os.id}` : null),
    };
  });
}
