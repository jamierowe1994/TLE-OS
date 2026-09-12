import TenancyView from "@/components/tenant/TenancyView";
import { demoStage } from "@/lib/tenant-demo";
import { sampleFor } from "@/lib/tenant-sample";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <TenancyView v={sampleFor(await demoStage())} base="/tenant/demo" />;
}
