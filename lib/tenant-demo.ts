import "server-only";
import { cookies } from "next/headers";
import { DEMO_STAGE_COOKIE, isStage, type TenantStageKey } from "@/lib/tenant-journey";

/**
 * Which stage the sample tenant is at: a cookie, set by the harness on the
 * sample's pages (app/tenant/demo/stage) so James can walk Sophie from a
 * fresh passport to living in the home and see every page change. Nothing
 * outside /tenant/demo reads it.
 */
export async function demoStage(): Promise<TenantStageKey> {
  const c = (await cookies()).get(DEMO_STAGE_COOKIE)?.value;
  return isStage(c) ? c : "referencing";
}
