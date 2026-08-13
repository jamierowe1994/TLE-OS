import type { Metadata } from "next";

/**
 * The presentation shell — customer-facing, so none of the OS's handwriting.
 *
 * Same rule as the landlord and tenant portals: to a landlord there is one
 * Letting Experts, and it is corporate red and Montserrat, not a drawn
 * wordmark and doodles. The OS's own voice stops at the office door.
 *
 * No chrome at all here on purpose. Every slide is full-viewport and carries
 * its own logo placement; a header bar above them would cost the one line of
 * height that makes the phone layout fit without scrolling.
 */

export const metadata: Metadata = {
  title: "Your market appraisal — The Letting Experts",
  // A private link sent to one person. Nothing about it belongs in an index,
  // and the token is in the URL, which is exactly the thing not to publish.
  robots: { index: false, follow: false, nocache: true },
};

export default function PresentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-[100dvh] bg-white text-[#16181d] antialiased [&_h1]:!font-[inherit] [&_h2]:!font-[inherit] [&_h3]:!font-[inherit]"
      style={{ fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
