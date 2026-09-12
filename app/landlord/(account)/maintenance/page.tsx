import MaintenanceView from "@/components/landlord/MaintenanceView";
import { currentLandlord } from "@/lib/landlord-account";
import { loadLandlordHome } from "@/lib/landlord-home-view";
import { loadLandlordMaintenance } from "@/lib/landlord-maintenance-view";

export const metadata = { title: "Maintenance · The Letting Experts" };

/**
 * The landlord's maintenance, live: every job and visit on the properties
 * we look after for them, from the maintenance board and the inspections
 * book, and a way to report something themselves.
 */
export default async function LandlordMaintenancePage() {
  const me = (await currentLandlord())!;
  const [{ view, first }, m] = await Promise.all([loadLandlordHome(me), loadLandlordMaintenance(me)]);
  if (!view) {
    return (
      <div className="pt-4">
        <h1 className="text-[40px] leading-none">Hello, {first}</h1>
        <p className="mt-3 text-[13.5px] text-muted">We don&rsquo;t have a property against this address yet, so there is no maintenance to show.</p>
      </div>
    );
  }
  return <MaintenanceView view={view} m={m} />;
}
