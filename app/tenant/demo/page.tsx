import HomeView from "@/components/tenant/HomeView";
import { demoStage } from "@/lib/tenant-demo";
import { sampleFor } from "@/lib/tenant-sample";

export const dynamic = "force-dynamic";

export default async function TenantDemoHome({ searchParams }: { searchParams: Promise<{ from?: string; stage?: string }> }) {
  const sp = await searchParams;
  const stage = await demoStage(sp.stage);
  /* Keyed on the stage so a switch in the harness plays the blocks in again. */
  return <HomeView key={stage} v={sampleFor(stage)} welcome={false} base="/tenant/demo" q={sp.from === "admin" ? "?from=admin" : ""} sample />;
}
