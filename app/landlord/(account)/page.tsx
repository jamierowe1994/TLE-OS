import LandlordDashboard from "@/components/landlord/Dashboard";
import LandlordDocuments from "@/components/LandlordDocuments";
import PropertyPhoto from "@/components/PropertyPhoto";
import { Pill } from "@/components/Wire";
import { currentLandlord, landlordJourneys, landlordProperties, type AppraisalJourney } from "@/lib/landlord-account";
import { geocode } from "@/lib/geocode";
import { DECK_KINDS } from "@/lib/present";
import { STAGES, stepsForStage, type LandlordView, type Stage } from "@/lib/landlord-view";
import type { ManagedProperty } from "@/lib/portfolio-types";

const money = (n: number | null | undefined) => (n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`);
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
const dayLong = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null;

/**
 * The landlord's home, live. Builds the dashboard's view from the appraisal
 * journey (lib/landlord-account.ts) and from the managed book for a landlord
 * we already look after. Nothing on the page is a sample; each panel shows
 * the real thing or says what happens next.
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

  if (!view) {
    return (
      <div className="space-y-4">
        <div className="px-2 pt-4">
          <h1 className="text-[40px] leading-none">Hello, {first}</h1>
          <p className="mt-3 text-[13.5px] text-muted">We don&rsquo;t have a property against this address yet.</p>
        </div>
        <div className="rounded-[20px] border border-line/70 bg-panel p-5 text-[13px] leading-relaxed text-muted">
          If you have a property with us that is not showing, it may be held against a different
          email address. Your agent can put that right.
        </div>
      </div>
    );
  }

  return (
    <LandlordDashboard
      view={view}
      upload={
        open[0] ? (
          <LandlordDocuments
            accountId={me.id}
            wanted={view.documents.filter((d) => d.state === "missing").map((d) => d.title)}
            compact
          />
        ) : undefined
      }
      managed={
        rest.length > 0 ? (
          <section className="rounded-[20px] border border-line/70 bg-panel p-5" data-search>
            <h2 className="text-[17px]">{open[0] ? "Already looked after" : "Your other properties"}</h2>
            <div className="mt-4 space-y-3">
              {rest.map((p) => (
                <ManagedRow key={p.listingId} p={p} />
              ))}
            </div>
          </section>
        ) : undefined
      }
    />
  );
}

/* --------------------------------------------------------- the feeders -- */

/** The OS's appraisal beats, mapped onto the landlord's six stops. */
function stageOf(j: AppraisalJourney): Stage {
  if (j.stage === "won") return "marketing";
  if (j.signed.length || j.stage === "takeon" || j.stage === "aml") return "compliance";
  if (j.appraisal.valuation != null) return "instruction";
  return "valuation";
}

async function appraisalView(j: AppraisalJourney, first: string): Promise<LandlordView> {
  const a = j.appraisal;
  const latest = j.decks[0] ?? null;
  const post = j.decks.find((d) => d.kind === "post-appraisal") ?? null;
  const deckAgent = latest?.deck.agent ?? null;
  const property = latest?.deck.property ?? null;
  const signUrl = post?.deck.terms?.signUrl ?? null;
  const signed = j.signed.length > 0;
  const agentName = a.agent ?? deckAgent?.name ?? null;
  const agentEmail = deckAgent?.email ?? null;
  const stage = stageOf(j);
  const at = STAGES.findIndex((s) => s.id === stage);
  const visitDay = dayLong(a.appointmentAt);

  const geo = await geocode(`${a.address}, ${a.postcode}`).catch(() => null);

  const deckLabel = latest ? (DECK_KINDS.find((k) => k.id === latest.kind)?.label ?? latest.kind) : null;

  const journey: LandlordView["journey"] = STAGES.map((s, i) => ({
    id: s.id,
    label: s.label,
    sub:
      s.id === "valuation"
        ? (a.valuation != null ? day(a.valuedAt) ?? "Done" : visitDay ? `Visit ${visitDay}` : "Being arranged")
        : s.id === "instruction" && signed
          ? day(j.signed[0].signedAt) ?? "Signed"
          : i < at
            ? "Done"
            : i === at
              ? "In progress"
              : "Upcoming",
    state: i < at ? "done" : i === at ? "current" : "upcoming",
  }));

  const documents: LandlordView["documents"] = [
    { title: "Terms of business", sub: signed ? `Signed  •  ${day(j.signed[0].signedAt) ?? ""}` : signUrl ? "Ready to sign" : "On its way from your agent", state: signed ? "uploaded" : "pending" },
    { title: "Photo ID and proof of ownership", sub: "Missing", state: "missing" },
    { title: "Gas safety certificate (CP12)", sub: "Missing, if there is gas", state: "missing" },
    { title: "Electrical safety report (EICR)", sub: "Missing", state: "missing" },
    { title: "Energy Performance Certificate (EPC)", sub: property?.epc ? `On record  •  rating ${property.epc}` : "Missing", state: property?.epc ? "uploaded" : "missing" },
  ];
  const have = documents.filter((d) => d.state === "uploaded").length;
  const readiness = Math.round(((at + have / documents.length) / STAGES.length) * 100);

  const activity: LandlordView["activity"] = [
    ...j.signed.map((s) => ({ title: "Terms signed", sub: s.name, date: day(s.signedAt) ?? "", icon: "pencil" })),
    ...j.decks.map((d) => ({
      title: `${DECK_KINDS.find((k) => k.id === d.kind)?.label ?? "Presentation"} shared`,
      sub: `${d.authorName || agentName || "Your agent"} sent it to you`,
      date: day(d.createdAt) ?? "",
      icon: "message",
    })),
    ...(a.valuation != null ? [{ title: "Property valued", sub: `We agreed ${money(a.valuation)} a month`, date: day(a.valuedAt) ?? "", icon: "coin" }] : []),
    ...(a.appointmentAt ? [{ title: "Visit booked", sub: `${agentName ?? "Your agent"} came round`, date: day(a.appointmentAt) ?? "", icon: "calendar" }] : []),
  ].slice(0, 5);

  return {
    greeting: `Hello, ${first}`,
    intro: "Your property journey is underway. Here's what you need to know.",
    stage,
    journey,
    property: {
      address: a.address,
      postcode: a.postcode,
      state: stage === "marketing" ? "On the market" : "Being let",
      facts: [property?.propertyType, property?.beds != null ? `${property.beds} bed` : null, property?.baths != null ? `${property.baths} bath` : null].filter((x): x is string => !!x),
      rent: { figure: a.valuation != null ? money(a.valuation) : null, unit: "per month", caption: a.valuation != null ? "Asking rent" : "Rent, after the visit" },
      valuedOn: day(a.valuedAt),
      reference: a.postcode || null,
      image: property?.image ?? null,
      lat: geo?.ok ? geo.at.lat : null,
      lng: geo?.ok ? geo.at.lng : null,
    },
    steps: stepsForStage(stage, {
      presentation: { id: "presentation", label: "View presentation", sub: latest ? `${deckLabel}, from ${latest.authorName || agentName || "your agent"}` : "Lands here before the visit", href: latest ? `/present/${latest.token}` : null, icon: "analytics", external: true },
      sign: { id: "sign", label: signed ? "Your contract" : "Sign your contract", sub: signed ? "Signed. It lives in Documents" : signUrl ? "Review and sign your management terms" : "On its way from your agent", href: signUrl, icon: "pencil", external: true },
      compliance: { id: "compliance", label: "Upload compliance documents", sub: "Add EICR, EPC and other essentials", href: "#documents", icon: "upload" },
      message: { id: "message", label: "Message your agent", sub: "Ask questions or share information", href: agentEmail ? `mailto:${agentEmail}?subject=${encodeURIComponent(`About ${a.address}`)}` : null, icon: "message", external: true },
      listing: { id: "listing", label: "See your listing", sub: "Live on the portals", href: null, icon: "home" },
      viewings: { id: "viewings", label: "Viewings and offers", sub: "Who has been, and what they said", href: null, icon: "key" },
    }),
    documents,
    snapshot: {
      readinessPct: readiness,
      note: at === 0 ? "It starts with the visit." : `${documents.length - have} document${documents.length - have === 1 ? "" : "s"} still to send.`,
      lines: [
        ["Asking rent", a.valuation != null ? `${money(a.valuation)} / month` : "After the visit"],
        ["Service", j.serviceLabel ?? "To be agreed"],
        ["Management fee", a.feePct != null ? `${a.feePct}% of rent` : "To be agreed"],
        ["Set-up fee", a.setupFee != null ? money(a.setupFee) : "To be agreed"],
        ["Marketing", "Included"],
      ],
    },
    activity,
    agent: deckAgent
      ? { name: deckAgent.name, title: deckAgent.title, phone: deckAgent.phone, email: deckAgent.email, photo: deckAgent.photo }
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
    stage: "let",
    journey: STAGES.map((s) => ({ id: s.id, label: s.label, sub: s.id === "let" ? day(p.letSince) ?? "Done" : "Done", state: s.id === "let" ? "current" : "done" })),
    property: {
      address: p.name,
      postcode: p.locality,
      state: tenant ? "Tenanted" : "Let",
      facts: [p.service, p.letType].filter((x): x is string => !!x),
      rent: { figure: p.rent == null ? null : money(p.rent), unit: p.rentPeriod === "week" ? "per week" : "per month", caption: "Rent" },
      valuedOn: null,
      reference: p.postcode,
      image: p.image,
      lat: p.lat,
      lng: p.lng,
    },
    steps: stepsForStage("let", {
      presentation: { id: "presentation", label: "View presentation", sub: "From when we valued it", href: null, icon: "analytics" },
      sign: { id: "sign", label: "Your contract", sub: "Coming to this file", href: null, icon: "pencil" },
      compliance: { id: "compliance", label: "Certificates", sub: "Coming to this file", href: null, icon: "shield" },
      message: { id: "message", label: "Message your agent", sub: "Ask questions or share information", href: null, icon: "message" },
      listing: { id: "listing", label: "Your listing", sub: "Let", href: null, icon: "home" },
      viewings: { id: "viewings", label: "Your tenancy", sub: tenant ? `${tenant.name}, since ${day(p.letSince) ?? "—"}` : "Let", href: null, icon: "key" },
    }),
    documents: [],
    snapshot: {
      readinessPct: 100,
      note: "Nothing waiting on you.",
      lines: [
        ["Rent", p.rent == null ? "Not set" : `${money(p.rent)} / ${p.rentPeriod === "week" ? "week" : "month"}`],
        ["Service", p.service ?? "Not set"],
        ["Let type", p.letType ?? "—"],
        ["Tenant", tenant?.name ?? "Not on record"],
        ["Let since", day(p.letSince) ?? "—"],
      ],
    },
    activity: p.letSince ? [{ title: "Let", sub: tenant ? `${tenant.name} moved in` : "Tenancy started", date: day(p.letSince) ?? "", icon: "key" }] : [],
    agent: p.agent ? { name: p.agent.name } : null,
  };
}

function ManagedRow({ p }: { p: ManagedProperty }) {
  const tenant = p.tenants[0];
  return (
    <div className="flex flex-wrap items-center gap-4 [&>div]:min-w-[55%]">
      <span className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line/60 bg-white">
        <PropertyPhoto src={p.image} className="h-full w-full object-cover" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[17px]">{p.name}</h3>
        <p className="text-[12px] text-muted">
          {[p.locality, p.service, p.rent != null ? `${money(p.rent)} ${p.rentPeriod === "week" ? "per week" : "per month"}` : null, tenant?.name]
            .filter(Boolean)
            .join("  •  ")}
        </p>
      </div>
      <Pill tone={tenant ? "good" : "accent"}>{tenant ? "Tenanted" : "Let"}</Pill>
    </div>
  );
}
