import type { StatSource } from "@/lib/business/types";
import { formatDateShort } from "@/lib/business/format";

// Small badge tagging where a figure came from. Every stat in the UI carries
// one so live and hand-entered figures can be told apart at a glance.
// Hidden in presentation mode via `body.presenting .source-badge` (globals.css).
//
// ── Why there is no "snapshot" any more ───────────────────────────────────
//
// There used to be one, for figures typed out of Susan's dashboard on 11 Jul
// 2026 — and it was ALSO what this file fell back to for an unrecognised
// source. That made it the worst possible default: a figure arriving without a
// source, or with one this file had not been taught, rendered as a stale July
// capture. Susan saw a wall of amber SNAPSHOT badges over figures that were
// live and correct, which is exactly as misleading as the reverse.
//
// The fallback is now "unavailable" — red, loud, and obviously a fault. An
// unknown source IS a bug, and it should look like one rather than quietly
// borrowing the appearance of a real (if old) figure.

const STYLES: Record<
  StatSource,
  { label: string; className: string }
> = {
  "live-rex": {
    label: "LIVE",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  "live-meta": {
    label: "LIVE",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  "live-propoly": {
    label: "LIVE",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  "live-teg": {
    label: "LIVE",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  "live-payprop": {
    label: "LIVE",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  "live-ghl": {
    label: "LIVE",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  manual: {
    label: "MANUAL",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  /* Not a figure. The note says where the figure used to come from, so a dash
     reads as "wire this up" rather than as "zero". */
  unavailable: {
    label: "NO SOURCE",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  derived: {
    label: "DERIVED",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

const DOT: Record<StatSource, string> = {
  "live-rex": "#22c55e",
  "live-meta": "#22c55e",
  "live-propoly": "#22c55e",
  "live-teg": "#22c55e",
  "live-ghl": "#22c55e",
  "live-payprop": "#22c55e",
  // Anything not coming from a live system reads amber: it's a to-do, not a
  // neutral fact, and grey let snapshots hide in plain sight.
  manual: "#f59e0b",
  /* Slate, NOT amber. Amber is a to-do; a derived figure is not one — it is
     worked out here FROM live figures, so it is exactly as trustworthy as the
     numbers behind it. Painting it amber turned every ratio on the Income tab
     (GCI per agent, net per agent, the TLE split) into a warning about itself
     and made the whole tab read as stale. */
  derived: "#64748b",
  /* Red, not amber. Amber is "not live yet"; this is "nothing reached it at
     all", and the two need telling apart at a glance or the gaps disappear
     into the to-do pile. */
  unavailable: "#e11d48",
};

export default function SourceBadge({
  source,
  note,
  asOf,
  compact = false,
}: {
  source: StatSource;
  note?: string;
  asOf?: string;
  /** Render just a colour dot (full detail in the tooltip) — for dense cards. */
  compact?: boolean;
}) {
  const style = STYLES[source] ?? STYLES.unavailable;
  let label = style.label;
  /* Date the badge when we have one — "LIVE · 28 Aug" answers "how live?"
     without a hover, which is the question a dated figure always invites. */
  if (asOf) {
    const short = formatDateShort(asOf);
    if (short) label = `${style.label} · ${short}`;
  }
  const tooltip = note ?? label;

  if (compact) {
    return (
      <span
        className="source-badge inline-block h-2 w-2 rounded-full"
        style={{ background: DOT[source] ?? DOT.unavailable }}
        title={`${label}${note ? ` — ${note}` : ""}`}
        aria-label={label}
      />
    );
  }

  return (
    <span
      className={`source-badge inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${style.className}`}
      title={tooltip}
    >
      {label}
    </span>
  );
}
