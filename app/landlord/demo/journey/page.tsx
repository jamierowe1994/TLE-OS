import JourneyView from "@/components/landlord/JourneyView";
import StageHarness from "@/components/landlord/StageHarness";
import { stageFrom } from "@/lib/landlord-harness";
import { rajAt } from "@/lib/landlord-sample";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The sample landlord's journey page - the same Raj as the demo home, at the same stop. */
export default async function LandlordDemoJourney({ searchParams }: Props) {
  const stage = await stageFrom(searchParams);
  return (
    <>
      <StageHarness stage={stage} />
      <JourneyView view={rajAt(stage).view} homeHref={`/landlord/demo?stage=${stage}&from=admin`} />
    </>
  );
}
