import Link from "next/link";
import PreviewReturnBar from "@/components/PreviewReturnBar";
import LandlordSignOut from "@/components/LandlordSignOut";
import { currentLandlord } from "@/lib/landlord-account";

/**
 * The landlord portal's shell, in the OS's own hand.
 *
 * ── Why it looks like the OS and not like the website ─────────────────────
 *
 * James, 2 Sep: "we've got this flowy, handwritten illustration-style web
 * OS, but obviously the actual Lettings Experts website doesn't represent
 * that... build the landlord portal in the style of the OS and then see what
 * Susan thinks." So this is the OS's system, not an imitation of it: the
 * same tokens (page, panel, line, ink, accent), the same Shantell headings,
 * the same outlined panels on eggshell, the same doodle icons. If Susan
 * wants the website's red and Montserrat instead, the accent is one
 * attribute (data-accent="red") and the headings one rule; nothing here
 * would need redrawing.
 *
 * The wordmark is the pin off the real logo beside "The Letting Experts" in
 * the OS's handwriting - the same trick MarketingShell uses, one logo file on
 * disk cropped with CSS, so there is only ever one to replace.
 */

export const metadata = { title: "The Letting Experts — Your property file" };

const pill = "rounded-full border border-line/80 px-3.5 py-1.5 text-[12.5px] transition-colors hover:border-ink/40 hover:text-ink";

export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  const me = await currentLandlord();
  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="border-b border-line/70 bg-panel">
        {/* Wraps on a phone: the wordmark keeps its line and the pills drop
            underneath, rather than three tall pills squeezing it into a
            three-line stack. */}
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
          <Link href="/landlord" className="flex items-center gap-2.5" aria-label="The Letting Experts">
            {/* 271/465 of the artwork is the pin. */}
            <span
              className="block h-8 w-[19px] shrink-0"
              style={{
                backgroundImage: "url(/brand/tle-logo.png)",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "left center",
                backgroundSize: "auto 100%",
              }}
            />
            <span className="hand whitespace-nowrap text-[19px] leading-none tracking-[0]">The Letting Experts</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-muted">
            {me ? (
              <>
                <Link href="/landlord" className={pill}>My property</Link>
                <Link href="/landlord/profile" className={pill}>My details</Link>
                <span className="hidden pl-2 text-[12.5px] sm:inline">{me.name}</span>
                <LandlordSignOut />
              </>
            ) : (
              <Link href="/landlord/sign-in" className={pill}>Sign in</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16">{children}</main>

      <footer className="border-t border-line/70 bg-panel">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11.5px] text-muted">
          <span>The Letting Experts · thelettingexperts.co.uk</span>
          <span className="flex gap-4">
            <a href="#" className="transition-colors hover:text-ink">Privacy and your data</a>
            <a href="#" className="transition-colors hover:text-ink">Contact us</a>
            <a href="#" className="transition-colors hover:text-ink">Complaints</a>
          </span>
        </div>
      </footer>
      {/* Only ever renders with ?from=admin — a real customer never sees it. */}
      <PreviewReturnBar />
    </div>
  );
}
