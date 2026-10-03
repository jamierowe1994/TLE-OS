import type { Metadata, Viewport } from "next";
import PhoneFrame from "@/components/m/PhoneFrame";

/**
 * THE PHONE VIEW (16 Sep 2026).
 *
 * James: "a completely stripped version ... so they can log in whilst they're
 * on viewings and they can just access their account quickly. I think it
 * should literally be 4 or 5 buttons, and it'll be idiot-proof."
 *
 * Outside the (os) group on purpose: no rail, no Steve, no tour, no theme
 * chooser, no intro gate. Everything those bring is something to tap by
 * accident on a doorstep. The door (middleware) still guards it like any
 * other page, so a signed-out phone lands on /sign-in?next=/m.
 *
 * Reworked 18 Sep 2026 (James: "strip this page down to its absolute bare
 * minimum ... quick access to information"): today's calendar is the whole
 * home screen, each appointment opens onto the people and the property, and
 * everything else is in the slide-out menu (components/m/PhoneFrame).
 *
 * What it does: the diary, a person's number, a property's facts, and the
 * Right to Rent ID photograph. What it does not: add, change or delete
 * anything else. The one write is the ID check.
 */

export const metadata: Metadata = {
  title: "TLE OS",
  appleWebApp: { capable: true, title: "TLE OS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function PhoneLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="os-type min-h-dvh bg-page text-ink">
      <PhoneFrame>{children}</PhoneFrame>
    </div>
  );
}
