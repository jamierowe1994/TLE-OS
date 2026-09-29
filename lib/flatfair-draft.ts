import "server-only";
import { hasDb, q } from "@/lib/db";
import { flatfairEnv, flatfairWrite } from "@/lib/flatfair";
import { switchOn } from "@/lib/switches";

/**
 * A DEAL, SENT TO FLATFAIR AS A DRAFT (29 Sep 2026).
 *
 * Agreed with Flatfair on the 28 Sep call: start with drafts. A draft sits in
 * Flatfair for a person to check - documents, referencing - before it goes to
 * Flatfair's own team or the tenant. It replaces the agent copying every line
 * of the "Set up in Flatfair" screen across by hand.
 *
 * Two guards, because Flatfair emails people:
 *
 *   - On demo or staging (a test token), every address is swapped for a
 *     plus-address of the person pressing the button. Flatfair's demo sends
 *     real email (their words), and these are real tenants on real deals.
 *   - On live, nothing goes unless the "Flatfair drafts" switch is on.
 */

export interface DraftFacts {
  dealId: string;
  propertyName: string;
  /** "Town POSTCODE", as the deal carries it. */
  locality: string;
  rentPcm: number | null;
  deposit: number | null;
  startDate: string | null;
  service: string | null;
  depositReplacement: boolean;
  tenants: { name: string | null; email: string | null; phone: string | null }[];
  guarantors: { name: string | null; email: string | null; phone: string | null }[];
  landlord: { name: string | null; email: string | null; phone: string | null } | null;
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const SCOTTISH = /^(AB|DD|DG|EH|FK|G\d|HS|IV|KA|KW|KY|ML|PA|PH|TD|ZE)/i;
const WELSH = /^(CF|SA|NP|LD|LL)\d/i;
/** Tenancies from 1 May 2026 in England are assured periodic (Renters' Rights Act). */
const RRA_FROM = "2026-05-01";

const splitName = (n: string | null) => {
  const parts = (n ?? "").trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.slice(0, -1).join(" ") || parts[0] || "", last_name: parts.length > 1 ? parts[parts.length - 1] : "" };
};

export function buildDraft(f: DraftFacts, testInbox: string | null): { payload: Record<string, unknown>; problems: string[] } {
  const problems: string[] = [];
  const pc = f.locality.match(POSTCODE);
  const postcode = pc ? `${pc[1]} ${pc[2]}`.toUpperCase() : "";
  const city = f.locality.replace(POSTCODE, "").replace(/[,\s]+$/, "").trim();
  const country = SCOTTISH.test(postcode) ? "gb-sct" : WELSH.test(postcode) ? "gb-wls" : "gb-eng";
  const start = (f.startDate ?? "").slice(0, 10);
  if (!postcode) problems.push("The deal has no postcode.");
  if (!start) problems.push("The deal has no move-in date.");
  if (!f.rentPcm) problems.push("The deal has no rent.");

  /* A test token must never reach a real inbox: every address becomes
     somebody+ff-tenant1@ourdomain on the person pressing the button. */
  let n = 0;
  const addr = (real: string | null, role: string) => {
    if (!testInbox) return (real ?? "").trim();
    const [local, domain] = testInbox.split("@");
    n += 1;
    return `${local}+ff-${role}${n}@${domain}`;
  };

  const tenants = f.tenants.filter((t) => t.email || t.name).map((t, i) => ({
    ...splitName(t.name),
    email: addr(t.email, "tenant"),
    ...(t.phone ? { phone_number: t.phone } : {}),
    is_lead_tenant: i === 0,
  }));
  if (!tenants.length || tenants.some((t) => !t.email)) problems.push("Every tenant needs an email address.");
  const lead = tenants[0]?.email ?? "";
  const guarantors = f.guarantors.filter((g) => g.email || g.name).map((g) => ({
    ...splitName(g.name),
    email: addr(g.email, "guarantor"),
    guarantor_for: lead,
  }));

  const payload: Record<string, unknown> = {
    external_tenancy_id: f.dealId,
    managed_by: /tenant find|let only/i.test(f.service ?? "") ? "landlord" : "agent",
    tenant_type: "private",
    rent: Math.round((f.rentPcm ?? 0) * 100),
    rent_period: "month",
    type: "new_tenancy",
    start_date: start,
    address: f.propertyName,
    city,
    country,
    postcode,
    product_type: f.depositReplacement ? "flatbond" : "traditional_deposit",
    tenancy_type:
      country === "gb-sct" ? "PRIVATE_RESIDENTIAL_TENANCY"
        : country === "gb-wls" ? "occupation_contract"
          : start >= RRA_FROM ? "ASSURED_TENANCY" : "ASSURED_SHORTHOLD",
    tenants,
    guarantors,
    has_guarantor: guarantors.length > 0,
    ...(f.landlord?.email ? { landlord: { ...splitName(f.landlord.name), email: addr(f.landlord.email, "landlord") } } : {}),
    ...(!f.depositReplacement && f.deposit
      ? {
          deposit_amount: Math.round(f.deposit * 100),
          traditional_deposit: {
            managed_by: "agent",
            deposit_provider: country === "gb-sct" ? "my_deposits" : "tds",
            deposit_type: "custodial",
            has_been_registered: false,
          },
        }
      : {}),
    ...(process.env.FLATFAIR_BRANCH_ID ? { branch: Number(process.env.FLATFAIR_BRANCH_ID) } : {}),
  };
  return { payload, problems };
}

export interface DraftRecord { draftId: number; env: string; by: string; at: string; test: boolean }

export async function draftFor(dealId: string): Promise<DraftRecord | null> {
  if (!hasDb()) return null;
  const rows = await q<{ draft_id: number; env: string; by_name: string; at: Date }>(
    `SELECT draft_id, env, by_name, at FROM os_flatfair_drafts WHERE deal_id = $1 AND env = $2 ORDER BY at DESC LIMIT 1`,
    [dealId, flatfairEnv()]
  ).catch(() => []);
  const r = rows[0];
  return r ? { draftId: r.draft_id, env: r.env, by: r.by_name, at: new Date(r.at).toISOString(), test: r.env !== "live" } : null;
}

export async function sendDraft(
  f: DraftFacts,
  who: { id: string; name: string; email: string }
): Promise<{ ok: true; draft: DraftRecord } | { ok: false; error: string; problems?: string[] }> {
  const env = flatfairEnv();
  if (env === "live" && !(await switchOn("flatfair_drafts"))) {
    return { ok: false, error: "Sending drafts to Flatfair is switched off. It is on Admin, Switches." };
  }
  const already = await draftFor(f.dealId);
  if (already) return { ok: true, draft: already };
  const { payload, problems } = buildDraft(f, env === "live" ? null : who.email);
  if (problems.length) return { ok: false, error: "Flatfair would refuse this draft as it stands.", problems };
  const r = await flatfairWrite<{ id: number }>("POST", "/flatbond/draft/", payload);
  if (!r.ok || !r.data?.id) {
    const detail = r.data && typeof r.data === "object" ? JSON.stringify(r.data).slice(0, 400) : r.error;
    return { ok: false, error: `Flatfair did not take it: ${detail ?? "no answer"}` };
  }
  await q(
    `INSERT INTO os_flatfair_drafts (deal_id, env, draft_id, by_id, by_name, payload) VALUES ($1, $2, $3, $4, $5, $6)`,
    [f.dealId, env, r.data.id, who.id, who.name || who.email, JSON.stringify(payload)]
  );
  return { ok: true, draft: { draftId: r.data.id, env, by: who.name || who.email, at: new Date().toISOString(), test: env !== "live" } };
}
