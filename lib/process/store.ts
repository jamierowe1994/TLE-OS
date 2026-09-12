import "server-only";
import { hasDb, q } from "@/lib/db";
import { TENANT_PROCESS } from "@/lib/process/tenant";
import type { ProcessMap } from "@/lib/process/types";

/**
 * Process maps live in os_process_maps, one row per audience, as the map
 * itself in JSON. The default in code is what a fresh environment shows
 * and what "reset" returns to; a saved map replaces it whole. The map is
 * the intent - the thing the OS is meant to do to a tenant - and the
 * automation that acts on it reads from here, so editing the map is
 * editing the process rather than a picture of it.
 */

const DEFAULTS: Record<string, ProcessMap> = { tenant: TENANT_PROCESS };

export function defaultProcess(audience: string): ProcessMap | null {
  return DEFAULTS[audience] ?? null;
}

export async function loadProcess(audience: string): Promise<ProcessMap | null> {
  const base = defaultProcess(audience);
  if (!base) return null;
  if (!hasDb()) return base;
  const rows = await q<{ definition: ProcessMap; updated_at: string | Date }>(
    `SELECT definition, updated_at::text AS updated_at FROM os_process_maps WHERE audience = $1`,
    [audience]
  ).catch(() => []);
  const r = rows[0];
  if (!r) return base;
  return { ...base, ...r.definition, audience, updatedAt: new Date(r.updated_at).toISOString() };
}

export async function saveProcess(audience: string, map: ProcessMap, by: string): Promise<ProcessMap> {
  if (!hasDb()) throw new Error("No database is connected, so the process cannot be saved.");
  const clean: ProcessMap = {
    audience,
    title: String(map.title ?? "").slice(0, 120),
    blurb: String(map.blurb ?? "").slice(0, 600),
    version: Number(map.version ?? 1) + 1,
    nodes: (map.nodes ?? []).slice(0, 200).map((n) => ({
      id: String(n.id).slice(0, 60),
      kind: n.kind,
      title: String(n.title ?? "").slice(0, 120),
      blurb: n.blurb ? String(n.blurb).slice(0, 400) : undefined,
      lane: n.lane,
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      status: n.status,
      href: n.href ? String(n.href).slice(0, 300) : undefined,
      emailId: n.emailId ? String(n.emailId).slice(0, 80) : undefined,
      trigger: n.trigger ? { on: String(n.trigger.on).slice(0, 80), after: n.trigger.after ? String(n.trigger.after).slice(0, 60) : undefined } : undefined,
    })),
    edges: (map.edges ?? []).slice(0, 400).map((e) => ({ from: String(e.from), to: String(e.to), label: e.label ? String(e.label).slice(0, 80) : undefined, kind: e.kind })),
  };
  await q(
    `INSERT INTO os_process_maps (audience, definition, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (audience) DO UPDATE SET definition = EXCLUDED.definition, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [audience, JSON.stringify(clean), by]
  );
  return { ...clean, updatedAt: new Date().toISOString() };
}

export async function resetProcess(audience: string): Promise<void> {
  if (!hasDb()) return;
  await q(`DELETE FROM os_process_maps WHERE audience = $1`, [audience]);
}
