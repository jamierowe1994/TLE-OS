import type { Metadata } from "next";
import { Inter, Montserrat, Shantell_Sans } from "next/font/google";
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

// Columns of figures want a plain grotesque.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TLE OS",
  description: "The Lettings Experts — operations overlay (internal preview)",
  // Not for crawlers: this is a private preview behind an access code.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${montserrat.variable} ${shantell.variable} ${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
