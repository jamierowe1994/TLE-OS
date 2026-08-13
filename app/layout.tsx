import type { Metadata } from "next";
import { Inter, Lora, Montserrat, Shantell_Sans } from "next/font/google";
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
 * The brand's own flowing face.
 *
 * TLE Branding 3 names four roles: Unitext Bold for titles and subheadings,
 * Unitext for body, and LORA ITALIC for supporting text. Lora italic is the
 * only flowing face in the guidelines, so that is what the customer-facing
 * decks use for a flourish — not a script lifted off a mockup, which would be
 * off-brand however nice it looked.
 *
 * Italic only is loaded, because that is the only way the guidelines use it.
 */
const lora = Lora({
  subsets: ["latin"],
  style: ["italic"],
  variable: "--font-lora",
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
      className={`${montserrat.variable} ${shantell.variable} ${inter.variable} ${lora.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
