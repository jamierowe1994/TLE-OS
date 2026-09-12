import Link from "next/link";
import TenantSignOut from "@/components/TenantSignOut";
import { currentTenant } from "@/lib/tenant-account";

/**
 * The shell for the tenant pages that need no sign-in: the passport, sign-in,
 * the link landing, the sample and the apply form. The portal itself has
 * its own shell with a sidebar, in the (portal) group.
 *
 * Deliberately NOT the OS: this is the company's official red, clean type,
 * and no illustrations — it has to read as thelettingexperts.co.uk's
 * sibling, because that's the only brand a tenant knows. The hand-drawn
 * world can arrive later, once the two surfaces are formally aligned.
 *
 * Everything is hard-coded to the brand red rather than the OS accent
 * tokens on purpose: an agent changing their accent must never repaint a
 * customer's portal.
 */


/* The tenant surface's call-to-action colour (globals.css, data-surface="tenant"). */
const CTA = "var(--accent-dark)";

export default async function TenantPublicLayout({ children }: { children: React.ReactNode }) {
  const me = await currentTenant();
  return (
    // Same type as every other surface since 11 Sep: Manrope headings (the
    // global h1-h5 rule) and Inter body. The old override that flattened the
    // headings existed to keep the OS's handwriting out; there is none now.
    <div className="min-h-screen">
      {/* ── The masthead: wordmark left, quiet account links right. ── */}
      <header className="border-b border-black/10">
        <div className="flex h-16 w-full items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/tenant" className="flex items-center">
            {/* The real logo, not a stand-in. Sized by height so the pin sits
                on the same baseline as the nav; the alt text carries the name
                for anyone the image never reaches. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/tle-logo.png"
              alt="The Letting Experts"
              className="h-11 w-auto"
            />
          </Link>
          <nav className="flex items-center gap-5 text-[12.5px] font-medium text-black/60">
            {me ? (
              <>
                <Link href="/tenant" className="transition-colors hover:text-black">Home</Link>
                <span className="hidden text-black/30 sm:inline">·</span>
                <span className="hidden text-black/40 sm:inline">{me.name}</span>
                <TenantSignOut />
              </>
            ) : (
              <Link href="/tenant/sign-in" className="transition-colors hover:text-black">Sign in</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="w-full pb-16">{children}</main>

      <footer className="border-t border-black/10 bg-[#fafafa]">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11px] text-black/50 sm:px-8 lg:px-12">
          <span>© The Letting Experts · thelettingexperts.co.uk</span>
          <span className="flex gap-4">
            <a href="#" className="hover:text-black">Privacy &amp; your data</a>
            <a href="#" className="hover:text-black">Contact us</a>
            <a href="#" className="hover:text-black">Complaints</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
