import { demoMode } from "@/lib/demo/mode";

/**
 * THE DEMO MARK (lib/demo/mode). On the demo copy every screen carries this,
 * so nobody being shown round, and nobody showing them, can take invented
 * landlords for real ones or the demo for the live system. On the live
 * system DEMO_MODE is not set and this renders nothing.
 *
 * A server component in the root layout: it reads the setting on the server,
 * so there is nothing for a browser to switch off. It never takes a press
 * (pointer-events none), so it cannot sit in the way of a button.
 */
export default function DemoMark() {
  if (!demoMode()) return null;
  return (
    <div
      role="note"
      aria-label="Demo copy: invented data"
      style={{
        position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", zIndex: 2147483000, pointerEvents: "none",
        background: "#56423E", color: "#F5EFE6", font: "600 11px/1 Inter, system-ui, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase",
        padding: "5px 12px 6px", whiteSpace: "nowrap",
      }}
    >
      Demo - Invented Data
    </div>
  );
}
