import "server-only";
import { hasDb, q } from "@/lib/db";
import { flatfairEnv, flatfairWrite, listBranches, type FfBranch } from "@/lib/flatfair";
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
  /** The deal's agent as Propoly names them: their Flatfair branch is found by it. */
  agentName?: string | null;
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

export function buildDraft(f: DraftFacts, testInbox: string | null, branchId: number | null = null): { payload: Record<string, unknown>; problems: string[] } {
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
    /* A test system gets no real phone number either - it could text it. */
    ...(t.phone && !testInbox ? { phone_number: t.phone } : {}),
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
    ...(branchId ? { branch: branchId } : {}),
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
  /* Live drafts go to the agent's own branch, or not at all. */
  let branchId: number | null = null;
  if (env === "live") {
    const found = await branchFor(f.agentName ?? null);
    if (!found.ok) return { ok: false, error: found.error };
    branchId = found.branch.id;
  }
  const { payload, problems } = buildDraft(f, env === "live" ? null : who.email, branchId);
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

/* ── The agent's branch ───────────────────────────────────────────────── */

/*
 * EACH AGENT HAS THEIR OWN FLATFAIR BRANCH (James, 10 Nov 2026: "yes please").
 * Flatfair holds The Letting Experts as one branch per agent ("The Letting
 * Experts - Rhiannon Dodge"), and every flatbond keyed in by hand sits under
 * its agent's. A draft sent with no branch lands wherever Flatfair defaults,
 * and one FLATFAIR_BRANCH_ID would have put every agent's drafts under one
 * person, so the branch is the deal's agent's, found by name. The names are
 * typed by hand there - "Fieldston" for Fieldson, "Brain" for Brian, "Dan"
 * on a branch and "Daniel" on the deal - so a surname one letter out and the
 * same first initial will do, an exact name beating a near one. No branch,
 * or two equally near: the draft is held, saying why, never sent elsewhere.
 */

const BRANCH_TTL_MS = 60 * 60_000;
let branchList: { at: number; rows: FfBranch[] } | null = null;

async function branchesNow(): Promise<FfBranch[] | null> {
  if (branchList && Date.now() - branchList.at < BRANCH_TTL_MS) return branchList.rows;
  const r = await listBranches().catch(() => null);
  if (!r?.ok) return branchList?.rows ?? null;
  branchList = { at: Date.now(), rows: r.rows };
  return r.rows;
}

const nameWords = (s: string) => s.toLowerCase().replace(/[-']/g, " ").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);

/** One letter out, for a word of five letters or more. */
function nearly(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** The person a branch is for: the words after "The Letting Experts -". */
const branchPerson = (name: string): string[] | null => {
  const m = /^\s*the\s+let+[a-z]*\s+experts?\s*-\s*(.+)$/i.exec(name);
  return m ? nameWords(m[1]) : null;
};

/** How well a branch's person is this agent: 3 the same name, 2 same first and surname, 1 near, 0 not them. */
export function branchScore(agent: string, branchName: string): number {
  const a = nameWords(agent);
  const b = branchPerson(branchName);
  if (!b || a.length < 2 || b.length < 2) return 0;
  if (a.join(" ") === b.join(" ")) return 3;
  const la = a[a.length - 1], lb = b[b.length - 1];
  if (!nearly(la, lb)) return 0;
  if (a[0] === b[0] && la === lb) return 2;
  return a[0][0] === b[0][0] ? 1 : 0;
}

export async function branchFor(agentName: string | null): Promise<{ ok: true; branch: FfBranch } | { ok: false; error: string }> {
  const who = (agentName ?? "").replace(/\s+/g, " ").trim();
  if (!who) return { ok: false, error: "The deal names no agent, so Flatfair can't be told whose branch it goes in. Key it into Flatfair by hand." };
  const rows = await branchesNow();
  if (!rows) return { ok: false, error: "Flatfair's branches couldn't be read just now, so nothing was sent. Try again in a minute." };
  const scored = rows.map((b) => ({ b, s: branchScore(who, b.name) })).filter((x) => x.s > 0);
  const best = Math.max(0, ...scored.map((x) => x.s));
  const top = scored.filter((x) => x.s === best);
  if (!top.length) return { ok: false, error: `Flatfair has no branch for ${who}, so nothing was sent. Ask Flatfair to add one, or key it into Flatfair by hand.` };
  if (top.length > 1) return { ok: false, error: `Flatfair has more than one branch that could be ${who}'s (${top.map((x) => x.b.name).join("; ")}), so nothing was sent. Key it into Flatfair by hand.` };
  return { ok: true, branch: top[0].b };
}
