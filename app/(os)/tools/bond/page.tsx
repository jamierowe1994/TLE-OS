import BondApp from "@/components/BondApp";

/**
 * Bond — the prospecting workspace, full screen.
 *
 * James, 2 Sep 2026: "rather than calling this Landlord Radar, make this a
 * full prospecting app... it will launch into a full panel, and we're going
 * to call it Bond." So the page is the app: it covers the OS, says its name,
 * and then brings the workspace in. Back to OS is one press.
 */

export const metadata = { title: "Bond" };

export default function BondPage() {
  return <BondApp />;
}
