import type { Metadata, Viewport } from "next";
import "../agent/m.css";

/**
 * DOWNLOAD OS lives at the top of the site, not under /agent (3 Oct 2026).
 *
 * An iPhone home-screen app counts as "inside the app" only the folder of the
 * page it was added from. Added from /agent/install, everything outside
 * /agent/ - /agent itself, the sign-in page - opened with Safari's address bar
 * and back, share, reload and compass buttons over the app (James's phone,
 * every time). Launch Pad's install screen sits at the top level, so its whole
 * site is the app. This page does the same, and carries the app's own
 * manifest and the Apple-named full-screen tag for the moment it is added.
 */

export const metadata: Metadata = {
  title: "Download TLE OS",
  manifest: "/icons/m/manifest.webmanifest",
  icons: { apple: "/icons/m/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "TLE OS", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf8f4",
};

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-app min-h-dvh" data-mtheme="light">
      {children}
    </div>
  );
}
