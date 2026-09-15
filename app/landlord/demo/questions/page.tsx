import PropertyQuestions from "@/components/landlord/PropertyQuestions";
import StageHarness from "@/components/landlord/StageHarness";
import { stageFrom } from "@/lib/landlord-harness";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The questionnaire in the showroom. Nothing is written: `demo` keeps every
 * answer in the tab, so the screen can be walked end to end - including the
 * finished state - without a record to write against.
 */
export default async function LandlordDemoQuestions({ searchParams }: Props) {
  const stage = await stageFrom(searchParams);
  return (
    <>
      <StageHarness stage={stage} />
      <PropertyQuestions appraisalId={null} firstName="Raj" demo />
    </>
  );
}
