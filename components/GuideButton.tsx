"use client";

import LineIcon from "@/components/LineIcon";
import { openGuide } from "@/lib/guide-sheet";

/**
 * "How this works": opens an agent guide as a pop-up over the screen the
 * agent is already on. Styled by the caller, so it can sit as a pill in a row
 * of quick links or as a quiet underlined link beside a button.
 */
/** "How this works" as a small circle with the icon in it (James, 11 Oct 2026:
 *  "it should just be a circle with the icon, rather than having a whole box
 *  that says How it works"), the same on every screen. The words are its
 *  tooltip and its label for a screen reader. */
export const ROUND_HELP =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 bg-card text-muted transition-colors hover:border-ink/40 hover:text-ink";

export default function GuideButton({
  id,
  className,
  children = "How this works",
  icon = true,
}: {
  id: string;
  /** Only for the words-only link (icon={false}); the circle is one look everywhere. */
  className?: string;
  children?: React.ReactNode;
  /** false: the words alone, as a link in a sentence or a list of guides. */
  icon?: boolean;
}) {
  if (icon) {
    return (
      <button type="button" onClick={() => openGuide(id)} className={ROUND_HELP} title="How this works" aria-label="How this works">
        <LineIcon name="help" size={17} />
      </button>
    );
  }
  return (
    <button type="button" onClick={() => openGuide(id)} className={className}>
      {children}
    </button>
  );
}
