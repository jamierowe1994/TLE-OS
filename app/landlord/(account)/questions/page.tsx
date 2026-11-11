import PropertyQuestions from "@/components/landlord/PropertyQuestions";
import { currentLandlord } from "@/lib/landlord-account";
import { loadLandlordHome } from "@/lib/landlord-home-view";

export const metadata = { title: "About your property · The Letting Experts" };

/**
 * What only the landlord knows, asked before the contract (James, 5 Nov 2026;
 * it used to wait until the contract was signed).
 *
 * Its own page rather than a panel on the home, because it is seven screens
 * long and because it has an address they can be sent back to - "carry on
 * where you left off" needs somewhere to carry on.
 */
export default async function LandlordQuestionsPage() {
  const me = (await currentLandlord())!;
  const { view, first } = await loadLandlordHome(me);
  return (
    <div className="pt-4">
      <PropertyQuestions appraisalId={view?.appraisalId ?? null} firstName={first} signed={Boolean(view?.steps && !view.steps.some((s) => s.id === "sign"))} />
    </div>
  );
}
