"use client";

import Link from "next/link";
import { PRESENT_STYLES, type DeckKind, type PresentStyle } from "@/lib/present";

/**
 * Three looks, side by side, on the showroom deck only.
 *
 * James, 4 Sep: the team are split on the drawn style - "it's not that they're
 * not keen on it, it's just a lot different." An argument about taste that
 * nobody can see the alternatives to is an argument nobody wins, so this puts
 * all three one click apart and lets the room decide.
 *
 * ── Only ever on /present/sample ──────────────────────────────────────────
 *
 * A landlord opening a real deck sees the single look their agent chose, with
 * no controls anywhere. This component is rendered by the sample branch of the
 * page and by nothing else, which is why it carries no permission check: it is
 * not reachable on a real token.
 *
 * ── Links, not state ──────────────────────────────────────────────────────
 *
 * Each is a real href carrying the current kind, so a style can be sent to
 * somebody in a message and it opens on the one being discussed. A React
 * toggle would have made every opinion in the thread ambiguous about which
 * version it was about.
 */
export default function StylePicker({
  kind,
  style,
}: {
  kind: DeckKind;
  style: PresentStyle;
}) {
  return (
    <div
      className="fixed left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full px-1.5 py-1.5"
      style={{
        background: "rgba(255,255,255,0.92)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.13)",
        backdropFilter: "blur(6px)",
      }}
    >
      <span className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
        Style
      </span>
      {PRESENT_STYLES.map((s) => {
        const on = s.id === style;
        return (
          <Link
            key={s.id}
            href={`/present/sample?kind=${kind}&style=${s.id}`}
            title={s.blurb}
            className="rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors"
            style={
              on
                ? { background: "#1a1a1a", color: "#ffffff" }
                : { color: "rgba(0,0,0,0.55)" }
            }
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
