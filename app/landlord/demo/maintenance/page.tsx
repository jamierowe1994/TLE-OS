import MaintenanceView from "@/components/landlord/MaintenanceView";
import { RAJ, RAJ_MAINTENANCE } from "@/lib/landlord-sample";

/** The sample landlord's maintenance page - the same Raj as the demo home. */
export default function LandlordDemoMaintenance() {
  return <MaintenanceView view={RAJ} m={RAJ_MAINTENANCE} sample />;
}
