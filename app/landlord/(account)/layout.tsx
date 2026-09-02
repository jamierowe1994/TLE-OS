import { redirect } from "next/navigation";
import { currentLandlord } from "@/lib/landlord-account";

/**
 * The door. Everything in this group is a signed-in landlord's own, so the
 * check is made once here rather than remembered on each page. Sign-in, the
 * link landing and the demo live outside the group and need no session.
 */
export default async function LandlordAccountLayout({ children }: { children: React.ReactNode }) {
  const me = await currentLandlord();
  if (!me) redirect("/landlord/sign-in");
  return <>{children}</>;
}
