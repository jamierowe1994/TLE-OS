import { Caveat, Figtree } from "next/font/google";

/**
 * The two faces the pre-appraisal brochure adds (James's design canvas,
 * 7 Oct 2026): Figtree for the body, Caveat for the handwritten notes.
 * Loaded here rather than in the root layout so only the brochure pays for
 * them. Headings stay Bricolage, which the root layout already loads.
 */
export const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree", display: "swap" });
export const caveat = Caveat({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-caveat", display: "swap" });
