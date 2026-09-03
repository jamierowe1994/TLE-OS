import { headers } from "next/headers";
import { landingPage, recordScan, REASON_LABEL } from "@/lib/bond-qr";
import RentCheckForm from "@/components/RentCheckForm";

/**
 * The page a landlord lands on when they scan a card.
 *
 * Public, short link, no sign-in. It already knows the door and why we
 * wrote, so it opens with the address and a line that fits the reason,
 * gives the advertised-rent figure straight away as the hook, and asks for
 * a name and email for the full check. Every figure is from our own
 * sweep and says "advertised", because that is what it is.
 *
 * White, the Letting Experts' hand, mobile first: this is read on a phone
 * standing at the letterbox.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Your rent check · The Letting Experts" };

const HEADLINE: Record<string, (addr: string) => string> = {
  anniversary: (a) => `A year on at ${a}: is the rent still right?`,
  just_bought: (a) => `Congratulations on ${a}. Here is what it could let for.`,
  self_managing: (a) => `Letting ${a} yourself? Here is where the rent sits.`,
  custom: (a) => `Your free rent check for ${a}`,
};

const pounds = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const monthName = (ym: string) => (ym ? new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "");

export default async function RentCheckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await landingPage(token);
  const h = await headers();
  if (data) await recordScan(token, h.get("user-agent") ?? "");

  return (
    /* bond-skin pins the light palette: this page is read by the public and
       must look the same whatever theme the browser last chose for the OS. */
    <main className="bond-skin min-h-screen bg-white text-ink">
      <header className="flex items-center gap-3 px-5 pt-6 sm:px-10">
        <span
          className="block h-8 w-[19px]"
          style={{ backgroundImage: "url(/brand/tle-logo.png)", backgroundRepeat: "no-repeat", backgroundPosition: "left center", backgroundSize: "auto 100%" }}
        />
        <span className="text-[12.5px] font-semibold uppercase tracking-[0.28em]">The Letting Experts</span>
      </header>

      {!data ? (
        <section className="mx-auto max-w-xl px-5 py-16 sm:px-10">
          <h1 className="hand text-[28px] leading-tight">That code is not one of ours</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            The link may have been typed out by hand. If you are a landlord and would like a free rent check, email us at hello@thelettingsexperts.co.uk with the address.
          </p>
        </section>
      ) : (
        <section className="mx-auto max-w-xl px-5 py-10 sm:px-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{REASON_LABEL[data.link.reason]}</p>
          <h1 className="hand mt-2 text-[28px] leading-tight sm:text-[34px]">{(HEADLINE[data.link.reason] ?? HEADLINE.custom)(data.link.address.split(",")[0])}</h1>
          <p className="mt-2 text-[13px] text-muted">
            {data.link.address}
            {data.beds != null ? ` · ${data.beds} bed` : ""}
            {data.property_type ? ` ${data.property_type.toLowerCase()}` : ""}
          </p>

          <div className="mt-6 rounded-3xl border border-line/80 bg-[#fbfbfa] p-6">
            {data.check.estimate ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Similar homes nearby are advertised at</p>
                <p className="figures mt-2 text-[44px] leading-none">{pounds(data.check.estimate.median)} <span className="text-[16px] text-muted">pcm</span></p>
                <p className="mt-2 text-[13px] text-muted">
                  Most sit between {pounds(data.check.estimate.low)} and {pounds(data.check.estimate.high)}. Based on {data.check.basis}.
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Your rent check</p>
                <p className="mt-2 text-[14px] leading-relaxed">{data.check.basis} We will put one together by hand: leave your details below.</p>
              </>
            )}
          </div>

          {data.check.comparables.length > 0 && (
            <div className="mt-6">
              <h2 className="hand text-[18px]">What is letting near you</h2>
              <ul className="mt-2 divide-y divide-line/70">
                {data.check.comparables.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate">{c.street}, {c.area}</span>
                      <span className="block text-[11.5px] text-muted">
                        {c.beds != null ? `${c.beds} bed` : ""}{c.type ? ` ${c.type.toLowerCase()}` : ""} · {c.status}{c.when ? ` ${monthName(c.when)}` : ""}
                      </span>
                    </span>
                    <span className="figures shrink-0">{pounds(c.rent)} pcm</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8">
            <h2 className="hand text-[20px]">Get the full check, free</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              A proper figure for your home from a local lettings expert, with what we would do to get it. No obligation, and we will not pass your details on.
            </p>
            <RentCheckForm token={token} />
          </div>

          <p className="mt-10 text-[11px] leading-relaxed text-muted">
            Advertised rents are what similar homes were marketed at, not what was agreed. The Letting Experts, part of The Experts Group.
          </p>
        </section>
      )}
    </main>
  );
}
