/**
 * No tenant has moved in yet, or the home is not with us any more - the clean
 * sweep's rule (James, 25 and 28 Sep 2026), in one place so the sweep and the
 * compliance book park the same homes (7 Oct 2026: the tracker was chasing
 * 79 certificates on 29 homes the sweep had already set aside).
 *
 * Pure, no database: the caller hands over the home's facts by field.
 */
export function notLetFrom(tenantNames: string | null | undefined, facts: Map<string, { value: string | null }>): boolean {
  /* REX PM has the home archived, or vacant with no letting agreement. */
  if (/^(archived|vacant, no letting agreement)/i.test(facts.get("rex_pm_status")?.value ?? "")) return true;
  /* Susan's deposit report (28 Sep) marks homes archived or sold, to come off PayProp. */
  if (/^archived/i.test(facts.get("deposit_status")?.value ?? "")) return true;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const start = (facts.get("tenancy_start")?.value ?? "").slice(0, 10);
  if (start && start > today) return true;
  const named = Boolean((tenantNames ?? "").trim());
  const counted = Number(facts.get("tenants_count")?.value ?? 0) > 0;
  return !named && !counted;
}
