import type { Metadata } from "next";
import { Inter, Lora, Montserrat, Ms_Madi, Shantell_Sans } from "next/font/google";
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
 * The face James actually wants is Brittany Signature, which is commercial
 * and whose free download is personal-use only — that does not cover a
 * business emailing this to landlords, so it is not an option.
 *
 * MS MADI is the stand-in, picked by rendering eight free scripts against
 * Brittany rather than by name. It is the only one with Brittany's actual
 * character: a modern MONOLINE hand with a natural, slightly bouncy
 * baseline. Sacramento is monoline but rounder and more retro; Aguafina and
 * Rouge Script have brush contrast; Herr Von Muellerhoff and Meow Script are
 * formal copperplate. Ms Madi is under the SIL Open Font License, so it is
 * free for commercial use with no attribution required.
 *
 * Used ONLY for a single display word. A script at body size is unreadable,
 * and at any size it is a decoration rather than a typeface.
 */
const msMadi = Ms_Madi({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-script",
  display: "swap",
});

/**
 * The display serif for the customer-facing decks.
 *
 * Lora, which is what TLE Branding 3 names and what marketing confirmed when
 * James asked. The guidelines list it as supporting text; both of James's
 * layout references set the big headline in a serif of exactly this
 * character, so it earns the display role on the presentation as well.
 *
 * Regular and italic — the headline pairs an upright serif with one word
 * dropped into the script, and the italic carries the quieter asides.
 */
const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
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
      className={`${montserrat.variable} ${shantell.variable} ${inter.variable} ${msMadi.variable} ${lora.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
