import LandlordDashboard from "@/components/landlord/Dashboard";
import LandlordDocuments from "@/components/LandlordDocuments";
import PropertyPhoto from "@/components/PropertyPhoto";
import { Pill } from "@/components/Wire";
import {
  currentLandlord,
  landlordDocuments,
  landlordJourneys,
  landlordMessages,
  landlordProperties,
  type AppraisalJourney,
  type LandlordDocument,
  type LandlordMessage,
} from "@/lib/landlord-account";
import { geocode } from "@/lib/geocode";
import { DECK_KINDS } from "@/lib/present";
import { STAGES, stepsForStage, type LandlordView, type Stage } from "@/lib/landlord-view";
import type { ManagedProperty } from "@/lib/portfolio-types";
import { landlordCompliance, landlordOffers, landlordProgress, type LandlordCompliance } from "@/lib/landlord-account";
import type { ViewOffer } from "@/lib/landlord-view";

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
  const [journeys, managed, docs, msgs] = await Promise.all([
    landlordJourneys(me),
    landlordProperties(me),
    landlordDocuments(me.id),
    landlordMessages(me.id),
  ]);
  /* The three slow reads - certificates, offers, the deal - side by side
     rather than one after another. Each is REX or Propoly; in series the
     page took seven seconds, which is a landlord closing the tab. */
  const open = journeys
    .filter((j) => j.stage !== "lost")
    .sort((a, b) => Number(a.stage === "won") - Number(b.stage === "won") || b.appraisal.createdAt.localeCompare(a.appraisal.createdAt));

  const lead = open[0] ?? null;
  const [compliance, offers, progress] = await Promise.all([
    landlordCompliance(managed),
    landlordOffers(
      lead ? [lead.appraisal.rexPropertyId] : managed[0] ? [managed[0].propertyId] : [],
      lead ? [] : managed[0] ? [managed[0].listingId] : []
    ),
    landlordProgress(me.email, lead ? [lead.appraisal.address] : managed[0] ? [managed[0].name] : []),
  ]);
  const first = me.name.split(/\s+/)[0] || me.name;
  const base = open[0]
    ? await appraisalView(open[0], first, docs, msgs, offers)
    : managed[0]
      ? managedView(managed[0], first, compliance.get(managed[0].propertyId ?? "") ?? null, offers)
      : null;
  const view = base ? { ...base, progress } : null;
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
            appraisalId={open[0].appraisal.id}
            wanted={(["id", "ownership", "gas", "eicr", "epc"] as const).filter((k) => !docs.some((d) => d.kind === k))}
          />
        ) : undefined
      }
      managed={
        rest.length > 0 ? (
          <section className="rounded-[20px] border border-line/70 bg-panel p-5" data-search>
            <h2 className="text-[17px]">{open[0] ? "Already looked after" : "Your other properties"}</h2>
            <div className="mt-4 space-y-3">
              {rest.map((p) => (
                <ManagedRow key={p.listingId} p={p} compliance={compliance.get(p.propertyId ?? "") ?? null} />
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
function stageOf(j: AppraisalJourney, offers: ViewOffer[] = []): Stage {
  /* Once it is on the market, the offers say where it is: one accepted is
     Let agreed, any at all is Viewings / Offers. */
  if (j.stage === "won" && offers.some((o) => o.status === "accepted")) return "let";
  if (j.stage === "won" && offers.length) return "viewings";
  if (j.stage === "won") return "marketing";
  if (j.signed.length || j.stage === "takeon" || j.stage === "aml") return "compliance";
  if (j.appraisal.valuation != null) return "instruction";
  return "valuation";
}

/** The documents a let needs, in the order we ask for them. */
const REQUIRED: Array<{ kind: LandlordDocument["kind"]; title: string; missing: string }> = [
  { kind: "id", title: "Photo ID", missing: "Missing" },
  { kind: "ownership", title: "Proof of ownership", missing: "Missing  •  a title register or mortgage statement" },
  { kind: "gas", title: "Gas safety certificate (CP12)", missing: "Missing, if there is gas" },
  { kind: "eicr", title: "Electrical safety report (EICR)", missing: "Missing" },
  { kind: "epc", title: "Energy Performance Certificate (EPC)", missing: "Missing" },
];

async function appraisalView(j: AppraisalJourney, first: string, docs: LandlordDocument[], msgs: LandlordMessage[], offers: ViewOffer[] = []): Promise<LandlordView> {
  const a = j.appraisal;
  const latest = j.decks[0] ?? null;
  const post = j.decks.find((d) => d.kind === "post-appraisal") ?? null;
  const deckAgent = latest?.deck.agent ?? null;
  const property = latest?.deck.property ?? null;
  const signUrl = post?.deck.terms?.signUrl ?? null;
  const signed = j.signed.length > 0;
  const agentName = a.agent ?? deckAgent?.name ?? null;
  const stage = stageOf(j, offers);
  const at = STAGES.findIndex((s) => s.id === stage);
  const visitDay = dayLong(a.appointmentAt);
  const offersSub = offers.length
    ? `${offers.length} ${offers.length === 1 ? "offer" : "offers"}${offers.some((o) => o.status === "accepted") ? "  •  one accepted" : offers.some((o) => o.status === "with-you") ? "  •  one with you" : ""}`
    : "Who has been, and what they said";

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

  /* What is on the file. An upload of a kind ticks that row and links to the
     file; the EPC also counts as in if the deck found one on the register. */
  const mine = docs.filter((d) => !d.appraisalId || d.appraisalId === a.id);
  const uploaded = (kind: LandlordDocument["kind"]) => mine.find((d) => d.kind === kind) ?? null;
  const documents: LandlordView["documents"] = [
    {
      title: "Terms of business",
      sub: signed ? `Signed  •  ${day(j.signed[0].signedAt) ?? ""}` : signUrl ? "Ready to sign" : "On its way from your agent",
      state: signed ? "uploaded" : "pending",
      href: signed ? `/api/landlord/signed/${j.signed[0].submitterId}` : null,
    },
    ...REQUIRED.map((r) => {
      const u = uploaded(r.kind);
      if (u) return { title: r.title, sub: `Uploaded  •  ${day(u.uploadedAt) ?? ""}`, state: "uploaded" as const, href: `/api/landlord/documents/${u.id}` };
      if (r.kind === "epc" && property?.epc) return { title: r.title, sub: `On record  •  rating ${property.epc}`, state: "uploaded" as const, href: null };
      return { title: r.title, sub: r.missing, state: "missing" as const, href: null };
    }),
    ...mine.filter((d) => d.kind === "other").map((d) => ({ title: d.name, sub: `Uploaded  •  ${day(d.uploadedAt) ?? ""}`, state: "uploaded" as const, href: `/api/landlord/documents/${d.id}` })),
  ];
  const required = documents.filter((d) => REQUIRED.some((r) => r.title === d.title));
  const have = required.filter((d) => d.state === "uploaded").length;
  const allIn = have === required.length;
  const readiness = Math.round(((at + have / required.length) / STAGES.length) * 100);

  const activity: LandlordView["activity"] = [
    ...mine.map((d) => ({ title: `${REQUIRED.find((r) => r.kind === d.kind)?.title ?? d.name} received`, sub: "Filed on your property", date: day(d.uploadedAt) ?? "", icon: "upload" })),
    ...msgs.filter((m) => m.direction === "landlord").slice(-2).map((m) => ({ title: "Message sent", sub: m.body.length > 60 ? `${m.body.slice(0, 60)}…` : m.body, date: day(m.sentAt) ?? "", icon: "message" })),
    ...j.signed.map((s) => ({ title: "Terms signed", sub: s.name, date: day(s.signedAt) ?? "", icon: "pencil" })),
    ...j.decks.map((d) => ({
      title: `${DECK_KINDS.find((k) => k.id === d.kind)?.label ?? "Presentation"} shared`,
      sub: `${d.authorName || agentName || "Your agent"} sent it to you`,
      date: day(d.createdAt) ?? "",
      icon: "message",
    })),
    ...(a.valuation != null ? [{ title: "Property valued", sub: `We agreed ${money(a.valuation)} a month`, date: day(a.valuedAt) ?? "", icon: "coin" }] : []),
    ...(a.appointmentAt ? [{ title: "Visit booked", sub: `${agentName ?? "Your agent"} came round`, date: day(a.appointmentAt) ?? "", icon: "calendar" }] : []),
  ]
    .sort((x, y) => y.date.localeCompare(x.date))
    .slice(0, 6);

  return {
    greeting: `Hello, ${first}`,
    intro: "Your property journey is underway. Here's what you need to know.",
    appraisalId: a.id,
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
      /* Signed: off the list. Not yet: the tile opens the signing here. */
      sign: { id: "sign", label: "Sign your contract", sub: a.valuation != null ? "Review and sign your management terms" : "Follows the valuation", href: null, icon: "pencil", action: "sign", done: signed },
      /* Everything in: off the list. */
      compliance: { id: "compliance", label: "Upload compliance documents", sub: `${required.length - have} of ${required.length} still to send`, href: "#documents", icon: "upload", done: allIn },
      message: { id: "message", label: "Message your agent", sub: "Ask questions or share information", href: null, icon: "message", action: "message" },
      listing: { id: "listing", label: "See your listing", sub: "Live on the portals", href: null, icon: "home" },
      viewings: { id: "viewings", label: "Viewings and offers", sub: offersSub, href: offers.length ? "#offers" : null, icon: "key" },
    }),
    documents,
    snapshot: {
      readinessPct: readiness,
      note: at === 0 ? "It starts with the visit." : allIn ? "Everything we need is in." : `${required.length - have} document${required.length - have === 1 ? "" : "s"} still to send.`,
      lines: [
        ["Asking rent", a.valuation != null ? `${money(a.valuation)} / month` : "After the visit"],
        ["Service", j.serviceLabel ?? "To be agreed"],
        ["Management fee", a.feePct != null ? `${a.feePct}% of rent` : "To be agreed"],
        ["Set-up fee", a.setupFee != null ? money(a.setupFee) : "To be agreed"],
        ["Marketing", "Included"],
      ],
    },
    activity,
    offers,
    messages: msgs.map((m) => ({ id: m.id, from: m.direction, body: m.body, sentAt: m.sentAt, emailed: Boolean(m.emailedAt) })),
    agent: deckAgent
      ? { name: deckAgent.name, title: deckAgent.title, phone: deckAgent.phone, email: deckAgent.email, photo: deckAgent.photo }
      : agentName
        ? { name: agentName }
        : null,
  };
}

function managedView(p: ManagedProperty, first: string, comp: LandlordCompliance | null, offers: ViewOffer[] = []): LandlordView {
  const tenant = p.tenants[0];
  /* The certificates, as documents. A landlord reads "Gas safety - expires
     12 March 2027" the way they read "Contract - signed": a thing on the
     file, with a state. No file to open yet: REX holds the certificate and
     the portal does not serve REX's files, so the line says ask your agent. */
  const certDocs = (comp?.certs ?? []).map((c) => {
    const fault = !c.quiet && (c.status === "missing" || c.status === "expired");
    return {
      title: c.label,
      sub: c.line + (fault ? "  •  Ask your agent" : c.href ? "  •  Open" : ""),
      state: (c.status === "ok" || c.status === "watch" ? "uploaded" : fault ? "missing" : "pending") as "uploaded" | "missing" | "pending",
      href: c.href,
    };
  });
  const dated = (comp?.certs ?? []).filter((c) => !c.quiet);
  const certsSub = comp
    ? comp.allInDate
      ? `All in date  •  ${dated.length} on record`
      : comp.headline
    : "Being read from your file";
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
      compliance: { id: "compliance", label: "Certificates", sub: certsSub, href: comp ? "#documents" : null, icon: "shield" },
      message: { id: "message", label: "Message your agent", sub: "Ask questions or share information", href: null, icon: "message" },
      listing: { id: "listing", label: "Your listing", sub: "Let", href: null, icon: "home" },
      viewings: { id: "viewings", label: "Your tenancy", sub: tenant ? `${tenant.name}, since ${day(p.letSince) ?? "—"}` : "Let", href: null, icon: "key" },
    }),
    documents: certDocs,
    offers,
    snapshot: {
      readinessPct: comp ? Math.round((100 * dated.filter((c) => c.status === "ok" || c.status === "watch").length) / Math.max(1, dated.length)) : 100,
      note: comp && !comp.allInDate ? `${comp.headline}. Your agent will be in touch about it.` : "Nothing waiting on you.",
      lines: [
        ["Rent", p.rent == null ? "Not set" : `${money(p.rent)} / ${p.rentPeriod === "week" ? "week" : "month"}`],
        ["Service", p.service ?? "Not set"],
        ["Let type", p.letType ?? "—"],
        ["Tenant", tenant?.name ?? "Not on record"],
        ["Let since", day(p.letSince) ?? "—"],
        ["Certificates", certsSub],
      ],
    },
    activity: p.letSince ? [{ title: "Let", sub: tenant ? `${tenant.name} moved in` : "Tenancy started", date: day(p.letSince) ?? "", icon: "key" }] : [],
    agent: p.agent ? { name: p.agent.name } : null,
  };
}

function ManagedRow({ p, compliance }: { p: ManagedProperty; compliance: LandlordCompliance | null }) {
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
      {compliance && !compliance.allInDate && <Pill tone="accent">{compliance.headline}</Pill>}
      <Pill tone={tenant ? "good" : "accent"}>{tenant ? "Tenanted" : "Let"}</Pill>
    </div>
  );
}
