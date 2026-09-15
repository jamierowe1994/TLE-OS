import TenancyView from "@/components/tenant/TenancyView";
import { demoStage } from "@/lib/tenant-demo";
import { sampleFor } from "@/lib/tenant-sample";

export const dynamic = "force-dynamic";

/* ?stage= is honoured here, not just on the sample's home page.
   demoStage() was written to take it - "a link can open the sample at one
   stage without moving the harness on for whoever else is looking", and the
   process map links this way - but these five pages never passed it, so every
   such link quietly showed whatever the cookie happened to hold. */
export default async function Page({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const sp = await searchParams;
  return <TenancyView v={sampleFor(await demoStage(sp.stage))} base="/tenant/demo" />;
}
