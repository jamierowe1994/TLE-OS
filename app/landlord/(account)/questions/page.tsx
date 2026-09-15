import PropertyQuestions from "@/components/landlord/PropertyQuestions";
import { currentLandlord } from "@/lib/landlord-account";
import { loadLandlordHome } from "@/lib/landlord-home-view";

export const metadata = { title: "About your property · The Letting Experts" };

/**
 * What only the landlord knows, asked once the contract is signed.
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
      <PropertyQuestions appraisalId={view?.appraisalId ?? null} firstName={first} />
    </div>
  );
}
