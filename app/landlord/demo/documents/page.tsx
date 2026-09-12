import DocumentsView from "@/components/landlord/DocumentsView";
import StageHarness from "@/components/landlord/StageHarness";
import { stageFrom } from "@/lib/landlord-harness";
import { rajAt } from "@/lib/landlord-sample";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The sample landlord's documents page - the same Raj as the demo home, at the same stop. */
export default async function LandlordDemoDocuments({ searchParams }: Props) {
  const stage = await stageFrom(searchParams);
  const { view, docs } = rajAt(stage);
  return (
    <>
      <StageHarness stage={stage} />
      <DocumentsView view={view} docs={docs} sample />
    </>
  );
}
