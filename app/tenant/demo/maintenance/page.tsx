import MaintenanceView from "@/components/tenant/MaintenanceView";
import { demoStage } from "@/lib/tenant-demo";
import { sampleFor } from "@/lib/tenant-sample";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <MaintenanceView v={sampleFor(await demoStage())} base="/tenant/demo" />;
}
