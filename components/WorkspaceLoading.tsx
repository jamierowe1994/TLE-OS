"use client";

import { useEffect, useState } from "react";

/**
 * What a workspace page shows while it is fetching: centred in the space
 * beside the rail, not at the top of it.
 *
 * James, 12 Sep 2026: "the navigation bar should stay persistent. When we
 * click things like the board, it should all stay in place, and then it will
 * say Loading. We'll put it in the middle of the screen ... whatever the
 * white space is after the navigation bar, we want to put it in the centre
 * of that."
 *
 * So the rail stays, the page's own header is not drawn yet, and this fills
 * the column: the drawing that moves, the word, and (for a page that is
 * genuinely slow) one line saying why. After eight seconds a second line
 * appears rather than replaces - the first stays true, this adds to it.
 */
export default function WorkspaceLoading({
  label = "Loading",
  note,
  slowNote,
  height = "min-h-[calc(100vh-176px)]",
}: {
  label?: string;
  /** The block's height class, for a page whose own header is already drawn above. */
  height?: string;
  /** One true line about what is being waited on, for the pages that are slow. */
  note?: string;
  /** Appears after eight seconds, for a wait that has stopped being ordinary. */
  slowNote?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!slowNote) return;
    const t = setTimeout(() => setSlow(true), 8_000);
    return () => clearTimeout(t);
  }, [slowNote]);

  return (
    /* The height is the window less the shell's own top and bottom padding,
       so the centre of this is the centre of the white space. */
    <div className={`flex ${height} flex-col items-center justify-center px-6 text-center`} role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/illustrations/loading.gif" alt="" className="art h-auto w-[min(220px,50vw)] select-none motion-reduce:hidden" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/illustrations/notioly/looking-for-something.svg" alt="" className="art hidden h-auto w-[min(220px,50vw)] select-none motion-reduce:block" draggable={false} />
      <p className="hand mt-5 text-[17px] text-ink">{label}</p>
      {note && <p className="mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-muted">{note}</p>}
      {slowNote && (
        <p className={`mt-2 max-w-[380px] text-[12px] leading-relaxed text-muted transition-opacity duration-500 ${slow ? "opacity-100" : "opacity-0"}`}>
          {slowNote}
        </p>
      )}
    </div>
  );
}
