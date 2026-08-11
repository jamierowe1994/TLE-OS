import Link from "next/link";

/**
 * The tenant portal's shell — THE LETTINGS EXPERTS, customer-facing.
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

export const metadata = { title: "The Lettings Experts — My Account" };

const RED = "#e31f36";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    // The heading override matters: the OS gives every h1–h3 the hand face
    // globally, and one handwritten headline would out the portal as the
    // other product. Here, everything is corporate type.
    <div
      className="min-h-screen bg-white font-sans text-[#16181d] [&_h1]:!font-[inherit] [&_h2]:!font-[inherit] [&_h3]:!font-[inherit]"
      style={{ fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}
    >
      {/* ── The masthead: wordmark left, quiet account links right. ── */}
      <header className="border-b border-black/10">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
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
            <Link href="/tenant" className="transition-colors hover:text-black">Home</Link>
            <Link href="/tenant/profile" className="transition-colors hover:text-black">My profile</Link>
            <span className="hidden text-black/30 sm:inline">·</span>
            <span className="hidden text-black/40 sm:inline">Sophie Turner</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16">{children}</main>

      <footer className="border-t border-black/10 bg-[#fafafa]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[11px] text-black/50">
          <span>© The Lettings Experts · thelettingexperts.co.uk</span>
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
