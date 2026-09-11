import Link from "next/link";
import PreviewReturnBar from "@/components/PreviewReturnBar";
import LandlordSignOut from "@/components/LandlordSignOut";
import DoodleIcon from "@/components/DoodleIcon";
import FileSearch from "@/components/landlord/FileSearch";
import { currentLandlord } from "@/lib/landlord-account";

/**
 * The landlord portal's shell (James's mock, 11 Sep 2026): light, airy and
 * minimal. A slim sidebar - the real logo with its pin in coral rather than
 * red, then Home, Journey, Documents, Maintenance and Messages, and Log out
 * at the foot - and a top bar with the page search and who is signed in.
 *
 * The sidebar's sections are anchors on the one home page (#journey and so
 * on); there are no separate pages behind them yet, and a link to nowhere
 * would be worse than a scroll. On a phone the sidebar becomes a row of
 * pills under the top bar.
 *
 * data-surface="landlord" picks the landlord's own mix of the extended
 * palette in globals.css, so an agent's OS accent never reaches this page.
 */

export const metadata = { title: "The Letting Experts — Your property file" };

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "#top", label: "Home", icon: "home" },
  { href: "#journey", label: "Journey", icon: "trend-up" },
  { href: "#documents", label: "Documents", icon: "doc" },
  { href: "#maintenance", label: "Maintenance", icon: "setting" },
  { href: "#messages", label: "Messages", icon: "message" },
];

function Logo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" className={`block w-auto ${className}`} />
  );
}

export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  const me = await currentLandlord();
  const initial = (me?.name ?? "").trim()[0]?.toUpperCase() ?? "";
  return (
    <div data-surface="landlord" id="top" className="min-h-screen bg-white text-ink lg:flex">
      {/* ── the sidebar, from lg up ── */}
      <aside className="sticky top-0 hidden h-screen w-[212px] shrink-0 flex-col border-r border-line/50 px-4 py-7 lg:flex">
        <Link href="/landlord" className="px-2" aria-label="The Letting Experts, home">
          <Logo className="h-11" />
        </Link>
        <nav className="mt-10 space-y-1">
          {NAV.map((n, i) => (
            <a
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
                i === 0 ? "bg-accent-soft font-semibold text-ink" : "text-muted hover:bg-accent-soft/50 hover:text-ink"
              }`}
            >
              <DoodleIcon name={n.icon} size={17} />
              {n.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto border-t border-line/50 pt-4">
          {me ? (
            <LandlordSignOut variant="nav" />
          ) : (
            <Link href="/landlord/sign-in" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] text-muted hover:bg-accent-soft/50 hover:text-ink">
              <DoodleIcon name="user" size={17} />
              Sign in
            </Link>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* ── the top bar ── */}
        <header className="flex items-center gap-4 px-5 pt-5 sm:px-10">
          <Link href="/landlord" className="shrink-0 lg:hidden" aria-label="The Letting Experts, home">
            <Logo className="h-9" />
          </Link>
          <div className="min-w-0 max-w-xl flex-1">
            <FileSearch />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {me ? (
              <Link href="/landlord/profile" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-accent-soft/50" title="My details">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent-dark">
                  {initial}
                </span>
                <span className="hidden text-[13.5px] font-semibold sm:inline">{me.name}</span>
              </Link>
            ) : (
              <Link href="/landlord/sign-in" className="rounded-full border border-line/70 px-4 py-2 text-[12.5px] text-muted transition-colors hover:border-ink/40 hover:text-ink">
                Sign in
              </Link>
            )}
          </div>
        </header>

        {/* ── the sections as pills, on a phone or tablet ── */}
        <nav className="flex gap-2 overflow-x-auto px-5 pt-4 sm:px-10 lg:hidden">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="flex shrink-0 items-center gap-2 rounded-full border border-line/60 px-3.5 py-1.5 text-[12.5px] text-muted">
              <DoodleIcon name={n.icon} size={14} />
              {n.label}
            </a>
          ))}
          {me && (
            <span className="shrink-0">
              <LandlordSignOut />
            </span>
          )}
        </nav>

        <main className="mx-auto max-w-[1280px] px-5 pb-12 pt-8 sm:px-10">{children}</main>

        <footer>
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11.5px] text-muted sm:px-10">
            <span>The Letting Experts · thelettingexperts.co.uk</span>
            <span className="flex gap-4">
              <a href="#" className="transition-colors hover:text-ink">Privacy and your data</a>
              <a href="#" className="transition-colors hover:text-ink">Contact us</a>
              <a href="#" className="transition-colors hover:text-ink">Complaints</a>
            </span>
          </div>
        </footer>
      </div>
      {/* Only ever renders with ?from=admin — a real customer never sees it. */}
      <PreviewReturnBar />
    </div>
  );
}
