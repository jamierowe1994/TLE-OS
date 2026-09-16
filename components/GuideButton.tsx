"use client";

import DoodleIcon from "@/components/DoodleIcon";
import { openGuide } from "@/lib/guide-sheet";

/**
 * "How this works": opens an agent guide as a pop-up over the screen the
 * agent is already on. Styled by the caller, so it can sit as a pill in a row
 * of quick links or as a quiet underlined link beside a button.
 */
export default function GuideButton({
  id,
  className,
  children = "How this works",
  icon = true,
}: {
  id: string;
  className?: string;
  children?: React.ReactNode;
  icon?: boolean;
}) {
  return (
    <button type="button" onClick={() => openGuide(id)} className={className}>
      {icon ? <DoodleIcon name="info" size={13} className="text-accent-dark" /> : null}
      {children}
    </button>
  );
}
