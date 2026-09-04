import DealFeed from "@/components/DealFeed";

/**
 * /feed - the activity log in its own small window.
 *
 * No sidebar, no header, no dog: this is the pop-out Kirstie leaves to one
 * side of her screen, and everything on it is a row. Each row opens the file
 * in the main window rather than in here, so the small one stays put. Signed
 * in the same as everything else; the middleware sends a stranger to sign in.
 */

export const dynamic = "force-dynamic";

export default function FeedPopout() {
  return (
    <main className="min-h-screen bg-page px-4 py-4 text-ink">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-[15px] font-semibold">What moved</h1>
        <a href="/pre-tenancy" target="tle-os" className="text-[11px] text-muted underline-offset-2 hover:underline">
          Open the board
        </a>
      </div>
      <DealFeed desktop popout />
    </main>
  );
}
