import MaintenanceView from "@/components/landlord/MaintenanceView";
import StageHarness from "@/components/landlord/StageHarness";
import { stageFrom } from "@/lib/landlord-harness";
import { rajAt } from "@/lib/landlord-sample";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The sample landlord's maintenance page - locked until Raj's property is let. */
export default async function LandlordDemoMaintenance({ searchParams }: Props) {
  const stage = await stageFrom(searchParams);
  const { view, maintenance } = rajAt(stage);
  return (
    <>
      <StageHarness stage={stage} />
      <MaintenanceView view={view} m={maintenance} sample />
    </>
  );
}
