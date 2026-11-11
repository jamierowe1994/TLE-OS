import "server-only";
import { hasDb, q } from "@/lib/db";
import { openAccount, sealAccount } from "@/lib/bank-vault";
import { ANSWER_KEYS, KEPT, LANDLORD_KEYS, SECRET_KEYS, type Answers } from "@/lib/property-questions";

/**
 * THE ANSWERS ABOUT A HOME, WHEREVER THE CONTRACT CAME FROM (5 Nov 2026).
 *
 * The questionnaire's answers were kept against the appraisal the contract was
 * signed on (lib/property-answers-store, os_case_state "property-answers").
 * Terms sent from the OS mostly come from a listing with no appraisal behind
 * it (14 of the 15 sent by 5 Nov), so a home is known by whichever it has:
 *
 *   the appraisal        record_id = <appraisal id>          (as before)
 *   the REX property     record_id = property:<id>
 *   the listing          record_id = listing:<id>
 *
 * Reading merges every key the home has, listing first and the appraisal last,
 * so the most specific answer wins. Writing goes to the most specific key.
 *
 * Alongside the answers, who gave each one (os_case_state
 * "property-answers-who": id -> { by, at }), so the agent's screen can say
 * "from the landlord" and the landlord's can say "your agent filled this in".
 *
 * The codes (SECRET_KEYS: the alarm code, the building or gate code) are
 * sealed as the bank details are (lib/bank-vault). Forms only ever get KEPT
 * back for one, so a code is never sent to a browser by the form that took it;
 * staff screens open them (openSecrets).
 */

const KIND = "property-answers";
const WHO = "property-answers-who";

export type HomeIds = { appraisalId?: string | null; propertyId?: string | null; listingId?: string | null };
export type Who = { by: string; at: string };

const clean = (s: string | null | undefined) => String(s ?? "").trim();

/** Every key the home's answers can be under, least specific first. */
export function homeKeys(h: HomeIds): string[] {
  const out: string[] = [];
  if (clean(h.listingId)) out.push(`listing:${clean(h.listingId)}`);
  if (clean(h.propertyId)) out.push(`property:${clean(h.propertyId)}`);
  if (clean(h.appraisalId)) out.push(clean(h.appraisalId));
  return out;
}

/** Where a new answer is written: the most specific key the home has. */
export const writeKey = (h: HomeIds): string | null => homeKeys(h).at(-1) ?? null;

async function rows(kind: string, keys: string[]): Promise<Array<{ record_id: string; payload: Record<string, unknown> | null }>> {
  if (!hasDb() || !keys.length) return [];
  return q<{ record_id: string; payload: Record<string, unknown> | null }>(
    `SELECT record_id, payload FROM os_case_state WHERE kind = $1 AND record_id = ANY($2)`,
    [kind, keys]
  ).catch(() => []);
}

/**
 * The appraisals behind a home known only by its REX property: a landlord who
 * answered on their portal (kept against the appraisal) is not asked again on
 * terms sent from the listing.
 */
async function appraisalsOf(h: HomeIds): Promise<string[]> {
  if (!hasDb() || clean(h.appraisalId) || !clean(h.propertyId)) return [];
  const r = await q<{ id: string }>(
    `SELECT id FROM os_market_appraisals WHERE rex_property_id = $1 ORDER BY created_at DESC LIMIT 3`,
    [clean(h.propertyId)]
  ).catch(() => []);
  return r.map((x) => x.id).reverse();
}

/** The home's answers as stored (codes still sealed), and who gave each. */
export async function readHome(h: HomeIds): Promise<{ answers: Answers; who: Record<string, Who> }> {
  const keys = [...(await appraisalsOf(h)), ...homeKeys(h)];
  const [a, w] = await Promise.all([rows(KIND, keys), rows(WHO, keys)]);
  const order = (r: { record_id: string }) => keys.indexOf(r.record_id);
  const answers: Answers = {};
  for (const r of a.sort((x, y) => order(x) - order(y))) Object.assign(answers, r.payload ?? {});
  const who: Record<string, Who> = {};
  for (const r of w.sort((x, y) => order(x) - order(y))) Object.assign(who, r.payload ?? {});
  return { answers, who };
}

/** For a form: every code as KEPT, never what it is. */
export function forForm(a: Answers): Answers {
  const out: Answers = {};
  for (const [k, v] of Object.entries(a)) out[k] = SECRET_KEYS.has(k) && typeof v === "string" && v.trim() ? KEPT : v;
  return out;
}

/** For staff on the home's file: the codes opened. */
export function openSecrets(a: Answers): Answers {
  const out: Answers = { ...a };
  for (const k of SECRET_KEYS) if (typeof out[k] === "string") out[k] = openAccount(out[k] as string);
  return out;
}

/**
 * Only keys the questionnaire has, each a string or a short list of strings,
 * and nothing the giver may not answer: the agent never answers the Gas
 * screen. A code sent back as KEPT is left as it is; a new one is sealed.
 */
export function cleanPatch(raw: unknown, giver: "landlord" | "agent"): Answers {
  const patch: Answers = {};
  if (!raw || typeof raw !== "object") return patch;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ANSWER_KEYS.has(k)) continue;
    if (giver === "agent" && LANDLORD_KEYS.has(k)) continue;
    if (typeof v === "string") {
      if (SECRET_KEYS.has(k)) {
        if (v === KEPT) continue;
        patch[k] = v.trim() ? sealAccount(v.trim().slice(0, 300)) : "";
      } else patch[k] = v.slice(0, 2000);
    } else if (Array.isArray(v)) patch[k] = v.filter((x): x is string => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 300));
  }
  return patch;
}

/** Merged in, never replacing (lib/property-answers-store says why), with who gave each. */
export async function saveHome(h: HomeIds, patch: Answers, by: string): Promise<{ answers: Answers; who: Record<string, Who> }> {
  const key = writeKey(h);
  if (!hasDb() || !key || !Object.keys(patch).length) return readHome(h);
  const at = new Date().toISOString();
  const who = Object.fromEntries(Object.keys(patch).map((k) => [k, { by, at }]));
  const up = (kind: string, payload: object) =>
    q(
      `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
       VALUES ($1, $2, $3::jsonb, NOW(), $4)
       ON CONFLICT (kind, record_id) DO UPDATE
         SET payload = os_case_state.payload || $3::jsonb, updated_at = NOW(), updated_by = $4`,
      [kind, key, JSON.stringify(payload), by]
    );
  await up(KIND, patch);
  await up(WHO, who).catch(() => null);
  return readHome(h);
}
