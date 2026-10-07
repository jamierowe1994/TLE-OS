import "server-only";
import { hasDb, q } from "@/lib/db";
import { notLetFrom } from "@/lib/not-let";
import { osCertsFor } from "@/lib/os-certs";
import { notNeededAll } from "@/lib/cert-not-needed";
import { NEXT_TENANCY_CERTS, isScottishHome, withMark, type Cert, type CertKey, type CompProperty } from "@/lib/compliance";

/**
 * What the clean sweep and the OS's own vault already hold, folded into the
 * compliance book (James, 7 Oct 2026).
 *
 * Michael's tracker showed 351 outstanding. Measured against the OS that day,
 * about 200 of them were answered already somewhere the book never looked:
 *
 *   - 79 on 29 homes the sweep parks as not let or archived;
 *   - PAT, alarms and legionella dates, and HMO licences, that the sweep
 *     collected into os_property_facts (91 rows);
 *   - alarms on homes whose gas safety record is on file, which the sweep
 *     already counts as the alarms evidence (15);
 *   - certificates the OS filed on a REX home that never made it into REX's
 *     compliance table (the book read REX alone for those homes).
 *
 * So the book reads them, and every screen built on it - the tracker, the
 * agents' compliance, Portfolio, the sweep - says the same thing.
 */

type FactCell = { value: string | null; file_key: string | null };

export type SweepAnswers = {
  notLet: boolean;
  facts: Map<string, FactCell>;
};

/** Days from today to a YYYY-MM-DD, inside the same 2000-2045 window as every reader. */
function daysUntil(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const then = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  if (!Number.isFinite(then) || iso < "2000-01-01" || iso > "2045-12-31") return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((then - today.getTime()) / 86400000);
}

/** Every active OS home's sweep answers, keyed by OS id AND REX property id. */
export async function sweepAnswers(): Promise<Map<string, SweepAnswers>> {
  const out = new Map<string, SweepAnswers>();
  if (!hasDb()) return out;
  const props = await q<{ id: string; rex_property_id: string | null; tenant_names: string | null }>(
    `SELECT id, rex_property_id, tenant_names FROM os_properties WHERE active`
  ).catch(() => []);
  if (!props.length) return out;
  const rows = await q<{ property_id: string; field: string; value: string | null; file_key: string | null }>(
    `SELECT property_id, field, value, file_key FROM os_property_facts
      WHERE field = ANY($1) AND (value IS NOT NULL OR file_key IS NOT NULL)`,
    [["pat_expiry", "alarms_expiry", "legionella_expiry", "doc_licence", "rex_pm_status", "deposit_status", "tenancy_start", "tenants_count"]]
  ).catch(() => []);
  const byProp = new Map<string, Map<string, FactCell>>();
  for (const r of rows) (byProp.get(r.property_id) ?? byProp.set(r.property_id, new Map()).get(r.property_id)!).set(r.field, r);
  for (const p of props) {
    const facts = byProp.get(p.id) ?? new Map<string, FactCell>();
    const a: SweepAnswers = { notLet: notLetFrom(p.tenant_names, facts), facts };
    out.set(p.id, a);
    /* Several OS records can share one REX home (rooms, old duplicates): it is
       let if any of them is, and a fact any of them holds counts. */
    if (p.rex_property_id) {
      const key = String(p.rex_property_id);
      const held = out.get(key);
      if (!held) out.set(key, { notLet: a.notLet, facts: new Map(facts) });
      else {
        held.notLet = held.notLet && a.notLet;
        for (const [k, v] of facts) if (!held.facts.has(k)) held.facts.set(k, v);
      }
    }
  }
  return out;
}

const SWEEP_FIELD: Partial<Record<CertKey, string>> = {
  pat: "pat_expiry",
  alarms: "alarms_expiry",
  legionella: "legionella_expiry",
  licence: "doc_licence",
};

/** The later of two, by expiry; a dated record beats an undated one. */
function better(held: Cert | undefined, next: Cert): boolean {
  if (!held) return true;
  if (held.expires == null) return next.expires != null || (!held.attached && next.attached);
  return next.expires != null && next.expires > held.expires;
}

/**
 * Fold the sweep and the OS vault into the book, in place. Run after REX and
 * the OS record have had their say, before rooms inherit from their house.
 */
export async function applySweep(properties: CompProperty[]): Promise<void> {
  const [answers, vault, notNeeded] = await Promise.all([
    sweepAnswers().catch(() => new Map<string, SweepAnswers>()),
    osCertsFor([...new Set(properties.map((p) => String(p.id)).filter((id) => /^\d+$/.test(id)))]).catch(
      () => new Map<string, Partial<Record<CertKey, Cert>>>()
    ),
    notNeededAll().catch(() => []),
  ]);
  const exempt = new Map(notNeeded.map((n) => [`${n.propertyId}|${n.cert}`, n]));
  for (const p of properties) {
    /* The OS's own certificate on a REX home: filed here, and REX refused it
       or has not caught up. The later expiry is the true one. */
    const own = vault.get(String(p.id));
    if (own) {
      for (const [k, c] of Object.entries(own) as [CertKey, Cert][]) {
        if (c && better(p.certs[k], c)) p.certs[k] = { ...c, fromOs: true };
      }
    }

    const a = answers.get(String(p.id));
    if (a) {
      /* A tenant REX names is a tenant in, whatever the OS record lacks. */
      const rexNamesSomeone = typeof p.tenant === "string" && p.tenant.trim() !== "" && p.tenant.trim() !== "—";
      if (a.notLet && !rexNamesSomeone) p.notLet = true;
      else if (a.notLet && /^(archived|vacant, no letting agreement)/i.test(a.facts.get("rex_pm_status")?.value ?? "")) p.notLet = true;

      for (const [k, field] of Object.entries(SWEEP_FIELD) as [CertKey, string][]) {
        const f = a.facts.get(field);
        if (!f) continue;
        const expires = f.value ? daysUntil(f.value) : null;
        /* A file with no date (a licence, a "fire alarm test on file") is on
           file, not in date: it comes off the outstanding list, and the date
           is still asked for. */
        const c: Cert = expires != null ? { expires, attached: Boolean(f.file_key), fromSweep: true } : { expires: null, attached: true, undated: true, fromSweep: true };
        if (!f.file_key && expires == null) continue;
        if (better(p.certs[k], c)) p.certs[k] = c;
      }
    }

    /* Smoke and CO alarms are checked at the gas safety inspection and named
       on its record - the sweep's own rule (25 Sep 2026). */
    const gas = p.certs.gas;
    const alarms = p.certs.alarms;
    if (gas && gas.expires != null && (!alarms || (alarms.expires == null && !alarms.undated))) {
      p.certs.alarms = { expires: gas.expires, attached: gas.attached, viaGas: true };
    }

    /* Marked not needed by the compliance office: the record stays as it is,
       flagged, so requiredCerts leaves it out everywhere. */
    for (const [k, n] of exempt) {
      const [pid, cert] = k.split("|");
      if (pid !== String(p.id)) continue;
      const held = p.certs[cert as CertKey];
      p.certs[cert as CertKey] = withMark(held, n);
    }
  }
}

/**
 * Scotland's EPC and legionella, held to the next tenancy (Michael, 7 Oct
 * 2026; lib/compliance heldToNextTenancy). Run on the finished book, after
 * rooms inherit from their house, so each home is judged on its OWN tenancy:
 * a room let after the house's EPC ran out was let without one, and is not held.
 *
 * Held when the home is let, its tenancy start is known (the clean sweep's
 * tenancy_start), and the certificate was still valid on that day - so it
 * runs out, or ran out, during this tenancy. Due again when the next begins.
 */
/** The furthest out the tracker chases (its 30-day band): nearer than this, a held certificate is said so. */
const NEXT_TENANCY_FROM_DAYS = 30;

export async function holdToNextTenancy(properties: CompProperty[]): Promise<void> {
  const answers = await sweepAnswers().catch(() => new Map<string, SweepAnswers>());
  for (const p of properties) {
    if (!isScottishHome(p) || p.notLet) continue;
    const start = (answers.get(String(p.id))?.facts.get("tenancy_start")?.value ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    const startDays = daysUntil(start);
    if (startDays == null || startDays > 0) continue; /* a tenancy not begun yet is the next tenancy */
    for (const k of NEXT_TENANCY_CERTS) {
      const c = p.certs[k];
      if (!c || c.expires == null || c.notNeeded) continue;
      /* Only one that would otherwise be on a list: run out, or inside the
         30-day chase. An EPC good until 2031 is simply in date. */
      if (c.expires > NEXT_TENANCY_FROM_DAYS) continue;
      if (c.expires >= startDays) p.certs[k] = { ...c, toNextTenancy: { tenancyStart: start } };
    }
  }
}
