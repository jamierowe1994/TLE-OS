import Link from "next/link";
import HomesBrowser from "@/components/tenant/HomesBrowser";
import AskedPing from "@/components/tenant/AskedPing";
import { moreHomes } from "@/lib/more-homes-page";

/** Show Me Other Homes: Find a home for somebody with no account (lib/more-homes-page). */
export default async function MoreHomesList({ token }: { token: string }) {
  const m = await moreHomes(token);
  if (!m.ok) return <LinkGone />;
  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 sm:px-8 lg:px-12">
      <AskedPing token={token} />
      <HomesBrowser
        homes={m.market.ok ? m.market.homes : null}
        error={m.market.ok ? null : m.market.error}
        home={m.home}
        start={m.start}
        base={`/tenant/more-homes/${token}`}
        alert={null}
        askedAbout={null}
        guest={token}
        intro={m.intro}
      />
    </div>
  );
}

/** A link that has been changed or cut short. */
export function LinkGone() {
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">That link didn&rsquo;t work</p>
      <h1 className="mt-2 text-[24px] font-semibold leading-tight">It may have been cut short in the email.</h1>
      <p className="mt-3 text-[13.5px] text-muted">Reply to the email and we&rsquo;ll send you what&rsquo;s on, or see every home on our website.</p>
      <Link href="https://thelettingexperts.co.uk" className="mt-6 inline-block rounded-xl bg-accent-dark px-6 py-3 text-[13.5px] font-semibold text-white">
        See Our Homes
      </Link>
    </div>
  );
}
