import DocumentsView from "@/components/tenant/DocumentsView";
import { demoStage } from "@/lib/tenant-demo";
import { sampleFor } from "@/lib/tenant-sample";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <DocumentsView v={sampleFor(await demoStage())} />;
}
