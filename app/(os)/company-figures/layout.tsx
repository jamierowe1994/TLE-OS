import OwnWorkspace from "@/components/OwnWorkspace";
import BusinessFrame from "./frame";
import { BUSINESS_RAIL } from "./rail";

/**
 * Susan's workspace - the whole business, at its own address.
 *
 * It used to be /admin/business, which is how James found this: signed in as
 * Susan, he could still see his admin section, and so could she. A screen
 * somebody owns should not be a page inside somebody else's area.
 *
 * 17 Sep 2026: the RAIL shape, like Kirstie's, rather than a bare page drawing
 * its own portal chrome. Each tab is a screen on the rail, and the way back to
 * the admin centre sits at the foot of it.
 */
export default function CompanyFiguresLayout({ children }: { children: React.ReactNode }) {
  return (
    <OwnWorkspace needs="see:business" rail={BUSINESS_RAIL} label="My Business">
      <BusinessFrame>{children}</BusinessFrame>
    </OwnWorkspace>
  );
}
