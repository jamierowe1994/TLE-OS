import Link from "next/link";
import PropertyPhoto from "@/components/PropertyPhoto";
import LandlordDocuments from "@/components/LandlordDocuments";
import {
  currentLandlord,
  landlordJourneys,
  landlordProperties,
  JOURNEY,
  type AppraisalJourney,
  type JourneyBeat,
} from "@/lib/landlord-account";
import { OUTSTANDING_AT_APPRAISAL } from "@/lib/appraisal-compliance";
import { DECK_KINDS } from "@/lib/present";
import type { ManagedProperty } from "@/lib/portfolio-types";

const RED = "#e31f36";

const money = (n: number | null | undefined) => (n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`);
const dayLong = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : null;
const dayShort = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

/**
 * The landlord's home: the property first, then where they are with us.
 *
 * James, 2 Sep: "the first thing they should see is the property, and then
 * the second thing after that is that they'll see the valuation. They can
 * also view the presentation in there as well... then they can see all of
 * the terms." One property at a time, the journey drawn as beats a landlord
 * would use, and every card either shows the real thing or says plainly
 * what happens next. Nothing on this page is a sample.
 *
 * Two kinds of property can be here: one going through an appraisal (an OS
 * record, with its decks and terms), and one we already manage (REX's
 * leased book). A landlord with both sees the appraisal first, because that
 * is the one with something to do on it.
 */
export default async function LandlordHome() {
  const me = (await currentLandlord())!;
  const [journeys, managed] = await Promise.all([landlordJourneys(me), landlordProperties(me)]);
  const first = me.name.split(/\s+/)[0] || me.name;

  /* Open appraisals first, newest first; won and lost sink. */
  const open = journeys
    .filter((j) => j.stage !== "lost")
    .sort((a, b) => Number(a.stage === "won") - Number(b.stage === "won") || b.appraisal.createdAt.localeCompare(a.appraisal.createdAt));

  const nothing = open.length === 0 && managed.length === 0;

  return (
    <div className="py-10">
      <h1 className="text-[24px] font-bold leading-tight">Hello, {first}</h1>
      <p className="mt-1 text-[13.5px] text-black/60">
        {nothing
          ? "We don't have a property against this address yet."
          : open.length && managed.length
            ? "Your property with us, where it is on the way to being let, and the ones we already look after."
            : open.length
              ? "Your property with us, and where it is on the way to being let."
              : managed.length === 1
                ? "Your property with us, and everything we hold on it."
                : `Your ${managed.length} properties with us, and everything we hold on them.`}
      </p>

      {nothing && (
        <div className="mt-8 rounded-xl border border-black/10 bg-[#fafafa] p-5 text-[13px] leading-relaxed text-black/60">
          If you have a property with us that is not showing, it may be held against a different
          email address. Your agent can put that right.
        </div>
      )}

      {open.map((j) => (
        <Appraisal key={j.appraisal.id} j={j} accountId={me.id} />
      ))}

      {managed.length > 0 && (
        <section className="mt-10">
          {open.length > 0 && <h2 className="text-[16px] font-bold">Already looked after</h2>}
          <div className={`${open.length ? "mt-4" : "mt-8"} space-y-5`}>
            {managed.map((p) => (
              <Managed key={p.listingId} p={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* --------------------------------------------------------- the appraisal -- */

function Appraisal({ j, accountId }: { j: AppraisalJourney; accountId: string }) {
  const a = j.appraisal;
  const latest = j.decks[0] ?? null;
  const post = j.decks.find((d) => d.kind === "post-appraisal") ?? null;
  const image = latest?.deck.property.image ?? null;
  const agent = latest?.deck.agent ?? null;
  const when = dayLong(a.appointmentAt);
  const visitPassed = a.appointmentAt ? new Date(a.appointmentAt) < new Date() : false;
  const signUrl = post?.deck.terms?.signUrl ?? null;
  const at = JOURNEY.findIndex((b) => b.id === j.at);

  return (
    <section className="mt-8">
      {/* ── the property ── */}
      <div className="overflow-hidden rounded-xl border border-black/10">
        <div className="relative">
          <PropertyPhoto src={image} className="h-[220px] w-full object-cover sm:h-[280px]" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">Your property</p>
            <p className="mt-1 text-[22px] font-bold leading-tight">{a.address}</p>
            <p className="text-[13px] opacity-80">{a.postcode}</p>
          </div>
        </div>

        {/* ── where you are ── */}
        <div className="border-t border-black/10 bg-[#fafafa] px-5 py-4">
          <div className="grid grid-cols-4 gap-1 sm:grid-cols-8">
            {JOURNEY.map((b, i) => (
              <div key={b.id} className="min-w-0">
                <div className="h-1.5 rounded-full" style={{ backgroundColor: i <= at ? RED : "rgba(0,0,0,0.08)" }} />
                <p className={`mt-1.5 truncate text-[10px] ${i === at ? "font-bold text-black" : "text-black/45"}`}>{b.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-black/70">{Where(j, when, visitPassed)}</p>
        </div>
      </div>

      {/* ── valuation and presentation ── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Your valuation">
          {a.valuation != null ? (
            <>
              <p className="text-[30px] font-bold leading-none">
                {money(a.valuation)} <span className="text-[13px] font-medium text-black/50">a month</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
                <Fact label="Service" value={j.serviceLabel ?? "To be agreed"} />
                <Fact label="Management fee" value={a.feePct != null ? `${a.feePct}% of rent` : "To be agreed"} />
                <Fact label="Tenancy set-up" value={a.setupFee != null ? money(a.setupFee) : "To be agreed"} />
                <Fact label="Valued" value={`${dayShort(a.valuedAt)}${a.valuedBy ? ` by ${a.valuedBy}` : ""}`} />
              </dl>
              {a.valuationNote && (
                <p className="mt-4 rounded-lg bg-[#fafafa] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-black/70">{a.valuationNote}</p>
              )}
            </>
          ) : (
            <p className="text-[13px] leading-relaxed text-black/60">
              {visitPassed
                ? `${a.agent ?? "Your agent"} is writing up the figure from the visit. It will appear here, with what it is based on.`
                : when
                  ? `Comes after the visit on ${when}. ${a.agent ?? "Your agent"} will talk you through it on the day, and it will be written down here.`
                  : "Comes after the visit. It will be written down here, with what it is based on."}
            </p>
          )}
        </Card>

        <Card title="Your presentation">
          {j.decks.length ? (
            <ul className="space-y-2.5">
              {j.decks.map((d) => {
                const kind = DECK_KINDS.find((k) => k.id === d.kind);
                return (
                  <li key={d.token} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold">{kind?.label ?? d.kind}</p>
                      <p className="truncate text-[11.5px] text-black/50">
                        {dayShort(d.createdAt)}
                        {d.authorName ? ` · ${d.authorName}` : ""}
                      </p>
                    </div>
                    <Link
                      href={`/present/${d.token}`}
                      className="shrink-0 rounded-lg px-3.5 py-2 text-[12px] font-bold text-white"
                      style={{ backgroundColor: RED }}
                    >
                      Open
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] leading-relaxed text-black/60">
              {visitPassed
                ? "Your presentation is being put together and will appear here."
                : "What we already know about the property, the local market and what it should let for. It lands here before the visit."}
            </p>
          )}
        </Card>
      </div>

      {/* ── terms and what we need ── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Your terms">
          {j.signed.length ? (
            <ul className="space-y-2">
              {j.signed.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold">{s.name}</p>
                    <p className="text-[11.5px] text-black/50">Signed {dayShort(s.signedAt)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#16181d] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white">Signed</span>
                </li>
              ))}
            </ul>
          ) : post?.deck.terms?.summary || signUrl ? (
            <>
              {post?.deck.terms?.summary && (
                <p className="text-[13px] leading-relaxed text-black/70">{post.deck.terms.summary}</p>
              )}
              {signUrl ? (
                <a
                  href={signUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block rounded-lg px-5 py-2.5 text-[13px] font-bold text-white"
                  style={{ backgroundColor: RED }}
                >
                  Read and sign your terms
                </a>
              ) : (
                <p className="mt-3 text-[12.5px] text-black/50">
                  {a.agent ?? "Your agent"} will send the terms over for signing. Once they are signed they live here.
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] leading-relaxed text-black/60">
              {a.valuation != null
                ? `${a.agent ?? "Your agent"} will send the terms over for signing. Once they are signed they live here.`
                : "Once you and your agent have agreed a figure, the terms of business come here to read and sign."}
            </p>
          )}
        </Card>

        <Card title="Who is looking after you">
          {agent ? (
            <div className="flex items-start gap-4">
              {agent.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.photo} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#fafafa] text-[16px] font-bold text-black/30">
                  {agent.firstName?.[0] ?? agent.name[0]}
                </span>
              )}
              <div className="min-w-0 text-[13px]">
                <p className="font-bold">{agent.name}</p>
                {agent.title && <p className="text-black/50">{agent.title}</p>}
                <p className="mt-2 flex flex-wrap gap-x-3 text-[12.5px]">
                  {agent.phone && <a href={`tel:${agent.phone.replace(/\s+/g, "")}`} className="hover:underline">{agent.phone}</a>}
                  {agent.email && <a href={`mailto:${agent.email}`} className="truncate hover:underline">{agent.email}</a>}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-black/70">{a.agent ?? "Your agent will be in touch."}</p>
          )}
        </Card>
      </div>

      <div className="mt-5 rounded-xl border border-black/10 p-5">
        <p className="text-[15px] font-bold">Getting it ready to let</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-black/60">
          These are the things the law needs in place before a tenant moves in. Some you will
          already have; send us what you have and we will tell you what is missing.
        </p>
        <div className="mt-4">
          <LandlordDocuments
            accountId={accountId}
            wanted={[
              "Photo ID and proof you own the property",
              ...OUTSTANDING_AT_APPRAISAL.slice(0, 4).map((o) => o.label),
              "Energy performance certificate (EPC)",
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function Where(j: AppraisalJourney, when: string | null, visitPassed: boolean): string {
  const a = j.appraisal;
  const agent = a.agent ?? "your agent";
  switch (j.at as JourneyBeat) {
    case "visit":
      return when ? `${agent} is visiting on ${when}.` : `A visit is being arranged with ${agent}.`;
    case "valuation":
      return visitPassed && a.valuation == null
        ? `We have been round. ${agent} is writing up your figure.`
        : `Your figure is in. ${agent} will send your presentation over.`;
    case "presentation":
      return "Your presentation is ready to read.";
    case "terms":
      return "Your figure and your presentation are here. The terms of business are next.";
    case "ready":
      return "Terms signed. We are getting the property ready to go to market.";
    case "market":
      return "On the market.";
    case "let":
      return "Let.";
    default:
      return "Looked after by us.";
  }
}

/* ----------------------------------------------------------- managed -- */

function Managed({ p }: { p: ManagedProperty }) {
  const tenant = p.tenants[0];
  return (
    <section className="overflow-hidden rounded-xl border border-black/10">
      <div className="flex flex-wrap items-center gap-4 border-b border-black/10 bg-[#fafafa] p-4">
        <PropertyPhoto src={p.image} className="h-16 w-24 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{p.name}</p>
          <p className="text-[12px] text-black/50">
            {p.locality}
            {p.service ? ` · ${p.service}` : ""}
          </p>
        </div>
        <span className="rounded-full px-3 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: tenant ? "#16181d" : RED }}>
          {tenant ? "Tenanted" : "Let"}
        </span>
      </div>
      <dl className="grid gap-4 p-4 sm:grid-cols-3">
        <Fact label="Rent" value={p.rent == null ? "Not set" : `${money(p.rent)} ${p.rentPeriod === "week" ? "a week" : "a month"}`} />
        <Fact label="Let since" value={dayShort(p.letSince)} />
        <Fact label="Let type" value={p.letType ?? "—"} />
        <Fact label={p.tenants.length > 1 ? "Tenants" : "Tenant"} value={p.tenants.length ? p.tenants.map((t) => t.name).join(", ") : "Not on our record"} />
        <Fact label="Your agent" value={p.agent?.name ?? "—"} />
        <Fact label="Service" value={p.service ?? "Not set"} />
      </dl>
    </section>
  );
}

/* --------------------------------------------------------------- bits -- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/10 p-5">
      <p className="text-[15px] font-bold">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-bold uppercase tracking-wide text-black/40">{label}</dt>
      <dd className="mt-0.5 text-[13px]">{value}</dd>
    </div>
  );
}
