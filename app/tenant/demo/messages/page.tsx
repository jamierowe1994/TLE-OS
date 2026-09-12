import MessagesView from "@/components/tenant/MessagesView";
import { demoStage } from "@/lib/tenant-demo";
import { sampleFor } from "@/lib/tenant-sample";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <MessagesView v={sampleFor(await demoStage())} />;
}
