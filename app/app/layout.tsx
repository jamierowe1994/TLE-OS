import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import AppFrame from "@/components/app/AppFrame";
import { M_THEME_COLOUR, M_THEME_COOKIE, type MTheme } from "@/lib/m-theme";
import "./m.css";

/**
 * THE AGENTS' APP (2 Oct 2026): what opens from the home screen.
 *
 * Its own address, apart from the phone site at /m. James, the same evening:
 * a phone in the browser keeps the original phone site, and its menu offers
 * "Download App" (/app/install); this is what downloading gives them - in
 * Safari or Chrome as an installed web app, or inside the iPhone app (ios/).
 * Keeping it at its own path is what lets the two differ: an installed web
 * app can share cookies with the browser (Android does), so a cookie could
 * never have told them apart.
 *
 * The look, after four goes in one day, is a nod to the original Notion
 * style: monochrome, the Notioly line drawings, light or dark chosen on the
 * first visit (components/app/Welcome), four tabs at the foot and a "+" for
 * every other page (components/app/AppFrame). The mode is a per-phone cookie,
 * read here so the first paint is already right, and the iPhone app's status
 * bar follows the theme colour. The iPhone app's user agent ends
 * "TLEOSApp/<version>", read here for its test alert.
 *
 * What it does: the diary, a person's number, a property's facts, and the
 * Right to Rent ID photograph. The one write is the ID check.
 */

/* Saved to the home screen, the phone is its own app (2 Oct 2026): its own
   manifest, so adding it opens here - not on the pre-tenancy dashboard the
   site-wide one (app/manifest.webmanifest) opens for Kirstie's desktop window. Both
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
      <AppFrame inApp={inApp} theme={theme}>
        {children}
      </AppFrame>
    </div>
  );
}
