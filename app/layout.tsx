import type { Metadata } from "next";
import { Allura, Inter, Montserrat, Shantell_Sans } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

// The TLE OS voice — the handwritten face used for the wordmark and headings,
// same as the partner portal so the two feel like one product on merge day.
const shantell = Shantell_Sans({
  subsets: ["latin"],
  variable: "--font-shantell",
  display: "swap",
});

/**
 * The flourish script — the flowing hand on the entrance screen.
 *
 * Worth recording why this is here rather than Lora Italic, which is what TLE
 * Branding 3 names as supporting text. James's two reference images both use
 * a true monoline signature script ("Welcome" on his mock-up, "Watch Online
 * Now" on the HomeBuy piece), and having pointed out that the guidelines have
 * no script face, he confirmed he wants that look. So: a deliberate,
 * decided-on addition to the brand, not a slip.
 *
 * Allura of the candidates — thin, wide and monoline, which is what both
 * references are. Great Vibes has more calligraphic contrast and Sacramento
 * is more casual; either is a one-word swap here if the flavour is wrong.
 *
 * Used ONLY for a single display word. A script at body size is unreadable,
 * and at any size it is a decoration rather than a typeface.
 */
const allura = Allura({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-script",
  display: "swap",
});

// Columns of figures want a plain grotesque.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TLE OS",
  description: "The Letting Experts — operations overlay (internal preview)",
  // Not for crawlers: this is a private preview behind an access code.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variables MUST live on <html>, not <body>: globals.css composes
    // --font-heading out of them on :root, and a var() referencing a variable
    // declared further down the tree is invalid at computed-value time — every
    // heading silently falls back to system fonts.
    <html
      lang="en"
      className={`${montserrat.variable} ${shantell.variable} ${inter.variable} ${allura.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
