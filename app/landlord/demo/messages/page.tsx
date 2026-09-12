import MessagesView from "@/components/landlord/MessagesView";
import StageHarness from "@/components/landlord/StageHarness";
import { stageFrom } from "@/lib/landlord-harness";
import { rajAt } from "@/lib/landlord-sample";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The sample landlord's messages page - the same Raj as the demo home, at the same stop. */
export default async function LandlordDemoMessages({ searchParams }: Props) {
  const stage = await stageFrom(searchParams);
  return (
    <>
      <StageHarness stage={stage} />
      <MessagesView view={rajAt(stage).view} sample />
    </>
  );
}
