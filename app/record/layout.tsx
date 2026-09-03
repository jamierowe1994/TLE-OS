import type { Metadata } from "next";

/**
 * The recorder's own shell: one thing on the screen.
 *
 * Deliberately outside the OS chrome. An agent who arrived from the nudge in
 * their inbox wants a camera, not a sidebar, and on a phone the sidebar
 * would take the height the recorder needs. The page links back to the
 * appraisal when it is done.
 */
export const metadata: Metadata = {
  title: "Record your welcome — TLE OS",
  robots: { index: false, follow: false, nocache: true },
};

export default function RecordLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-page text-ink antialiased">{children}</div>;
}
