import "server-only";
import { cookies } from "next/headers";
import { DEMO_STAGE_COOKIE, isStage, type TenantStageKey } from "@/lib/tenant-journey";

/**
 * Which stage the sample tenant is at: a cookie, set by the harness on the
 * sample's pages (app/tenant/demo/stage) so James can walk Sophie from a
 * fresh passport to living in the home and see every page change. Nothing
 * outside /tenant/demo reads it.
 */
export async function demoStage(override?: string | null): Promise<TenantStageKey> {
  /* ?stage= wins over the cookie, so a link can open the sample at one stage
     without moving the harness on for whoever else is looking. The process
     map links this way from every step that changes something for them. */
  if (isStage(override)) return override;
  const c = (await cookies()).get(DEMO_STAGE_COOKIE)?.value;
  return isStage(c) ? c : "referencing";
}
