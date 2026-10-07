import DocumentsView from "@/components/landlord/DocumentsView";
import StageHarness from "@/components/landlord/StageHarness";
import DemoNet from "@/components/showroom/demo/DemoNet";
import { stageFrom } from "@/lib/landlord-harness";
import { rajAt } from "@/lib/landlord-sample";
import { landlordDocsAt } from "@/lib/showroom/demo-portal";
import { isStory, isWay, worldFor } from "@/lib/showroom/demo-world";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The sample landlord's documents page - the same Raj as the demo home, at the same stop.
 *
 * With ?story= it is a moment of a Showroom back office walkthrough
 * (lib/showroom/demo-world): the certificates are the walkthrough's, and
 * Send the new one works, answered by the demo's own network.
 */
export default async function LandlordDemoDocuments({ searchParams }: Props) {
  const sp = await searchParams;
  const stage = await stageFrom(searchParams);
  const { view, docs } = rajAt(stage);
  const story = typeof sp.story === "string" ? sp.story : null;
  if (isStory(story)) {
    const way = typeof sp.way === "string" && isWay(sp.way) ? sp.way : "portal";
    const world = worldFor(story, Number(sp.at ?? 0) || 0, way);
    return (
      <>
        <DemoNet label="Sample landlord" />
        <DocumentsView view={view} docs={landlordDocsAt(world, docs)} />
      </>
    );
  }
  return (
    <>
      <StageHarness stage={stage} />
      <DocumentsView view={view} docs={docs} sample />
    </>
  );
}
