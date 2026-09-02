import Link from "next/link";
import PreviewReturnBar from "@/components/PreviewReturnBar";
import LandlordSignOut from "@/components/LandlordSignOut";
import { currentLandlord } from "@/lib/landlord-account";

/**
 * The landlord portal's shell: The Letting Experts, not TLE OS. Montserrat,
 * the red, the real logo, and a footer a customer expects.
 *
 * The nav reads the session. Signed in, it carries the landlord's own name
 * and a way out; signed out, a way in. The demo page (/landlord/demo) lives
 * under this shell too and shows "Sign in" in the corner, which is the truth
 * of it.
 */

export const metadata = { title: "The Letting Experts — Landlord Account" };

export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  const me = await currentLandlord();
  return (
    <div
      className="min-h-screen bg-white font-sans text-[#16181d] [&_h1]:!font-[inherit] [&_h2]:!font-[inherit] [&_h3]:!font-[inherit]"
      style={{ fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}
    >
      <header className="border-b border-black/10">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/landlord" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/tle-logo.png" alt="The Letting Experts" className="h-11 w-auto" />
          </Link>
          <nav className="flex items-center gap-5 text-[12.5px] font-medium text-black/60">
            {me ? (
              <>
                <Link href="/landlord" className="transition-colors hover:text-black">My properties</Link>
                <Link href="/landlord/profile" className="transition-colors hover:text-black">My details</Link>
                <span className="hidden text-black/30 sm:inline">·</span>
                <span className="hidden text-black/40 sm:inline">{me.name}</span>
                <LandlordSignOut />
              </>
            ) : (
              <Link href="/landlord/sign-in" className="transition-colors hover:text-black">Sign in</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16">{children}</main>

      <footer className="border-t border-black/10 bg-[#fafafa]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11px] text-black/50">
          <span>© The Letting Experts · thelettingexperts.co.uk</span>
          <span className="flex gap-4">
            <a href="#" className="hover:text-black">Privacy &amp; your data</a>
            <a href="#" className="hover:text-black">Contact us</a>
            <a href="#" className="hover:text-black">Complaints</a>
          </span>
        </div>
      </footer>
      {/* Only ever renders with ?from=admin — a real customer never sees it. */}
      <PreviewReturnBar />
    </div>
  );
}
