import JourneyView from "@/components/landlord/JourneyView";
import { RAJ } from "@/lib/landlord-sample";

/** The sample landlord's journey page - the same Raj as the demo home. */
export default function LandlordDemoJourney() {
  return <JourneyView view={RAJ} homeHref="/landlord/demo?from=admin" />;
}
