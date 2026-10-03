import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import PhoneFrame from "@/components/m/PhoneFrame";
import { M_THEME_COLOUR, M_THEME_COOKIE, type MTheme } from "@/lib/m-theme";
import "./m.css";

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
 * everything else is in the slide-out menu.
 *
 * Reworked 2 Oct 2026 for the iPhone app (ios/), four times in a day; the
 * one that stuck is a nod to the original Notion look: monochrome, the
 * Notioly line drawings, light or dark chosen on the first visit
 * (components/m/Welcome), four tabs at the foot and a "+" for every other
 * page (components/m/PhoneFrame). The mode is a per-phone cookie, read here
 * so the first paint is already right, and the app's status bar follows the
 * theme colour. The app's user agent ends "TLEOSApp/<version>", read here
 * for the one thing only the app offers: a test alert to your own phone.
 *
 * What it does: the diary, a person's number, a property's facts, and the
 * Right to Rent ID photograph. What it does not: add, change or delete
 * anything else. The one write is the ID check.
 */

/* Saved to the home screen, the phone is its own app (2 Oct 2026): its own
   manifest, so adding it opens here - not on the pre-tenancy dashboard the
   site-wide one (app/manifest.ts) opens for Kirstie's desktop window. Both
   live under /icons, which the door leaves open: a phone asks for them
   without a cookie. */
export const metadata: Metadata = {
  title: "TLE OS",
  manifest: "/icons/m/manifest.webmanifest",
  icons: { apple: "/icons/m/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "TLE OS", statusBarStyle: "default" },
};

async function chosenTheme(): Promise<MTheme | null> {
  const v = (await cookies()).get(M_THEME_COOKIE)?.value;
  return v === "light" || v === "dark" ? v : null;
}

export async function generateViewport(): Promise<Viewport> {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: M_THEME_COLOUR[(await chosenTheme()) ?? "light"],
  };
}

export default async function PhoneLayout({ children }: { children: React.ReactNode }) {
  const inApp = /TLEOSApp\//.test((await headers()).get("user-agent") ?? "");
  const theme = await chosenTheme();
  return (
    <div className="m-app min-h-dvh" data-mtheme={theme ?? "light"}>
      <PhoneFrame inApp={inApp} theme={theme}>
        {children}
      </PhoneFrame>
    </div>
  );
}
