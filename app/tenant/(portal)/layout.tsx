import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import FileSearch from "@/components/landlord/FileSearch";
import SideNav from "@/components/tenant/SideNav";
import TenantSignOut from "@/components/TenantSignOut";
import { currentTenant } from "@/lib/tenant-account";

/**
 * The tenant portal's shell, following the landlord's (James, 12 Sep 2026:
 * "follow what we did with the landlord one, very similarly"). A slim
 * sidebar - the logo, then Home, My tenancy, Documents, Maintenance,
 * Payments, Messages, and Log out at the foot - and a top bar with the page
 * search, the bell and who is signed in. On a phone the sidebar becomes a
 * row of pills under the top bar.
 *
 * This is the door too: everything in this group is a signed-in tenant's
 * own, so the check is made once here.
 */
function Logo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/tle-logo.png" alt="The Letting Experts" className={`block w-auto ${className}`} />
  );
}

export default async function TenantPortalLayout({ children }: { children: React.ReactNode }) {
  const me = await currentTenant();
  if (!me) redirect("/tenant/sign-in");
  const initial = me.name.trim()[0]?.toUpperCase() ?? "";

  return (
    <div id="top" className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[212px] shrink-0 flex-col border-r border-line/50 px-4 py-7 lg:flex">
        <Link href="/tenant" className="px-2" aria-label="The Letting Experts, home">
          <Logo className="h-11" />
        </Link>
        <Suspense fallback={<div className="mt-10" />}>
          <SideNav variant="side" />
        </Suspense>
        <div className="mt-auto border-t border-line/50 pt-4">
          <TenantSignOut />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-4 px-5 pt-5 sm:px-10">
          <Link href="/tenant" className="shrink-0 lg:hidden" aria-label="The Letting Experts, home">
            <Logo className="h-9" />
          </Link>
          <div className="min-w-0 max-w-xl flex-1">
            <FileSearch placeholder="Search your tenancy, documents or anything" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link href="/tenant/messages" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-panel text-muted transition-colors hover:text-ink" aria-label="Notifications">
              <DoodleIcon name="bell" size={17} />
            </Link>
            <Link href="/tenant/profile" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-accent-soft/50" title="My details">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent-dark">{initial}</span>
              <span className="hidden text-[13.5px] font-semibold sm:inline">{me.name}</span>
            </Link>
          </div>
        </header>

        <nav className="flex gap-2 overflow-x-auto px-5 pt-4 sm:px-10 lg:hidden">
          <Suspense fallback={null}>
            <SideNav variant="pills" />
          </Suspense>
        </nav>

        <main className="px-5 pb-12 pt-8 sm:px-10">{children}</main>

        <footer>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11.5px] text-muted sm:px-10">
            <span>The Letting Experts · thelettingexperts.co.uk</span>
            <span className="flex gap-4">
              <a href="#" className="transition-colors hover:text-ink">Privacy and your data</a>
              <a href="#" className="transition-colors hover:text-ink">Contact us</a>
              <a href="#" className="transition-colors hover:text-ink">Complaints</a>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
