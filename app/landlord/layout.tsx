import Link from "next/link";
import PreviewReturnBar from "@/components/PreviewReturnBar";

/**
 * The landlord portal's shell — the same official red as the tenant side,
 * because to a customer there is exactly one Letting Experts. Corporate
 * type, no illustrations, the OS's handwriting suppressed.
 */

export const metadata = { title: "The Letting Experts — Landlord Account" };

const RED = "#e31f36";

export default function LandlordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-white font-sans text-[#16181d] [&_h1]:!font-[inherit] [&_h2]:!font-[inherit] [&_h3]:!font-[inherit]"
      style={{ fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}
    >
      <header className="border-b border-black/10">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/landlord" className="flex items-center">
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
            <Link href="/landlord" className="transition-colors hover:text-black">My properties</Link>
            <Link href="/landlord/profile" className="transition-colors hover:text-black">My details</Link>
            <span className="hidden text-black/30 sm:inline">·</span>
            <span className="hidden text-black/40 sm:inline">Raj Chauhan</span>
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
