import PaymentsView from "@/components/tenant/PaymentsView";
import { demoStage } from "@/lib/tenant-demo";
import { sampleFor } from "@/lib/tenant-sample";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <PaymentsView v={sampleFor(await demoStage())} base="/tenant/demo" />;
}
