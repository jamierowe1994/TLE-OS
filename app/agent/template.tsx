/**
 * Every page of the app rises and settles in (James, 3 Oct 2026: "nothing
 * should ever jerk into the next page"). A template, unlike the layout, is
 * made afresh on each navigation, so the entrance plays every time. The
 * movement is m-page in m.css; the frame (bar, sheets) sits in the layout and
 * stays still.
 */
export default function AgentTemplate({ children }: { children: React.ReactNode }) {
  return <div className="m-page">{children}</div>;
}
