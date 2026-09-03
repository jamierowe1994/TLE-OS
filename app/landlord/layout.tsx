import Link from "next/link";
import PreviewReturnBar from "@/components/PreviewReturnBar";
import LandlordSignOut from "@/components/LandlordSignOut";
import FileSearch from "@/components/landlord/FileSearch";
import { currentLandlord } from "@/lib/landlord-account";

/**
 * The landlord portal's shell, in the OS's own hand - and white.
 *
 * James, 2 Sep: "completely white... a really clean aesthetic. At the top we
 * want a search bar... we don't need the grey bar that goes across." So the
 * header is the wordmark, the search, and the account, on the page itself,
 * with no band or rule under it. The wordmark is the pin off the real logo
 * beside "The Letting Experts" in the OS's handwriting, cropped from the one
 * logo file the way the marketing shell already does.
 *
 * If Susan wants the website's red instead of the clay, it is one attribute
 * (data-accent="red", which the OS already ships).
 */

export const metadata = { title: "The Letting Experts — Your property file" };

const pill = "rounded-full border border-line/70 bg-panel px-3.5 py-2 text-[12.5px] transition-colors hover:border-ink/40 hover:text-ink";

export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  const me = await currentLandlord();
  return (
    /* The reference: a grey page, a thin margin, and white panels that pop
       against it. #e8e8e6 rather than the OS's eggshell wash - James asked
       for it a shade darker so the white reads as white. */
    <div className="min-h-screen bg-white text-ink">
      <header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 pt-5 sm:px-10">
          {/* The pin and the name in spaced small caps, as the reference. */}
          <Link href="/landlord" className="flex shrink-0 items-center gap-3" aria-label="The Letting Experts">
            <span
              className="block h-8 w-[19px]"
              style={{
                backgroundImage: "url(/brand/tle-logo.png)",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "left center",
                backgroundSize: "auto 100%",
              }}
            />
            <span className="hidden text-[13px] font-semibold uppercase tracking-[0.28em] sm:inline">The Letting Experts</span>
          </Link>
          <div className="order-last w-full sm:order-none sm:mx-auto sm:w-auto sm:max-w-md sm:flex-1">
            <FileSearch />
          </div>
          <nav className="ml-auto flex flex-wrap items-center gap-2 text-muted">
            {me ? (
              <>
                <Link href="/landlord" className={pill}>My property</Link>
                <Link href="/landlord/profile" className={pill}>My details</Link>
                <span className="hidden pl-1 text-[12.5px] md:inline">{me.name}</span>
                <LandlordSignOut />
              </>
            ) : (
              <Link href="/landlord/sign-in" className={pill}>Sign in</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="px-5 pb-10 pt-16 sm:px-10 sm:pt-20">{children}</main>

      <footer>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 text-[11.5px] text-muted sm:px-10">
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
