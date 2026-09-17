"use client";

/** What an admin screen shows when its figures could not be fetched. */
export default function AdminLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-16 text-center" role="alert">
      <p className="hand text-[20px]">Could not load this page</p>
      <p className="mt-2 text-[12.5px] text-muted">The connection dropped before the figures arrived.</p>
      <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white">
        Try again
      </button>
    </div>
  );
}
