import { redirect } from "next/navigation";

/** Landlord Radar became Bond on 2 Sep 2026. Old links still land. */
export default function RadarRedirect() {
  redirect("/tools/bond");
}
