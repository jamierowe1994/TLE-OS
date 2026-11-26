import SignInCalm from "@/components/landlord/SignInCalm";
import SignInClassic from "@/components/landlord/SignInClassic";
import { portalLookOn } from "@/lib/portal-look";

/**
 * The landlord's front door. One box, their email, and a link in reply
 * (components/landlord/useLandlordLink).
 *
 * The "portals" switch chooses the drawing: on, the calm page on its own
 * (SignInCalm, 26 Nov 2026); off, the page as it has been (SignInClassic).
 */
export default async function LandlordSignIn() {
  return (await portalLookOn()) ? <SignInCalm /> : <SignInClassic />;
}
