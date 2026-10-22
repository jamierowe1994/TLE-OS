import HomeDetail from "@/components/tenant/HomeDetail";
import GoneHome from "@/components/tenant/GoneHome";
import { LinkGone } from "@/components/tenant/MoreHomesList";
import { homeOnMarket } from "@/lib/tenant-homes";
import { moreHomes } from "@/lib/more-homes-page";

/** One home, from Show Me Other Homes: enquire with no account (lib/more-homes-page). */

export const dynamic = "force-dynamic";
export const metadata = { title: "Homes to rent · The Letting Experts" };

export default async function MoreHomesHome({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const [m, h] = await Promise.all([moreHomes(token), homeOnMarket(id)]);
  if (!m.ok) return <LinkGone />;
  const base = `/tenant/more-homes/${token}`;
  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 pt-6 sm:px-8 lg:px-12">
      {h ? (
        <HomeDetail
          h={h}
          home={m.home ?? m.start}
          base={base}
          asked={null}
          first={m.first}
          phone={m.phone}
          guest={token}
          fromLabel={m.home ? "From your home" : m.start ? m.start.label.replace(/^Near /, "From ") : "Distance"}
        />
      ) : (
        <GoneHome base={base} />
      )}
    </div>
  );
}
