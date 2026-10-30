import "server-only";
import { hasDb, q } from "@/lib/db";
import { getApplicationById } from "@/lib/applications";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { isTestId, testApplication } from "@/lib/test-overlay";
import { letTenants } from "@/lib/let-tenants";
import { tenantDocLabel } from "@/lib/tenant-documents-kinds";

/**
 * EVERY FILE A LET'S TENANTS HAVE SENT, FOUND BY WHO THEY ARE (James, 30 Oct
 * 2026: "a lot of these documents are technically on the system, but we're
 * not actually registering them").
 *
 * A tenant's upload was found by the deal id stamped on it when it was sent.
 * On 30 Oct none of the 35 files sent since 9 Oct carried a real deal's id:
 * 28 went in before there was a deal and 7 were stamped with a sitting
 * tenant's home. So the pre-tenancy board showed nothing, the let's
 * Documents tab never looked, and the PLC pack never had them (Viaceslav
 * Butkevic, 68 Main Street, Blantyre: payslips, P60, ID and a bank statement
 * sent 17 Oct, on no screen). The same was true of what an agent filed on a
 * tenant's lead.
 *
 * Now a let's files are read by its tenants' emails - the applicants, the
 * Propoly deal's tenants, anyone added on the let - from the tenant's own
 * uploads and from their leads, plus anything stamped with this let's id.
 */

export type LetTenantFile = {
  key: string;
  name: string;
  /** What it is, in words: "Proof of income", "Right to rent". */
  kind: string;
  /** What the pack can file it as, where it is one of the pack's checks. */
  check: "right-to-rent" | "tenant-checks" | null;
  r2Key: string;
  url: string;
  at: string;
  who: string;
  from: "tenant" | "lead";
};

export type LetTenants = { emails: string[]; agent: string | null };

/** Who is on a let, by email, and whose let it is. No REX or landlord calls. */
export async function letTenantEmails(ref: string): Promise<LetTenants> {
  const emails = new Set<string>();
  const add = (e: string | null | undefined) => {
    const v = String(e ?? "").trim().toLowerCase();
    if (v.includes("@")) emails.add(v);
  };
  let agent: string | null = null;
  if (isTestId(ref)) {
    const t = await testApplication(ref).catch(() => null);
    t?.app.applicants.forEach((a) => add(a.email));
    agent = t?.app.agent ?? null;
  } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ref)) {
    const app = await getApplicationById(ref).catch(() => null);
    app?.applicants.forEach((a) => add(a.email));
    agent = app?.agent ?? null;
  } else {
    const d = (await getAllPropolyDeals().catch(() => null))?.find((x) => x.app.id === ref) ?? null;
    d?.app.tenants.forEach((t) => add(t.email));
    agent = d?.managerName ?? null;
  }
  (await letTenants(ref).catch(() => [])).forEach((t) => add(t.email));
  return { emails: [...emails], agent };
}

/** A lead's tag, or a tenant's kind, as the pack's check it answers. */
function checkFor(label: string): LetTenantFile["check"] {
  const s = label.toLowerCase().replace(/[^a-z]/g, "");
  if (s.includes("righttorent")) return "right-to-rent";
  if (s === "reference" || s === "tenantreference") return "tenant-checks";
  return null;
}

/* A lead's tag in the tenant's words: tags come as "Right to Rent" or squashed, as "TenantRighttoRent". */
const TAG_WORDS: Record<string, string> = {
  righttorent: "Right to rent",
  reference: "A reference",
  proofofincome: "Proof of income",
  proofofaddress: "Proof of address",
  bankstatement: "Bank statement",
  id: "Photo ID",
  guarantor: "Guarantor",
};
const words = (tag: string) => TAG_WORDS[tag.toLowerCase().replace(/[^a-z]/g, "").replace(/^tenant/, "")] ?? tag;

export async function letTenantFiles(ref: string, known?: LetTenants): Promise<LetTenantFile[]> {
  if (!hasDb() || !ref) return [];
  const { emails } = known ?? (await letTenantEmails(ref));
  const [mine, leads] = await Promise.all([
    q<{ id: string; kind: string; name: string; r2_key: string; uploaded_at: Date; who: string }>(
      `SELECT d.id, d.kind, d.name, d.r2_key, d.uploaded_at, COALESCE(NULLIF(a.name, ''), a.email, '') AS who
         FROM os_tenant_documents d
         JOIN os_portal_accounts a ON a.id = d.account_id
        WHERE d.deal_id = $1 OR (a.kind = 'tenant' AND LOWER(a.email) = ANY($2))
        ORDER BY d.uploaded_at DESC`,
      [ref, emails]
    ).catch(() => []),
    emails.length
      ? q<{ id: string; tag: string; name: string; r2_key: string; at: Date; who: string }>(
          `SELECT DISTINCT ON (d.id) d.id, d.tag, d.name, d.r2_key, d.at, COALESCE(NULLIF(l.name, ''), l.email, '') AS who
             FROM os_lead_documents d
             JOIN os_leads l ON l.id = d.lead_id
            WHERE LOWER(l.email) = ANY($1)
            ORDER BY d.id`,
          [emails]
        ).catch(() => [])
      : Promise.resolve([]),
  ]);
  const url = (k: string) => `/api/r2/file?key=${encodeURIComponent(k)}`;
  const out: LetTenantFile[] = [
    ...mine.map((r) => ({ key: `tenant:${r.id}`, name: r.name, kind: tenantDocLabel(r.kind), check: checkFor(r.kind), r2Key: r.r2_key, url: url(r.r2_key), at: new Date(r.uploaded_at).toISOString(), who: r.who, from: "tenant" as const })),
    ...leads.map((r) => ({ key: `lead:${r.id}`, name: r.name, kind: words(r.tag), check: checkFor(r.tag), r2Key: r.r2_key, url: url(r.r2_key), at: new Date(r.at).toISOString(), who: r.who, from: "lead" as const })),
  ];
  /* The same file sent both ways shows once. */
  const seen = new Set<string>();
  return out.filter((f) => !seen.has(f.r2Key) && seen.add(f.r2Key)).sort((a, b) => b.at.localeCompare(a.at));
}
