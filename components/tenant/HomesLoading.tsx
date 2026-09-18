/** What Find a home shows while the homes on the market load in. */
export default function HomesLoading({ what = "the homes on the market" }: { what?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <span className="block h-7 w-7 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent-dark" />
      <p className="text-[14px] font-medium text-muted">Loading {what}…</p>
    </div>
  );
}
