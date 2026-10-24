import "server-only";
import { hasDb, q } from "@/lib/db";
import { rexAllowedWrites, rexConfigured } from "@/lib/rex";
import { rexStatusView } from "@/lib/rex-outage";
import { allSwitches, sendingLocked, type SwitchState } from "@/lib/switches";
import { resendConfigured, resendSendUnlocked } from "@/lib/resend";
import { docusealConfigured, docusealSendUnlocked } from "@/lib/docuseal";
import { JOURNEYS, lightFor } from "@/lib/testing-journeys";
import { WALKED_STEPS, type LockTruth, type RexTruth, type SwitchLine, type WalkLine } from "@/lib/wiring";

/**
 * What Wiring says, read from the place that owns each fact (24 Oct 2026).
 *
 * James: remove the overlapping fields. Wiring used to work out REX, the locks
 * and "tested" for itself - REX from its env vars, the locks from env vars,
 * tested from a word typed into lib/wiring - while REX status, Switches and
 * Testing each kept the real answer. Two answers to one question will one day
 * disagree, and the one on Wiring was the one nobody maintained. So Wiring now
 * asks the owners:
 *
 *   rexTruth()   lib/rex-outage, exactly what Admin > REX status reads
 *   lockTruth()  lib/switches, exactly what Admin > Switches reads, beside the
 *                server's own locks (SENDING_LOCKED, RESEND_ALLOW_SEND,
 *                DOCUSEAL_ALLOW_SEND, REX_ALLOW_WRITES), each named as what
 *                it is, because an env var that overrides a switch is a hard
 *                lock and saying "off" for both would hide which one to undo
 *   walkTruth()  os_test_runs, exactly what Admin > Testing reads
 */

/** The switches that write into REX. Each also needs its method named in REX_ALLOW_WRITES. */
export const REX_WRITE_SWITCHES = [
  "rex_contact_create",
  "rex_compliance_write",
  "rex_property_create",
  "rex_listing_owner",
  "rex_property_source",
  "rex_property_source_office",
  "handover_live",
  "take_on_rex",
];

export async function rexTruth(): Promise<RexTruth> {
  const v = await rexStatusView();
  return {
    configured: rexConfigured(),
    mode: v.setting.mode,
    down: v.down,
    reason: v.reason,
    plannedFrom: v.setting.plannedFrom,
    plannedUntil: v.setting.plannedUntil,
    setBy: v.setting.setBy,
    setAt: v.setting.setAt,
    lastOkAt: v.lastOkAt,
    lastFailAt: v.lastFailAt,
    lastFailWhat: v.lastFailWhat,
    trippedAt: v.trippedAt,
    waiting: v.waiting,
  };
}

const line = (s: SwitchState): SwitchLine => ({
  key: s.key,
  label: s.label,
  on: s.on,
  fromEnv: s.fromEnv,
  legacyEnv: s.legacyEnv,
  changedBy: s.changedBy,
  changedAt: s.changedAt,
});

export async function lockTruth(): Promise<LockTruth> {
  const all = await allSwitches();
  const by = new Map(all.map((s) => [s.key, s]));
  const customers = by.get("customer_email");
  return {
    brake: sendingLocked(),
    email: { configured: resendConfigured(), serverOpen: resendSendUnlocked(), customers: customers ? line(customers) : null },
    docuseal: { configured: docusealConfigured(), serverOpen: docusealSendUnlocked() },
    rex: {
      configured: rexConfigured(),
      serverOpen: rexAllowedWrites(),
      switches: REX_WRITE_SWITCHES.map((k) => by.get(k)).filter((s): s is SwitchState => Boolean(s)).map(line),
    },
  };
}

/**
 * The newest walk of every step a wiring row maps to. Null when there is no
 * database to read, so the page says it could not measure rather than "not
 * walked yet", which would be a made-up answer.
 */
export async function walkTruth(): Promise<Record<string, WalkLine> | null> {
  if (!hasDb()) return null;
  const rows = await q<{ journey: string; step: string; result: string; by_name: string; at: string | Date; note: string }>(
    `SELECT DISTINCT ON (journey, step) journey, step, result, by_name, at, note
       FROM os_test_runs ORDER BY journey, step, at DESC`
  );
  const newest = new Map(rows.map((r) => [`${r.journey}/${r.step}`, r]));
  const out: Record<string, WalkLine> = {};
  for (const key of WALKED_STEPS) {
    const [j, s] = key.split("/");
    const step = JOURNEYS.find((x) => x.id === j)?.steps.find((x) => x.id === s);
    if (!step) continue;
    const r = newest.get(key);
    const mark = r
      ? { journey: j, step: s, result: r.result as "pass" | "fail", by: r.by_name, at: new Date(r.at).toISOString(), note: r.note }
      : null;
    const { light, stale } = lightFor(step, mark);
    out[key] = { key, journey: j, step: s, light, stale, result: mark?.result ?? null, by: mark?.by ?? null, at: mark?.at ?? null };
  }
  return out;
}
