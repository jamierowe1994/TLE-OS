import MaintenanceView from "@/components/landlord/MaintenanceView";
import StageHarness from "@/components/landlord/StageHarness";
import DemoNet from "@/components/showroom/demo/DemoNet";
import { stageFrom } from "@/lib/landlord-harness";
import { rajAt } from "@/lib/landlord-sample";
import { landlordMaintAt } from "@/lib/showroom/demo-portal";
import { isStory, isWay, worldFor } from "@/lib/showroom/demo-world";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The sample landlord's maintenance page - locked until Raj's property is let.
 *
 * With ?story= it is a moment of a Showroom back office walkthrough instead
 * (lib/showroom/demo-world): the jobs are the walkthrough's, and Tell us
 * works, answered by the demo's own network so nothing is saved or sent.
 */
export default async function LandlordDemoMaintenance({ searchParams }: Props) {
  const sp = await searchParams;
  const stage = await stageFrom(searchParams);
  const { view, maintenance } = rajAt(stage);
  const story = typeof sp.story === "string" ? sp.story : null;
  if (isStory(story)) {
    const way = typeof sp.way === "string" && isWay(sp.way) ? sp.way : "portal";
    const world = worldFor(story, Number(sp.at ?? 0) || 0, way);
    return (
      <>
        <DemoNet label="Sample landlord" />
        <MaintenanceView view={view} m={landlordMaintAt(world, maintenance)} />
      </>
    );
  }
  return (
    <>
      <StageHarness stage={stage} />
      <MaintenanceView view={view} m={maintenance} sample />
    </>
  );
}
