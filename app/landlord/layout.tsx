import { Suspense } from "react";
import Link from "next/link";
import PreviewReturnBar from "@/components/PreviewReturnBar";
import LandlordSignOut from "@/components/LandlordSignOut";
import DoodleIcon from "@/components/DoodleIcon";
import FileSearch from "@/components/landlord/FileSearch";
import SideNav from "@/components/landlord/SideNav";
import PhoneShell, { PhoneNavButton } from "@/components/landlord/PhoneShell";
import { currentLandlord, landlordPlaces, landlordProperties } from "@/lib/landlord-account";

/**
 * The landlord portal's shell (James's mock, 11 Sep 2026): light, airy and
 * minimal. A slim sidebar - the real logo with its pin in coral rather than
 * red, then Home, Journey, Documents, Maintenance and Messages, and Log out
 * at the foot - and a top bar with the page search and who is signed in.
 *
 * Home and Journey are pages; Documents, Maintenance and Messages are
 * sections of the home page (components/landlord/SideNav). On a phone the
 * sidebar becomes a row of pills under the top bar.
 *
 * data-surface="landlord" picks the landlord's own mix of the extended
 * palette in globals.css, so an agent's OS accent never reaches this page.
 */

export const metadata = { title: "The Letting Experts — Your property file" };

function Logo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" className={`block w-auto ${className}`} />
  );
}

export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  const me = await currentLandlord();
  const initial = (me?.name ?? "").trim()[0]?.toUpperCase() ?? "";
  /**
   * Whether they have a property let, so the phone's nav can offer Maintenance
   * instead of Journey (SideNav).
   *
   * Read HERE rather than handed down by each page: a page that forgets to
   * pass it gets the wrong nav and nothing says so. It is one read of the
   * managed book, which is cached with its own freshness window and is the
   * same call the portal's own pages make - so on any page that needs the book
   * anyway this costs nothing, and on the others it is a cache hit.
   */
  const letHere = me ? await landlordProperties(me).then((p) => p.length > 0).catch(() => false) : false;
  /**
   * Every property they have with us, for the menu's chooser.
   *
   * Read here for the same reason letHere is: the shell draws on every page,
   * and a page that forgot to pass it would silently lose the chooser. It is
   * the cheap read - names off the two caches the portal is already holding -
   * rather than landlordJourneys, which looks up presentations and signed
   * terms per appraisal and has no business running for a menu.
   *
   * A layout cannot read searchParams in the App Router, so it does not try
   * to say which one is current: PlacePicker takes that off the address bar
   * itself and falls back to the first in the list, which is the same one
   * loadLandlordHome picks when there is no ?p=.
   */
  const places = me ? await landlordPlaces(me).catch(() => []) : [];
  return (
    <PhoneShell
      signedIn={Boolean(me)}
      letHere={letHere}
      places={places}
      signOut={<LandlordSignOut variant="drawer" />}
    >
    <div data-surface="landlord" id="top" className="min-h-screen bg-white text-ink lg:flex">
      {/* ── the sidebar, from lg up ── */}
      <aside className="sticky top-0 hidden h-screen w-[212px] shrink-0 flex-col border-r border-line/50 px-4 py-7 lg:flex">
        <Link href="/landlord" className="px-2" aria-label="The Letting Experts, home" data-tle-logo>
          <Logo className="h-11" />
        </Link>
        {/* Suspense: the nav reads the address to light the page it is on. */}
        <Suspense fallback={<div className="mt-10" />}>
          <SideNav variant="side" letHere={letHere} />
        </Suspense>
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
        {/* On a phone: the logo and the three lines, and that is the whole bar.
            James, 15 Sep 2026 - "the Letting Experts in the top left and a
            navigation button in the top right ... allowing us to bring
            everything up a little bit further." Search and the avatar are on
            from sm up; My details is reachable from the drawer. */}
        <header className="flex items-center gap-4 px-5 pt-5 sm:px-10">
          <Link href="/landlord" className="shrink-0 lg:hidden" aria-label="The Letting Experts, home" data-tle-logo>
            <Logo className="h-9" />
          </Link>
          <div className="ml-auto sm:hidden">
            <PhoneNavButton />
          </div>
          <div className="hidden min-w-0 max-w-xl flex-1 sm:block">
            <FileSearch />
          </div>
          <div className="ml-auto hidden shrink-0 items-center gap-3 sm:flex">
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
        {/* The pills are a tablet thing now - a phone has the drawer. */}
        <nav className="hidden gap-2 overflow-x-auto px-5 pt-4 sm:flex sm:px-10 lg:hidden">
          <Suspense fallback={null}>
            <SideNav variant="pills" letHere={letHere} />
          </Suspense>
          {/* Not on a phone: three sections have to fit on one screen, and a
              fourth chip put them over the edge. Signing out is on My details,
              which the avatar in the header opens. */}
          {me && (
            <span className="hidden shrink-0 sm:inline">
              <LandlordSignOut />
            </span>
          )}
        </nav>

        {/* No max width and no centring (James, 11 Sep): the boxes scale with
            the window like the search bar does, and everything starts on the
            search bar's left edge - the same px-5 / sm:px-10 as the header. */}
        <main className="px-5 pb-12 pt-8 sm:px-10">{children}</main>

        <footer>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11.5px] text-muted sm:px-10">
            <span>The Letting Experts · thelettingexperts.co.uk</span>
            {/* The real pages on thelettingexperts.co.uk, checked live 13 Sep 2026.
              They were href="#" - three dead links in a customer footer, one of
              them the privacy notice. */}
            <span className="flex gap-4">
              <a href="https://thelettingexperts.co.uk/privacy-policy" target="_blank" rel="noreferrer" className="transition-colors hover:text-ink">Privacy and your data</a>
              <a href="https://thelettingexperts.co.uk/contact-us" target="_blank" rel="noreferrer" className="transition-colors hover:text-ink">Contact us</a>
              <a href="https://thelettingexperts.co.uk/complaints-handling" target="_blank" rel="noreferrer" className="transition-colors hover:text-ink">Complaints</a>
            </span>
          </div>
        </footer>
      </div>
      {/* Only ever renders with ?from=admin — a real customer never sees it. */}
      <PreviewReturnBar />
    </div>
    </PhoneShell>
  );
}
