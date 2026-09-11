"use client";

import DoodleIcon from "@/components/DoodleIcon";

/**
 * THE LISTING'S STATE, DRAWN THE SAME WAY EVERYWHERE (James, 11 Sep 2026).
 *
 * The board and the listing drawer share these so a house reads the same
 * on the row and in its record: sage for what is in a good state, blush
 * for a job to do, an outline for the rest - the appraisal file's rule -
 * and one readiness box saying where the listing is and the one move.
 */

/* Sage, the same two values the appraisal screens use. */
export const SAGE_INK = "#63614a";
export const SAGE_WASH = "#f4f3ec";

export type Tone = "good" | "accent" | "neutral";

/** A state pill: sage for good, blush for a job to do, outlined for the rest. */
export function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  if (tone === "good") {
    return (
      <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: SAGE_WASH, color: SAGE_INK }}>
        {children}
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        tone === "accent" ? "bg-accent-soft text-accent-dark" : "border border-line/60 text-muted"
      }`}
    >
      {children}
    </span>
  );
}

/** What the state pill says for a listing. Defined once so no two screens disagree. */
export function statusOf(l: { letAgreed: boolean; publicationStatus: string | null }): { label: string; tone: Tone } {
  if (l.letAgreed) return { label: "Let agreed", tone: "neutral" };
  if (l.publicationStatus === "published") return { label: "Available", tone: "good" };
  return { label: "Draft", tone: "accent" };
}

export interface ReadinessState {
  tone: Tone;
  icon: string;
  title: string;
  sub: string;
  action: string;
  missing: string[];
}

/**
 * WHERE THE LISTING IS, in one line - the thing an agent scans the board for.
 *
 * Derived from the record, never typed: a draft missing photographs or an
 * EPC needs attention before it can go live; a draft with both is ready to
 * publish; a published listing is live, and says so if it went live short
 * of something; let agreed is its own state. The words name what is missing
 * so the next move is on the row.
 */
export function readiness(l: { letAgreed: boolean; publicationStatus: string | null; imageCount: number; epcExpiry: string | null }): ReadinessState {
  const missing: string[] = [];
  if (l.imageCount === 0) missing.push("photos");
  if (l.epcExpiry == null) missing.push("EPC");
  const list = missing.join(" and ");
  if (l.letAgreed) {
    return { tone: "neutral", icon: "key", title: "Let agreed", sub: "Under offer to a tenant.", action: "View listing", missing };
  }
  if (l.publicationStatus === "published") {
    return missing.length
      ? { tone: "accent", icon: "info", title: "Live, needs attention", sub: `Live without ${list}.`, action: "Open listing", missing }
      : { tone: "good", icon: "checklist", title: "Live", sub: "On the portals, all in order.", action: "Open listing", missing };
  }
  return missing.length
    ? { tone: "accent", icon: "info", title: "Needs attention", sub: `Add ${list} to publish.`, action: "Continue setup", missing }
    : { tone: "good", icon: "checklist", title: "Ready to publish", sub: "All required info looks good.", action: "Open listing", missing };
}

/** The readiness box: the state, why, and (where there is room) the one move. */
export function Readiness({
  r,
  compact,
  onAction,
}: {
  r: ReadinessState;
  /** No button - a tile, or anywhere the box is already the whole width. */
  compact?: boolean;
  /** Makes the move a real button. Without it the words are plain (the row around them is the link). */
  onAction?: () => void;
}) {
  const wash = r.tone === "good" ? { background: SAGE_WASH } : r.tone === "accent" ? { background: "var(--accent-soft)" } : { background: "#f6f6f4" };
  const ink = r.tone === "good" ? SAGE_INK : r.tone === "accent" ? "var(--accent-dark)" : "var(--muted)";
  const button = `shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-[11.5px] font-semibold ${
    r.tone === "accent" ? "bg-accent-dark text-white" : "border border-line/60 bg-white"
  }`;
  return (
    <span className="flex min-w-0 items-center gap-3 rounded-2xl px-3.5 py-3" style={wash}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/85" style={{ color: ink }}>
        <DoodleIcon name={r.icon} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold">{r.title}</span>
        <span className="line-clamp-2 text-[11px] leading-snug text-muted">{r.sub}</span>
      </span>
      {!compact &&
        (onAction ? (
          <button type="button" onClick={onAction} className={`inline-flex ${button}`}>
            {r.action} <span aria-hidden>›</span>
          </button>
        ) : (
          <span className={`hidden 2xl:inline-flex ${button}`}>
            {r.action} <span aria-hidden>›</span>
          </span>
        ))}
    </span>
  );
}
