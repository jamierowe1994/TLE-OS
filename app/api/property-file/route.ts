import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { getComplianceItemsFor, type ComplianceItem } from "@/lib/business/rex-stats";
import { matchProperty, pendingKeyFor, type MatchResult } from "@/lib/property-match";
import { listVault, type VaultFile } from "@/lib/vault";
import { rexConfigured } from "@/lib/rex";
import { osCertRows } from "@/lib/os-certs";

/**
 * GET /api/property-file?property=<REX property id>
 * GET /api/property-file?address=<one line>
 *
 * One property's file, the same from every screen (James, 6 Sep 2026: "when
 * a file gets attached it will travel with it no matter where it goes"):
 * what REX requires of the home and where each stands, whether the
 * certificate itself is in REX, and the files the OS holds. By address, the
 * property is found with the backlog's matcher; an address REX does not
 * know yet still has a file - held against the address, moved onto the
 * property the day it exists.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** REX's compliance type → the vault folder the intake files it under. */
const VAULT_KEY: Record<string, string> = {
  gas_safety: "gas",
  eicr: "eicr",
  epc: "epc",
  mandatory_hmo_license: "licence",
  additional_hmo_license: "licence",
  selective_hmo_license: "licence",
  legionella_risk_assessment: "legionella",
  portable_appliance_testing: "pat",
  smoke_alarms: "alarms",
  co_alarms: "alarms",
  emergency_lighting_fire_exit: "fire",
};
/** Which REX type a dropped file of a vault kind is written as. */
const INTAKE_TYPE: Record<string, string> = {
  gas: "gas_safety",
  eicr: "eicr",
  epc: "epc",
  licence: "mandatory_hmo_license",
  legionella: "legionella_risk_assessment",
  pat: "portable_appliance_testing",
  alarms: "smoke_alarms",
  fire: "emergency_lighting_fire_exit",
};
/* Not certificates: the file panel is about the home's safety duties. */
const NOT_A_CERTIFICATE = new Set(["terms_of_business", "listing_proof_of_ownership"]);
const ORDER = ["gas_safety", "eicr", "epc", "mandatory_hmo_license", "additional_hmo_license", "selective_hmo_license", "oil_safety", "smoke_alarms", "co_alarms", "emergency_lighting_fire_exit", "portable_appliance_testing", "legionella_risk_assessment"];

export interface FileRow {
  type: string;
  label: string;
  state: ComplianceItem["state"] | "held-here";
  expiry: string | null;
  issued: string | null;
  inRex: boolean;
  fileInRex: boolean;
  files: VaultFile[];
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const propertyParam = (req.nextUrl.searchParams.get("property") ?? "").trim();
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  const osOnly = /^pm-[0-9a-f-]+$/i.test(propertyParam);
  if (!/^\d+$/.test(propertyParam) && !osOnly && !address) return NextResponse.json({ ok: false, error: "Which property?" }, { status: 400 });

  let propertyId: string | null = /^\d+$/.test(propertyParam) || osOnly ? propertyParam : null;
  let match: MatchResult | null = null;
  if (!propertyId && address) {
    match = await matchProperty(address).catch(() => null);
    if (match?.verdict === "confident" && match.targets.length === 1) propertyId = match.targets[0].id;
  }

  const pendingKey = address ? pendingKeyFor(address) : null;
  const [rex, files, pendingFiles] = await Promise.all([
    propertyId && !osOnly ? getComplianceItemsFor(propertyId).catch(() => ({ items: [] as ComplianceItem[], checked: false })) : Promise.resolve({ items: [] as ComplianceItem[], checked: osOnly }),
    propertyId ? listVault(propertyId).catch(() => [] as VaultFile[]) : Promise.resolve([] as VaultFile[]),
    pendingKey ? listVault(pendingKey).catch(() => [] as VaultFile[]) : Promise.resolve([] as VaultFile[]),
  ]);

  const byVaultKey = new Map<string, VaultFile[]>();
  for (const f of [...files, ...pendingFiles]) byVaultKey.set(f.certKey, [...(byVaultKey.get(f.certKey) ?? []), f]);

  const rows: FileRow[] = [];
  const seenVault = new Set<string>();
  /* A home REX CRM does not hold: the OS's own certificates are its rows. */
  if (osOnly && propertyId) {
    const today = new Date().toISOString().slice(0, 10);
    const latest = new Map<string, { expiry: string; issue: string | null }>();
    for (const r of await osCertRows([propertyId]).catch(() => [])) if (!latest.has(r.type_id)) latest.set(r.type_id, { expiry: r.expiry, issue: r.issue });
    for (const [type, v] of latest) {
      const vk = VAULT_KEY[type];
      const own = vk ? byVaultKey.get(vk) ?? [] : [];
      if (vk) seenVault.add(vk);
      rows.push({ type, label: Object.entries(INTAKE_TYPE).find(([, t]) => t === type)?.[0]?.toUpperCase() ?? type, state: v.expiry < today ? "expired" : "valid", expiry: v.expiry, issued: v.issue, inRex: false, fileInRex: false, files: own });
    }
  }
  for (const it of rex.items) {
    if (NOT_A_CERTIFICATE.has(it.type)) continue;
    const vk = VAULT_KEY[it.type];
    const own = vk && !seenVault.has(vk) ? byVaultKey.get(vk) ?? [] : [];
    if (vk) seenVault.add(vk);
    rows.push({ type: it.type, label: it.label, state: it.state, expiry: it.expiry, issued: it.issued, inRex: Boolean(it.entryId), fileInRex: Boolean(it.hasDocument), files: own });
  }
  /* Files the OS holds that REX has no row for (an address still waiting on
     its property, or a type REX does not track here). */
  for (const [vk, own] of byVaultKey) {
    if (seenVault.has(vk)) continue;
    rows.push({ type: INTAKE_TYPE[vk] ?? vk, label: own[0]?.label ?? vk, state: "held-here", expiry: null, issued: null, inRex: false, fileInRex: false, files: own });
  }
  rows.sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99));

  return NextResponse.json({
    ok: true,
    live: rexConfigured(),
    propertyId,
    pendingKey: propertyId ? null : pendingKey,
    checked: rex.checked,
    match: match ? { verdict: match.verdict, how: match.how, targets: match.targets, possible: match.possible } : null,
    rows,
    outstanding: rows.filter((r) => r.state === "expired" || r.state === "expiring" || r.state === "missing").length,
  });
}
