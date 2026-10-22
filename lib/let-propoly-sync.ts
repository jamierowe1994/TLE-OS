import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { switchOn } from "@/lib/switches";
import { propolyGet, propolyPatch, propolyPost } from "@/lib/business/propoly";
import { refreshPropolyDealsNow } from "@/lib/business/propoly-deals";
import { firstMatch, landlordPayload, refusal, tenantAttributes } from "@/lib/handover";
import { guaranteedEmails, guarantorLines, propolyGuarantorsLive } from "@/lib/deal-guarantors";
import type { LetDeal } from "@/lib/let-deal";
import type { LetParty } from "@/lib/let-people";

/**
 * THE PEOPLE ON A LET, KEPT IN STEP WITH ITS PROPOLY DEAL (James, 20 Oct 2026).
 *
 * "After the push to Propoly has happened, an edit to a landlord or tenant,
 * or an added landlord or tenant, should go across to the Propoly deal
 * automatically. If anything differs from what Propoly holds, push the
 * change."
 *
 * WHAT PROPOLY'S API ALLOWS (probed live 20 Oct 2026 with broken bodies on
 * nil ids, so nothing could be made): it can ADD and it cannot CHANGE.
 *   - POST /api/v1/tenants with the deal's id - a new tenant on a deal.
 *     Proven 9 Oct (lib/handover pushDeal).
 *   - POST /api/v1/landlords, then PATCH /landlords/{uuid}/relationships
 *     to the deal's home - a landlord on the home. Proven 9 Oct. Whether a
 *     landlord linked to the home AFTER the deal was made joins that deal
 *     is NOT proven; the next read of the deal says, and the let shows it.
 *   - No PATCH or PUT on deals, tenants, landlords or properties; no deal
 *     sub-routes; no DELETE. So a changed email, phone or name on someone
 *     already on the deal can never be sent. It is listed on the let as
 *     "Propoly still has ..." with the deal to open, to change by hand.
 *
 * So the automatic part is: somebody ADDED on the let (lib/let-tenants,
 * lib/let-landlords) who is not on the deal goes across, once. Anyone else
 * missing from the deal (a co-owner REX holds, say) goes only when the agent
 * presses "Add to the Propoly deal". Never on a read, never in a loop: one
 * write per person per deal, held by a unique row before the call is made,
 * so two presses or two saves can't both send. Behind propoly_people_live
 * (arrives off) and the handover's own switch; with either off the same
 * thing is rehearsed - no Propoly call at all, the would-send kept on the let.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const low = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const nameKey = (v: string | null | undefined) => low(v).replace(/[^a-z]/g, "");
/** Phones compared the way Propoly keys them: national form, digits only. */
const phoneKey = (v: string | null | undefined) => {
  const d = (v ?? "").replace(/[^\d+]/g, "");
  return d.startsWith("+44") ? `0${d.slice(3)}` : d.startsWith("0044") ? `0${d.slice(4)}` : d;
};

export type CheckState = "on-deal" | "differs" | "missing" | "sent" | "would" | "failed";
export interface PersonCheck {
  state: CheckState;
  /** One line for the person's card. */
  detail: string;
  /** What Propoly holds where it differs, field by field. */
  propoly?: { name?: string | null; email?: string | null; phone?: string | null };
  /** The agent may press "Add to the Propoly deal". */
  canAdd?: boolean;
}

export interface PropolyPicture {
  deal: { id: string; url: string; status: string; how: string } | null;
  /** True when an addition really goes to Propoly; false = rehearsed. */
  live: boolean;
  checks: Record<string, PersonCheck>;
  /** On Propoly's deal but not on the let. */
  extra: Array<{ role: "tenant" | "landlord"; name: string; email: string | null; phone: string | null }>;
}

type DealPerson = { name: string | null; email: string | null; phone: string | null };

function matchOn(p: LetParty, list: DealPerson[]): DealPerson | null {
  const e = low(p.email);
  return (e && list.find((d) => low(d.email) === e)) || list.find((d) => nameKey(d.name) && nameKey(d.name) === nameKey(p.name)) || null;
}

function differences(p: LetParty, d: DealPerson): PersonCheck["propoly"] | null {
  const out: NonNullable<PersonCheck["propoly"]> = {};
  if (nameKey(d.name) && nameKey(d.name) !== nameKey(p.name)) out.name = d.name;
  if (low(p.email) && low(d.email) !== low(p.email)) out.email = d.email;
  if (phoneKey(p.phone) && phoneKey(d.phone) !== phoneKey(p.phone)) out.phone = d.phone;
  return Object.keys(out).length ? out : null;
}

async function writesLive(): Promise<boolean> {
  const [mine, handover] = await Promise.all([switchOn("propoly_people_live").catch(() => false), switchOn("handover_live").catch(() => false)]);
  return mine && handover;
}

/** Every person on the let against the deal, from the saved copy - no Propoly call. */
export async function propolyPicture(letRef: string, people: LetParty[], deal: LetDeal | null): Promise<PropolyPicture> {
  const live = await writesLive();
  if (!deal) return { deal: null, live, checks: {}, extra: [] };
  const runs = await runsFor(letRef, deal.id);
  const checks: Record<string, PersonCheck> = {};
  const matched = new Set<DealPerson>();
  for (const p of people) {
    const list: DealPerson[] = p.role === "tenant" ? deal.tenants : deal.landlords;
    const hit = matchOn(p, list);
    if (hit) {
      matched.add(hit);
      const diff = differences(p, hit);
      checks[p.key] = diff
        ? { state: "differs", propoly: diff, detail: `Propoly still has ${Object.entries(diff).map(([k, v]) => `${k === "name" ? "the name" : k === "email" ? "the email" : "the mobile"} as ${v || "blank"}`).join(", ")}. Propoly can't take changes from here: change it on the deal in Propoly.` }
        : { state: "on-deal", detail: "On the Propoly deal, the same as here." };
      continue;
    }
    const run = runs.get(p.key);
    if (run?.state === "ok") checks[p.key] = { state: "sent", detail: run.detail };
    else if (run?.state === "pending") checks[p.key] = { state: "sent", detail: "Being sent to Propoly now." };
    else if (run?.state === "would") checks[p.key] = { state: "would", detail: run.detail, canAdd: true };
    else if (run?.state === "failed") checks[p.key] = { state: "failed", detail: run.detail, canAdd: true };
    else checks[p.key] = { state: "missing", detail: "Not on the Propoly deal.", canAdd: true };
  }
  const extra = [
    ...deal.tenants.filter((d) => !matched.has(d)).map((d) => ({ role: "tenant" as const, name: d.name ?? "Unnamed", email: d.email, phone: d.phone })),
    ...deal.landlords.filter((d) => !matched.has(d)).map((d) => ({ role: "landlord" as const, name: d.name ?? "Unnamed", email: d.email, phone: d.phone })),
  ];
  return { deal: { id: deal.id, url: deal.url, status: deal.status, how: deal.how }, live, checks, extra };
}

export interface SyncResult {
  state: CheckState | "no-deal" | "nothing";
  detail: string;
}

/**
 * One person to the deal. `pressed`: the agent asked for it; without it only
 * somebody added on the let goes (the automatic part, on their add or edit).
 */
export async function syncPerson(letRef: string, person: LetParty, deal: LetDeal | null, by: string, pressed = false): Promise<SyncResult> {
  if (!deal) return { state: "no-deal", detail: "No Propoly deal for this let yet: they go with Push to Propoly." };
  const list: DealPerson[] = person.role === "tenant" ? deal.tenants : deal.landlords;
  const hit = matchOn(person, list);
  if (hit) {
    const diff = differences(person, hit);
    return diff
      ? { state: "differs", detail: "Saved here. Propoly can't take changes to someone already on a deal: change it on the deal in Propoly." }
      : { state: "on-deal", detail: "Already on the Propoly deal." };
  }
  if (!pressed && person.source !== "added") return { state: "nothing", detail: "Not on the Propoly deal: add them with Add to the Propoly deal." };
  const action = person.role === "tenant" ? "add-tenant" : "add-landlord";
  const live = await writesLive();

  /* What would go, built the same either way, so a rehearsal shows it. */
  const problem = !person.email
    ? "Propoly needs an email address."
    : !phoneKey(person.phone)
      ? "Propoly needs a mobile number."
      : person.role === "landlord" && !deal.propertyUuid
        ? "The deal's home has no Propoly id in our copy yet. Try again in a few minutes."
        : null;
  if (problem) {
    await keepRun({ letRef, dealId: deal.id, key: person.key, action, mode: live ? "live" : "rehearsal", state: "failed", detail: `Not sent: ${problem}`, by });
    return { state: "failed", detail: `Not sent: ${problem}` };
  }
  /* A tenant with a guarantor in the OS goes marked guarantor_required (lib/deal-guarantors). */
  const guaranteed = person.role === "tenant" && (await propolyGuarantorsLive())
    ? guaranteedEmails(await guarantorLines(letRef, [{ name: person.name, email: person.email }]).catch(() => [])).has(low(person.email))
    : false;
  const tenantPayload = person.role === "tenant"
    ? { deal_id: deal.id, deal_uuid: deal.id, tenant: { user_attributes: tenantAttributes({}, { name: person.name, email: person.email, phone: person.phone }), reference_required: person.reference !== false, ...(guaranteed ? { guarantor_required: true } : {}) } }
    : null;
  /* Their own home, from where every landlord's is kept (lib/landlord-home). */
  const home = person.role === "landlord"
    ? person.address ?? (await import("@/lib/landlord-home").then((m) => m.findHomeAddress({ email: person.email, ref: person.contactId, name: person.name })).catch(() => null))?.address ?? null
    : null;
  const landlordBody = person.role === "landlord"
    ? { landlord: landlordPayload({ name: person.name, email_address: person.email, phone_number: person.phone, address: addressLines(home) }, person.name, person.email as string) }
    : null;
  const relate = { associated_type: "Property", associated_uuid: deal.propertyUuid };

  if (!live) {
    const detail = person.role === "tenant"
      ? `Practice mode: would add ${person.name} to the deal${person.reference === false ? " with no references" : " to be referenced"}.`
      : `Practice mode: would find or create ${person.name} as a landlord in Propoly and link them to the home.`;
    await keepRun({ letRef, dealId: deal.id, key: person.key, action, mode: "rehearsal", state: "would", detail, by, request: tenantPayload ?? { landlord: landlordBody, relationship: relate } });
    return { state: "would", detail };
  }

  /* Hold the one write before it is made: a second save or press lands on the row. */
  const runId = await claimRun({ letRef, dealId: deal.id, key: person.key, action, by });
  if (!runId) return { state: "sent", detail: "Already sent to Propoly." };

  try {
    if (tenantPayload) {
      const res = await propolyPost("/api/v1/tenants", tenantPayload);
      const ok = res.status >= 200 && res.status < 300;
      const detail = ok ? `Added to the Propoly deal${person.reference === false ? ", with no references" : "; Propoly sends their referencing"}.` : `Propoly said no: ${refusal(res)}`;
      await finishRun(runId, ok ? "ok" : "failed", detail, tenantPayload, res.body);
      if (ok) void refreshPropolyDealsNow().catch(() => null);
      return { state: ok ? "sent" : "failed", detail };
    }

    /* A landlord: Propoly finds landlords by email (lower case - its search is case-sensitive). */
    const email = low(person.email);
    const found = await propolyGet(`/api/v1/landlords?email=${encodeURIComponent(email)}&page=1&per_page=10`);
    const had = firstMatch(found.body, (l) => low(str(l.email)) === email);
    let uuid = str(had?.uuid ?? had?.id);
    let made: unknown = null;
    if (!uuid) {
      const res = await propolyPost("/api/v1/landlords", landlordBody);
      made = res.body;
      uuid = str(((res.body as Row | null)?.landlord as Row | null)?.uuid) ?? str((res.body as Row | null)?.uuid);
      if (!(res.status >= 200 && res.status < 300) || !uuid) {
        const detail = `Propoly said no to the landlord: ${refusal(res)}`;
        await finishRun(runId, "failed", detail, landlordBody, res.body);
        return { state: "failed", detail };
      }
    }
    const isAlready = (status: number, body: unknown) => status === 409 || /already associated/i.test(refusal({ status, body }));
    const rel = await propolyPatch(`/api/v1/landlords/${uuid}/relationships`, relate, { expected: isAlready });
    const ok = (rel.status >= 200 && rel.status < 300) || isAlready(rel.status, rel.body);
    const detail = ok
      ? `${had ? "Found in Propoly" : "Created in Propoly"} and linked to the home. If they don't show on the deal within a few minutes, add them to it in Propoly.`
      : `Propoly said no to linking them to the home: ${refusal(rel)}`;
    await finishRun(runId, ok ? "ok" : "failed", detail, { landlord: had ? null : landlordBody, relationship: relate }, { landlord: had ?? made, relationship: rel.body, uuid });
    if (ok) void refreshPropolyDealsNow().catch(() => null);
    return { state: ok ? "sent" : "failed", detail };
  } catch (e) {
    const detail = `Not sent: ${e instanceof Error ? e.message : "Propoly didn't answer"}.`;
    await finishRun(runId, "failed", detail, null, null);
    return { state: "failed", detail };
  }
}

/**
 * One typed line the way the landlord payload reads REX's address: the first
 * line, then "town, postcode" - "3 Test Lane, Leicester LE3 3CC" becomes
 * "3 Test Lane\nLeicester, LE3 3CC", so the town is "Leicester" and not
 * "Leicester LE3 3CC".
 */
function addressLines(a: string | null): string {
  const whole = (a ?? "").trim();
  const pc = whole.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0] ?? "";
  const parts = whole.replace(pc, "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return pc;
  /* "Flat 2, 5 High St, Leeds": the flat and the street are one first line. */
  const lead = parts.length > 2 && /^(flat|apartment|apt|unit|room|suite)\b|^\d+[a-z]?$/i.test(parts[0]) ? 2 : 1;
  const first = parts.slice(0, lead).join(", ");
  const rest = parts.slice(lead).join(", ");
  return rest || pc ? `${first}\n${[rest, pc.toUpperCase()].filter(Boolean).join(", ")}` : first;
}

/* ── the record of what went ─────────────────────────────────────────────── */

let ready: Promise<void> | null = null;
async function sq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_let_propoly_sync (
      id TEXT PRIMARY KEY,
      let_ref TEXT NOT NULL,
      deal_id TEXT NOT NULL,
      person_key TEXT NOT NULL,
      action TEXT NOT NULL,
      mode TEXT NOT NULL,
      state TEXT NOT NULL,
      detail TEXT,
      request JSONB,
      response JSONB,
      by_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    .then(() => q(`CREATE INDEX IF NOT EXISTS os_let_propoly_sync_let ON os_let_propoly_sync (let_ref)`))
    /* The one-write rule, in the database: one live send per person per deal. */
    .then(() => q(`CREATE UNIQUE INDEX IF NOT EXISTS os_let_propoly_sync_once ON os_let_propoly_sync (deal_id, person_key, action) WHERE mode = 'live' AND state IN ('pending', 'ok')`))
    .then(() => undefined)
    .catch((e) => { ready = null; throw e; });
  await ready;
  return q<T>(text, params);
}

const newId = () => randomBytes(9).toString("base64url").replace(/[-_]/g, "x");

type RunInput = { letRef: string; dealId: string; key: string; action: string; by: string };

async function claimRun(r: RunInput): Promise<string | null> {
  if (!hasDb()) return null;
  /* A send that never finished (a deploy mid-call) stops holding the person
     after ten minutes, so it can be tried again rather than stuck for good. */
  await sq(
    `UPDATE os_let_propoly_sync SET state = 'failed', detail = 'The send to Propoly didn''t finish. Check the deal in Propoly before trying again.', updated_at = NOW()
      WHERE deal_id = $1 AND person_key = $2 AND action = $3 AND mode = 'live' AND state = 'pending' AND created_at < NOW() - INTERVAL '10 minutes'`,
    [r.dealId, r.key, r.action]
  );
  const id = newId();
  const rows = await sq<{ id: string }>(
    `INSERT INTO os_let_propoly_sync (id, let_ref, deal_id, person_key, action, mode, state, detail, by_name)
     VALUES ($1,$2,$3,$4,$5,'live','pending','Sending to Propoly.',$6) ON CONFLICT DO NOTHING RETURNING id`,
    [id, r.letRef, r.dealId, r.key, r.action, r.by]
  );
  return rows[0]?.id ?? null;
}

async function finishRun(id: string, state: "ok" | "failed", detail: string, request: unknown, response: unknown): Promise<void> {
  await sq(`UPDATE os_let_propoly_sync SET state = $2, detail = $3, request = $4::jsonb, response = $5::jsonb, updated_at = NOW() WHERE id = $1`, [
    id, state, detail, JSON.stringify(request ?? null), JSON.stringify(response ?? null),
  ]).catch(() => {});
}

/** A rehearsal or a refusal before any call: kept so the let shows it, nothing held. */
async function keepRun(r: RunInput & { mode: "live" | "rehearsal"; state: "would" | "failed"; detail: string; request?: unknown }): Promise<void> {
  if (!hasDb()) return;
  await sq(
    `INSERT INTO os_let_propoly_sync (id, let_ref, deal_id, person_key, action, mode, state, detail, request, by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [newId(), r.letRef, r.dealId, r.key, r.action, r.mode, r.state, r.detail, JSON.stringify(r.request ?? null), r.by]
  ).catch(() => {});
}

/** The latest word per person on this let's deal: a live send beats a rehearsal. */
async function runsFor(letRef: string, dealId: string): Promise<Map<string, { state: string; detail: string }>> {
  const out = new Map<string, { state: string; detail: string }>();
  if (!hasDb()) return out;
  const rows = await sq<{ person_key: string; state: string; detail: string | null; mode: string }>(
    `SELECT person_key, state, detail, mode FROM os_let_propoly_sync WHERE let_ref = $1 AND deal_id = $2 ORDER BY created_at ASC`,
    [letRef, dealId]
  ).catch(() => []);
  for (const r of rows) {
    const cur = out.get(r.person_key);
    if (cur?.state === "ok" && r.mode === "rehearsal") continue;
    out.set(r.person_key, { state: r.state, detail: r.detail ?? "" });
  }
  return out;
}
