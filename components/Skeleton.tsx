/**
 * The shape of the board, before the board.
 *
 * Every board used to say "Fetching…" beside a spinner in an empty box, then
 * swap the box for a full table in one frame - the jump James called out on
 * 2 Oct 2026. A skeleton holds the board's own outline while the read is out,
 * so the rows land into space that was already theirs, and the words stay
 * underneath for anybody who reads rather than looks.
 */
export function BoardSkeleton({
  kind = "rows",
  count = 6,
  label,
}: {
  kind?: "rows" | "cards";
  count?: number;
  /** Said once, small, above the shapes - and to a screen reader. */
  label: string;
}) {
  return (
    <div role="status" aria-live="polite" className="skel-board">
      <p className="mb-3 flex items-center gap-2 text-[12px] text-muted">
        <span aria-hidden className="skel-dot" />
        {label}
      </p>
      {kind === "rows" ? (
        <div className="overflow-hidden rounded-[22px] border border-line/50 bg-white">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="skel-row flex items-center gap-4 border-b border-line/40 px-5 py-4 last:border-b-0" style={{ animationDelay: `${i * 70}ms` }}>
              <span className="skel h-9 w-9 shrink-0 rounded-full" />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="skel h-3 rounded-full" style={{ width: `${46 + ((i * 17) % 30)}%` }} />
                <span className="skel h-2.5 rounded-full" style={{ width: `${28 + ((i * 11) % 22)}%` }} />
              </span>
              <span className="skel hidden h-6 w-20 rounded-full sm:block" />
              <span className="skel hidden h-3 w-16 rounded-full md:block" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="skel-row overflow-hidden rounded-[22px] border border-line/50 bg-white" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="skel block aspect-[4/3] w-full rounded-none" />
              <div className="flex flex-col gap-2.5 p-4">
                <span className="skel h-3.5 rounded-full" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
                <span className="skel h-2.5 w-1/3 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
