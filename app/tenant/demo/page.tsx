import HomeView from "@/components/tenant/HomeView";
import { demoStage } from "@/lib/tenant-demo";
import { sampleFor } from "@/lib/tenant-sample";

export const dynamic = "force-dynamic";

export default async function TenantDemoHome({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const [sp, stage] = await Promise.all([searchParams, demoStage()]);
  /* Keyed on the stage so a switch in the harness plays the blocks in again. */
  return <HomeView key={stage} v={sampleFor(stage)} welcome={false} base="/tenant/demo" q={sp.from === "admin" ? "?from=admin" : ""} sample />;
}
