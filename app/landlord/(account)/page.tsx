import LandlordDashboard from "@/components/landlord/Dashboard";
import LandlordDocuments from "@/components/LandlordDocuments";
import PropertyPhoto from "@/components/PropertyPhoto";
import { Pill } from "@/components/Wire";
import {
  currentLandlord,
  landlordJourneys,
  landlordProperties,
  JOURNEY,
  type AppraisalJourney,
} from "@/lib/landlord-account";
import { OUTSTANDING_AT_APPRAISAL } from "@/lib/appraisal-compliance";
import { geocode } from "@/lib/geocode";
import { DECK_KINDS } from "@/lib/present";
import type { LandlordView } from "@/lib/landlord-view";
import type { ManagedProperty } from "@/lib/portfolio-types";

const money = (n: number | null | undefined) => (n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`);
const dayLong = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null;
const dayShort = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

/**
 * The landlord's home, live. Builds the dashboard's view from the appraisal
 * journey (lib/landlord-account.ts) - the property first, then the valuation,
 * the presentation, the terms - and from the managed book for a landlord we
 * already look after. Nothing on the page is a sample; each tile shows the
 * real thing or says what happens next.
 */
export default async function LandlordHome() {
  const me = (await currentLandlord())!;
  const [journeys, managed] = await Promise.all([landlordJourneys(me), landlordProperties(me)]);
  const first = me.name.split(/\s+/)[0] || me.name;

  const open = journeys
    .filter((j) => j.stage !== "lost")
    .sort((a, b) => Number(a.stage === "won") - Number(b.stage === "won") || b.appraisal.createdAt.localeCompare(a.appraisal.createdAt));

  const view = open[0] ? await appraisalView(open[0], first) : managed[0] ? managedView(managed[0], first) : null;
  const rest = open[0] ? managed : managed.slice(1);

  return (
    <div className="py-3">
      <div className="fade-up mb-4 px-1">
        <h1 className="text-[28px] leading-tight">Hello, {first}</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          {view ? view.intro : "We don't have a property against this address yet."}
        </p>
      </div>

      {view ? (
        <LandlordDashboard
          view={view}
          documents={
            open[0] ? (
              <LandlordDocuments
                accountId={me.id}
                wanted={[
                  "Photo ID and proof you own the property",
                  ...OUTSTANDING_AT_APPRAISAL.slice(0, 4).map((o) => o.label),
                  "Energy performance certificate (EPC)",
                ]}
              />
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-[20px] bg-white p-5 text-[13px] leading-relaxed text-muted">
          If you have a property with us that is not showing, it may be held against a different
          email address. Your agent can put that right.
        </div>
      )}

      {rest.length > 0 && (
        <section className="mt-3" data-search>
          <h2 className="px-1 text-[20px]">{open[0] ? "Already looked after" : "Your other properties"}</h2>
          <div className="mt-3 space-y-3">
            {rest.map((p) => (
              <ManagedRow key={p.listingId} p={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* --------------------------------------------------------- the feeders -- */

async function appraisalView(j: AppraisalJourney, first: string): Promise<LandlordView> {
  const a = j.appraisal;
  const latest = j.decks[0] ?? null;
  const post = j.decks.find((d) => d.kind === "post-appraisal") ?? null;
  const deckAgent = latest?.deck.agent ?? null;
  const when = dayLong(a.appointmentAt);
  const visitPassed = a.appointmentAt ? new Date(a.appointmentAt) < new Date() : false;
  const signUrl = post?.deck.terms?.signUrl ?? null;
  const at = JOURNEY.findIndex((b) => b.id === j.at);
  const agentName = a.agent ?? deckAgent?.name ?? null;

  /* Placed on the map from the address. Cached for six months in the
     geocoder, so this is one lookup per property, ever. */
  const geo = await geocode(`${a.address}, ${a.postcode}`).catch(() => null);
  const lat = geo?.ok ? geo.at.lat : null;
  const lng = geo?.ok ? geo.at.lng : null;

  const subtitle =
    a.valuation != null
      ? `Valued ${dayShort(a.valuedAt)}${a.valuedBy ? ` by ${a.valuedBy}` : ""}`
      : when
        ? `${agentName ?? "Your agent"} is visiting on ${when}`
        : "A visit is being arranged";

  const status = (() => {
    switch (j.at) {
      case "visit": return when ? `${agentName ?? "Your agent"} is visiting on ${when}.` : "A visit is being arranged.";
      case "valuation": return visitPassed && a.valuation == null ? "We have been round. Your figure is being written up." : "Your figure is in. Your presentation is next.";
      case "presentation": return "Your presentation is ready to read.";
      case "terms": return "Your figure and your presentation are here. The terms of business are next.";
      case "ready": return "Terms signed. We are getting the property ready to go to market.";
      case "market": return "On the market.";
      case "let": return "Let.";
      default: return "Looked after by us.";
    }
  })();

  const signed = j.signed.length > 0;
  const deckLabel = latest ? (DECK_KINDS.find((k) => k.id === latest.kind)?.label ?? latest.kind) : null;

  /* What we need from them. Recorded facts first, then the certificates the
     law wants, which we cannot see until they send them. */
  const needs: LandlordView["needs"] = [
    { title: "Sign your terms", sub: signed ? `Signed ${dayShort(j.signed[0].signedAt)}` : signUrl ? "Ready to read and sign" : `${agentName ?? "Your agent"} will send them over`, done: signed },
    { title: "Photo ID and proof you own the property", sub: "Send them here and we file them", done: false },
    { title: "Gas safety certificate (CP12)", sub: "Annual, if there is any gas appliance", done: false },
    { title: "Electrical safety report (EICR)", sub: "Every five years", done: false },
    { title: "Energy performance certificate (EPC)", sub: a.valuation != null ? "Send it if you have one" : "We check for one before the visit", done: false },
  ];

  /* The one next step, in order of the journey. */
  const next: LandlordView["next"] =
    signUrl && !signed
      ? { label: "Read and sign your terms", hint: j.serviceLabel ? `${j.serviceLabel}${a.feePct != null ? ` at ${a.feePct}%` : ""}` : undefined, href: signUrl, external: true }
      : latest && !latest.firstOpenedAt
        ? { label: `Read your ${deckLabel?.toLowerCase() ?? "presentation"}`, hint: `From ${latest.authorName || agentName || "your agent"}`, href: `/present/${latest.token}`, external: true }
        : a.valuation == null
          ? { label: when && !visitPassed ? `Your visit is on ${when}` : "Your figure is being written up", hint: "Nothing to do until then", href: null }
          : signed
            ? { label: "Send us what we still need", hint: "Ownership and the safety certificates", href: "#ready" }
            : { label: "Your terms are on their way", hint: `${agentName ?? "Your agent"} will send them for signing`, href: null };

  return {
    greeting: `Hello, ${first}`,
    intro: "Your property, where it is on the way to being let, and everything we hold on it.",
    property: {
      address: a.address,
      postcode: a.postcode,
      image: latest?.deck.property.image ?? null,
      lat,
      lng,
      subtitle,
      state: j.stage === "won" ? "On the market" : "Being valued",
    },
    beats: JOURNEY.map((b) => b.label.replace(/^Your /, "").replace(/^The /, "")).map((s) => s[0].toUpperCase() + s.slice(1)),
    at: Math.max(0, at),
    status,
    next,
    actions: [
      { label: "View presentation", hint: deckLabel ?? "Not yet", href: latest ? `/present/${latest.token}` : null, icon: "doc", tone: latest ? "dark" : "light", external: true },
      { label: "Sign terms", hint: signed ? "Signed" : signUrl ? "Ready to sign" : "Not yet", href: signUrl, icon: "file-contract", tone: signUrl && !signed ? "dark" : "light", external: true },
      { label: "What we need", hint: `${needs.filter((n) => !n.done).length} things`, href: "#ready", icon: "shield", tone: "light" },
    ],
    needs,
    valuation: {
      figure: a.valuation != null ? money(a.valuation) : null,
      unit: "a month",
      caption: a.valuation != null ? "Agreed at the visit" : "After the visit",
      lines: [
        ["Service", j.serviceLabel ?? "To be agreed"],
        ["Fee", a.feePct != null ? `${a.feePct}% of rent` : "To be agreed"],
        ["Set-up", a.setupFee != null ? money(a.setupFee) : "To be agreed"],
      ],
    },
    deck: latest
      ? {
          title: DECK_KINDS.find((k) => k.id === latest.kind)?.label ?? "Your presentation",
          sub: `${latest.authorName || agentName || "Your agent"} · ${dayShort(latest.createdAt)}`,
          href: `/present/${latest.token}`,
          image: latest.deck.property.image ?? null,
        }
      : null,
    agent: deckAgent
      ? { name: deckAgent.name, title: deckAgent.title, phone: deckAgent.phone, email: deckAgent.email, photo: deckAgent.photo, bio: deckAgent.bio }
      : agentName
        ? { name: agentName }
        : null,
  };
}

function managedView(p: ManagedProperty, first: string): LandlordView {
  const tenant = p.tenants[0];
  return {
    greeting: `Hello, ${first}`,
    intro: "Your property with us, and everything we hold on it.",
    property: {
      address: p.name,
      postcode: p.locality,
      image: p.image,
      lat: p.lat,
      lng: p.lng,
      subtitle: `${p.service ?? "Managed"} · let since ${dayShort(p.letSince)}`,
      state: tenant ? "Tenanted" : "Let",
    },
    beats: ["Visit", "Valuation", "Presentation", "Terms", "Marketing", "Offers", "Let", "Looked after"],
    at: 7,
    status: tenant ? `${p.tenants.map((t) => t.name).join(", ")} in since ${dayShort(p.letSince)}.` : "Let, and looked after by us.",
    next: { label: "Nothing waiting on you", hint: "Certificates and statements are coming to this file", href: null },
    actions: [
      { label: "Certificates", hint: "Coming", href: null, icon: "shield", tone: "light" },
      { label: "Statements", hint: "Coming", href: null, icon: "wallet", tone: "light" },
      { label: "Documents", hint: "Coming", href: null, icon: "folder", tone: "light" },
    ],
    needs: [],
    valuation: {
      figure: p.rent == null ? null : money(p.rent),
      unit: p.rentPeriod === "week" ? "a week" : "a month",
      caption: "Rent",
      lines: [
        ["Service", p.service ?? "Not set"],
        ["Let type", p.letType ?? "—"],
        ["Tenant", tenant?.name ?? "Not on record"],
      ],
    },
    deck: null,
    agent: p.agent ? { name: p.agent.name } : null,
  };
}

function ManagedRow({ p }: { p: ManagedProperty }) {
  const tenant = p.tenants[0];
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[20px] bg-white p-4 [&>div]:min-w-[55%]">
      <PropertyPhoto src={p.image} className="h-16 w-24 shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <h3 className="text-[17px]">{p.name}</h3>
        <p className="text-[12px] text-muted">
          {p.locality}
          {p.service ? ` · ${p.service}` : ""}
          {p.rent != null ? ` · ${money(p.rent)} ${p.rentPeriod === "week" ? "a week" : "a month"}` : ""}
          {tenant ? ` · ${tenant.name}` : ""}
        </p>
      </div>
      <Pill tone={tenant ? "good" : "accent"}>{tenant ? "Tenanted" : "Let"}</Pill>
    </div>
  );
}
