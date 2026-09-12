import { isStage } from "@/lib/landlord-sample";
import type { Stage } from "@/lib/landlord-view";

/** ?stage=<id> on the sample pages; Raj about to sign when it is missing. */
export async function stageFrom(searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<Stage> {
  const p = await searchParams;
  const v = Array.isArray(p.stage) ? p.stage[0] : p.stage;
  return isStage(v) ? v : "instruction";
}
