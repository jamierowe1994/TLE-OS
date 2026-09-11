import JourneyView from "@/components/landlord/JourneyView";
import { currentLandlord } from "@/lib/landlord-account";
import { loadLandlordHome } from "@/lib/landlord-home-view";

export const metadata = { title: "Your letting journey · The Letting Experts" };

/**
 * The landlord's journey, live: the same view the home page reads
 * (lib/landlord-home-view), laid out as where they are, what they can do,
 * and who does what at every stop.
 */
export default async function LandlordJourney() {
  const me = (await currentLandlord())!;
  const { view, first } = await loadLandlordHome(me);
  if (!view) {
    return (
      <div className="pt-4">
        <h1 className="text-[40px] leading-none">Hello, {first}</h1>
        <p className="mt-3 text-[13.5px] text-muted">We don&rsquo;t have a property against this address yet, so there is no journey to show.</p>
      </div>
    );
  }
  return <JourneyView view={view} homeHref="/landlord" />;
}
