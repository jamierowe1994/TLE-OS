import { Suspense } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import FileSearch from "@/components/landlord/FileSearch";
import SideNav from "@/components/tenant/SideNav";
import TenantSignOut from "@/components/TenantSignOut";
import TenantPhoneShell from "@/components/tenant/TenantPhoneShell";
import { PhoneNavButton } from "@/components/landlord/PhoneShell";
import { locksFor, type TenantStageKey } from "@/lib/tenant-journey";

/**
 * The tenant portal's shell, following the landlord's (James, 12 Sep 2026:
 * "follow what we did with the landlord one, very similarly"). A slim
 * sidebar - the logo, then Home, My tenancy, Documents, Maintenance,
 * Payments, Messages, and Log out at the foot - and a top bar with the page
 * search, the bell and who is signed in. On a phone the sidebar becomes a
 * row of pills under the top bar.
 *
 * Shared by the real portal and the sample at /tenant/demo: the sample
 * passes its tenant's name and shows "Sample" where the real one signs out.
 *
 * The sidebar follows the journey: before an offer is accepted only Home,
 * Documents and Messages are open; the tenancy and payments open with the
 * deal, maintenance with the keys (James, 12 Sep 2026).
 *
 * ON A PHONE it is the landlord's phone portal, one for one (James, 18 Sep
 * 2026): the logo top left and the three lines top right, and that is the
 * whole bar; the pages live in the drawer the page slides off to reveal
 * (TenantPhoneShell). The pill row is a tablet thing now, as it is there.
 */
function Logo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" className={`block w-auto ${className}`} />
  );
}

export default function PortalShell({ name, base, stage, sample = false, children }: { name: string; base: string; stage: TenantStageKey; sample?: boolean; children: React.ReactNode }) {
  const initial = name.trim()[0]?.toUpperCase() ?? "";
  /* Which sections are open follows where they are (lib/tenant-journey). */
  const locks = locksFor(stage);

  return (
    <Suspense fallback={null}>
    <TenantPhoneShell signedIn={!sample} locks={locks}>
    <div id="top" className="min-h-screen bg-white lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[212px] shrink-0 flex-col border-r border-line/50 px-4 py-7 lg:flex">
        {/* data-tle-logo is the harness's handle on the sample - see
            components/tenant/StageHarness. On the real portal nothing listens
            and this goes home as it always did. */}
        <Link href={base} className="px-2" aria-label="The Letting Experts, home" data-tle-logo>
          <Logo className="h-11" />
        </Link>
        <Suspense fallback={<div className="mt-10" />}>
          <SideNav variant="side" locks={locks} />
        </Suspense>
        <div className="mt-auto border-t border-line/50 pt-4 text-[13.5px] text-muted">
          {sample ? <span className="px-3">A sample tenant</span> : <span className="px-3"><TenantSignOut /></span>}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-4 px-5 pt-5 sm:px-10">
          <Link href={base} className="shrink-0 lg:hidden" aria-label="The Letting Experts, home" data-tle-logo>
            <Logo className="h-9" />
          </Link>
          <div className="ml-auto sm:hidden">
            <PhoneNavButton />
          </div>
          <div className="hidden min-w-0 max-w-xl flex-1 sm:block">
            <FileSearch placeholder="Search your tenancy, documents or anything" />
          </div>
          <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
            <Link href={`${base}/messages`} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-panel text-muted transition-colors hover:text-ink" aria-label="Notifications">
              <DoodleIcon name="bell" size={17} />
            </Link>
            <Link href={sample ? base : "/tenant/profile"} className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-accent-soft/50" title="My details">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent-dark">{initial}</span>
              <span className="hidden text-[13.5px] font-semibold sm:inline">{name}</span>
            </Link>
          </div>
        </header>

        <nav className="hidden gap-2 overflow-x-auto px-5 pt-4 sm:flex sm:px-10 lg:hidden">
          <Suspense fallback={null}>
            <SideNav variant="pills" locks={locks} />
          </Suspense>
        </nav>

        <main className="px-5 pb-12 pt-8 sm:px-10">{children}</main>

        <footer>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11.5px] text-muted sm:px-10">
            <span>The Letting Experts · thelettingexperts.co.uk</span>
            {/* The real pages on thelettingexperts.co.uk, checked live 13 Sep
                2026. They were href="#". */}
            <span className="flex gap-4">
              <a href="https://thelettingexperts.co.uk/privacy-policy" target="_blank" rel="noreferrer" className="transition-colors hover:text-ink">Privacy and your data</a>
              <a href="https://thelettingexperts.co.uk/contact-us" target="_blank" rel="noreferrer" className="transition-colors hover:text-ink">Contact us</a>
              <a href="https://thelettingexperts.co.uk/complaints-handling" target="_blank" rel="noreferrer" className="transition-colors hover:text-ink">Complaints</a>
            </span>
          </div>
        </footer>
      </div>
    </div>
    </TenantPhoneShell>
    </Suspense>
  );
}
