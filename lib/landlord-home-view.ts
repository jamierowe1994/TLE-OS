import {
  currentLandlord,
  landlordCompliance,
  landlordDocuments,
  landlordJourneys,
  landlordMessages,
  landlordOffers,
  landlordProgress,
  landlordProperties,
  extraDocsFor,
  offerOf,
  testProgress,
  type AppraisalJourney,
  type LandlordCompliance,
  type LandlordDocument,
  type LandlordMessage,
} from "@/lib/landlord-account";
import { geocode } from "@/lib/geocode";
import { epcForAddress } from "@/lib/epc";
import { takeOnBooking, takeOnTimes } from "@/lib/takeon";
import { DECK_KINDS } from "@/lib/present";
import { currentApproval } from "@/lib/landlord-offers";
import { STAGES, stepsForStage, type LandlordView, type Stage, type ViewOffer } from "@/lib/landlord-view";
import { readAnswers } from "@/lib/property-answers-store";
import { progress as answerProgress } from "@/lib/property-questions";
import type { ManagedProperty } from "@/lib/portfolio-types";
import { EXTRA_DOC_KINDS } from "@/lib/landlord-doc-kinds";
import { testDealForAppraisal, testListingForAppraisal, testOffersForAppraisal, testViewingsForListing } from "@/lib/test-overlay";

/**
 * A signed-in landlord's view, live - built once here and read by every page
 * of the portal (home and journey, 11 Sep 2026). It used to live inside the
 * home page's own file, where no other page could reach it. Nothing in it is
 * a sample: each part is the real thing or says what happens next.
 */

type Me = NonNullable<Awaited<ReturnType<typeof currentLandlord>>>;

import { listOrders } from "@/lib/works-orders";
import { listInspections } from "@/lib/inspections";
import { fetchListingBook } from "@/lib/rex-listings";
import { portalLinksFor } from "@/lib/rex-portal-links";
import { fetchViewingsFor } from "@/lib/rex-viewings";
import { rexConfigured } from "@/lib/rex";
import type { ViewMaintenance, ViewMarketing, ViewViewing } from "@/lib/landlord-view";

const dayTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

/**
 * The listing and its viewings, from REX, once a property is on the market:
 * the photographs, where it is advertised and since when, and who has been.
 * Empty on any failure - the portal renders without it rather than hang.
 * Viewers are described, never named, before there is an offer.
 */
async function marketingFor(rexPropertyId: string | null, appraisalId?: string): Promise<{ marketing: ViewMarketing | null; viewings: ViewViewing[] }> {
  /* A test file's listing (lib/test-overlay) - REX has never heard of it. */
  const test = appraisalId ? await testListingForAppraisal(appraisalId).catch(() => null) : null;
  if (test) {
    const vs = await testViewingsForListing(test.listingId).catch(() => []);
    return {
      marketing: {
        live: true,
        liveSince: day(test.publishedAt),
        portals: test.portals.map((p) => ({ name: p.portal, href: p.url })),
        photos: test.images,
        note: `${test.images.length} photographs`,
      },
      viewings: vs.map((v) => ({
        id: `os-${v.appointmentId}`,
        when: dayTime(v.startsAt) ?? "",
        who: "A prospective tenant",
        state: (v.done ? "done" : "booked") as ViewViewing["state"],
        feedback: null,
      })),
    };
  }
  if (!rexPropertyId || !rexConfigured()) return { marketing: null, viewings: [] };
  try {
    const book = await fetchListingBook();
    const listing = book.listings.find((l) => l.propertyId === rexPropertyId) ?? null;
    if (!listing) return { marketing: null, viewings: [] };
    const [portals, raw] = await Promise.all([
      portalLinksFor(listing.id).catch(() => []),
      fetchViewingsFor(listing.id, rexPropertyId).catch(() => []),
    ]);
    const live = listing.publicationStatus === "published";
    const marketing: ViewMarketing = {
      live,
      liveSince: day(listing.publishedAt),
      portals: portals.map((p) => ({ name: p.portal, href: p.url })),
      photos: listing.images ?? (listing.image ? [listing.image] : []),
      note: live ? `${listing.imageCount} photograph${listing.imageCount === 1 ? "" : "s"}` : "Being written up and photographed",
    };
    const now = Date.now();
    const viewings: ViewViewing[] = raw
      .filter((v) => v.kind === "viewing")
      .map((v) => ({
        id: v.id,
        when: dayTime(v.startsAt) ?? "",
        who: v.contacts.length > 1 ? `${v.contacts.length} people viewing together` : "A prospective tenant",
        state: (v.cancelled ? "cancelled" : new Date(v.startsAt).getTime() >= now ? "booked" : "done") as ViewViewing["state"],
        feedback: null,
      }))
      .sort((a, b) => (a.state === "booked" ? 0 : 1) - (b.state === "booked" ? 0 : 1));
    return { marketing, viewings };
  } catch {
    return { marketing: null, viewings: [] };
  }
}

/** Maintenance in one line for a managed property, from the board and the inspections book. */
async function maintenanceFor(propertyId: string | null): Promise<ViewMaintenance> {
  const [orders, visits] = await Promise.all([
    propertyId ? listOrders({ propertyId, open: true }).catch(() => []) : Promise.resolve([]),
    propertyId ? listInspections({ propertyId, open: true }).catch(() => []) : Promise.resolve([]),
  ]);
  const needsYou = orders.filter((o) => o.status === "approval" || (o.arranging === "landlord" && !o.landlordResolvedAt)).length;
  const booked = visits.find((i) => i.status === "booked");
  const nextVisit = booked ? (dayTime(booked.bookedAt ?? booked.offered[0] ?? booked.dueAt) ?? null) : null;
  const open = orders.length;
  return {
    open,
    needsYou,
    nextVisit,
    headline: needsYou ? `${needsYou} job${needsYou === 1 ? "" : "s"} waiting on you` : open ? `${open} job${open === 1 ? "" : "s"} in hand` : "All up to date",
    sub: needsYou
      ? "A quote needs your say-so, or a job is with your own contractor."
      : open
        ? "Nothing needs you. We are on it."
        : "Nothing reported, nothing outstanding. Fantastic.",
  };
}

export const money = (n: number | null | undefined) => (n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`);
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
const dayLong = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null;


/**
 * WHICH PROPERTY THEY ARE LOOKING AT.
 *
 * `pick` is a key from landlordPlaces - "a:<appraisalId>" or "m:<propertyId>"
 * - and it comes off the address bar (?p=). A query param rather than a cookie
 * on purpose: the back button, a reload and a link all then say the same
 * thing, where a hidden server-side choice means a landlord who sent their
 * spouse a link would be sending them a different property.
 *
 * An unknown or missing pick falls back to what the portal always did - the
 * newest open appraisal, else the first managed property - so a landlord with
 * one property never sees any of this, and a stale link never dead-ends.
 */
export async function loadLandlordHome(me: Me, pick?: string | null) {
  const [journeys, managed, docs, msgs] = await Promise.all([
    landlordJourneys(me),
    landlordProperties(me),
    landlordDocuments(me.id),
    landlordMessages(me.id),
  ]);
  /* The three slow reads - certificates, offers, the deal - side by side
     rather than one after another. Each is REX or Propoly; in series the
     page took seven seconds, which is a landlord closing the tab. */
  const all = journeys
    .filter((j) => j.stage !== "lost")
    .sort((a, b) => Number(a.stage === "won") - Number(b.stage === "won") || b.appraisal.createdAt.localeCompare(a.appraisal.createdAt));

  /* The chosen one to the front of its own list, so everything below - which
     reads [0] throughout - simply works on it. */
  const wantA = pick?.startsWith("a:") ? pick.slice(2) : null;
  const wantM = pick?.startsWith("m:") ? pick.slice(2) : null;
  const chosenA = wantA ? all.find((j) => j.appraisal.id === wantA) ?? null : null;
  const chosenM = wantM ? managed.find((p) => (p.propertyId ?? p.listingId) === wantM) ?? null : null;

  /* Picking a MANAGED property has to empty the appraisal list, not reorder
     it: everything downstream prefers open[0] over managed[0], so leaving an
     open appraisal in place would quietly show that one instead. */
  const open = chosenM ? [] : chosenA ? [chosenA, ...all.filter((j) => j !== chosenA)] : all;
  const book = chosenM ? [chosenM, ...managed.filter((p) => p !== chosenM)] : managed;

  const lead = open[0] ?? null;
  let movedIn = false;
  // eslint-disable-next-line prefer-const
  let [compliance, offers, progress, approved] = await Promise.all([
    landlordCompliance(book),
    landlordOffers(
      lead ? [lead.appraisal.rexPropertyId] : book[0] ? [book[0].propertyId] : [],
      lead ? [] : book[0] ? [book[0].listingId] : []
    ),
    /* With the postcode on the end: the match will not accept an address without one. */
    landlordProgress(
      me.email,
      lead
        ? [[lead.appraisal.address, lead.appraisal.postcode].filter(Boolean).join(" ")]
        : book[0]
          ? [[book[0].name, book[0].locality, book[0].postcode].filter(Boolean).join(" ")]
          : []
    ),
    /* What they have already said yes to. Ours, not REX's - see
       lib/landlord-offers for why approving cannot move an application. */
    currentApproval(me.id).catch(() => null),
  ]);
  /* A test file (lib/test-overlay): its fake offers and deal, on top of
     whatever REX and Propoly said - which for a test is nothing. */
  if (lead) {
    const [tOffers, tDeal] = await Promise.all([
      testOffersForAppraisal(lead.appraisal.id).catch(() => []),
      testDealForAppraisal(lead.appraisal.id).catch(() => null),
    ]);
    offers.push(...tOffers.map(offerOf));
    if (tDeal && !progress) progress = testProgress({ property: tDeal.property, locality: tDeal.locality, tenantName: tDeal.tenantName, moveIn: tDeal.moveIn, rent: tDeal.rent, stageKey: tDeal.stageKey });
    /* Moved in a month ago (a live tenancy test file): the file is a MANAGED
       property from here, which is what opens maintenance on the portal. */
    movedIn = Boolean(tDeal && tDeal.stageKey === "move_day" && tDeal.moveIn && new Date(tDeal.moveIn).getTime() < Date.now() - 24 * 3600 * 1000);
  }
  const first = me.name.split(/\s+/)[0] || me.name;
  const base = open[0]
    ? await appraisalView(open[0], first, docs, msgs, offers, me.id)
    : book[0]
      ? await managedView(book[0], first, compliance.get(book[0].propertyId ?? "") ?? null, offers)
      : null;
  const view = base
    ? {
        ...base,
        progress,
        approvedOfferId: approved?.applicationId ?? null,
        ...(movedIn ? { stage: "managed" as const, property: { ...base.property, state: "Tenanted" } } : {}),
      }
    : null;
  const rest = open[0] ? book : book.slice(1);
  /* Which one this actually resolved to, so the shell can light the right row
     in the dropdown even when ?p= was absent or stale. */
  const at = open[0] ? `a:${open[0].appraisal.id}` : book[0] ? `m:${book[0].propertyId ?? book[0].listingId}` : null;

  return { view, open, rest, compliance, docs, first, at };
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

/** The documents EVERY let needs, in the order we ask for them. */
export const REQUIRED_DOCS: Array<{ kind: LandlordDocument["kind"]; title: string; missing: string }> = [
  { kind: "id", title: "Photo ID", missing: "Missing" },
  { kind: "ownership", title: "Proof of ownership", missing: "Missing  •  a title register or mortgage statement" },
  { kind: "gas", title: "Gas safety certificate (CP12)", missing: "Missing, if there is gas" },
  { kind: "eicr", title: "Electrical safety report (EICR)", missing: "Missing" },
  { kind: "epc", title: "Energy Performance Certificate (EPC)", missing: "Missing" },
];

/**
 * What THIS let needs: the five, then whatever the agent ticked for the
 * property on the appraisal - an HMO licence, a fire risk assessment, a
 * Scottish registration (Susan, 19 Sep 2026; lib/landlord-doc-kinds).
 */
export async function requiredDocsFor(appraisalId: string | null | undefined): Promise<typeof REQUIRED_DOCS> {
  const extra: string[] = await extraDocsFor(appraisalId).catch(() => []);
  return [
    ...REQUIRED_DOCS,
    ...EXTRA_DOC_KINDS.filter((k) => extra.includes(k.id)).map((k) => ({ kind: k.id as LandlordDocument["kind"], title: k.label, missing: `Missing  •  ${k.hint}` })),
  ];
}

async function appraisalView(j: AppraisalJourney, first: string, docs: LandlordDocument[], msgs: LandlordMessage[], offers: ViewOffer[] = [], landlordId: string | null = null): Promise<LandlordView> {
  const a = j.appraisal;
  const latest = j.decks[0] ?? null;
  const post = j.decks.find((d) => d.kind === "post-appraisal") ?? null;
  /* The deck their file shows: the one built after the visit once there is
     one, which is what we sent them - not whichever deck is newest. */
  const shown = post ?? latest;
  /* Their EPC on the public register, if there is a current one. */
  const [registerEpc, needDocs] = await Promise.all([epcForAddress(a.address, a.postcode ?? "").catch(() => null), requiredDocsFor(a.id)]);
  /* The photographs: what they have offered, and what has been booked. */
  const [photoTimes, takeOn] = await Promise.all([takeOnTimes(a.id).catch(() => null), takeOnBooking(a.id).catch(() => null)]);
  const readIt = shown && landlordId ? await deckReadBy(landlordId, shown.token) : false;
  const deckAgent = latest?.deck.agent ?? null;
  const property = latest?.deck.property ?? null;
  /* Ready to sign once the agent has sent the terms, not when a deck happens
     to carry a link (that link was the agent's own - see the builder). */
  const signUrl = a.termsSentAt ? "sent" : null;
  const signed = j.signed.length > 0;
  /* Only asked for once they have signed, so only read then - a questionnaire
     nobody has been offered has nothing to report. */
  const answered = signed ? answerProgress(await readAnswers(a.id)) : { done: 0, of: 0, pct: 0 };
  const agentName = a.agent ?? deckAgent?.name ?? null;
  const stage = stageOf(j, offers);
  const at = STAGES.findIndex((s) => s.id === stage);
  const visitDay = dayLong(a.appointmentAt);
  const offersSub = offers.length
    ? `${offers.length} ${offers.length === 1 ? "offer" : "offers"}${offers.some((o) => o.status === "accepted") ? "  •  one accepted" : offers.some((o) => o.status === "with-you") ? "  •  one with you" : ""}`
    : "Who has been, and what they said";

  const geo = await geocode(`${a.address}, ${a.postcode}`).catch(() => null);
  const onMarket = at >= STAGES.findIndex((s) => s.id === "marketing");
  const { marketing, viewings } = onMarket ? await marketingFor(a.rexPropertyId, a.id) : { marketing: null, viewings: [] as ViewViewing[] };

  const deckLabel = latest ? (DECK_KINDS.find((k) => k.id === latest.kind)?.label ?? latest.kind) : null;
  const shownLabel = shown ? (DECK_KINDS.find((k) => k.id === shown.kind)?.label ?? shown.kind) : null;

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
    ...needDocs.map((r) => {
      const u = uploaded(r.kind);
      if (u) return { title: r.title, sub: `Uploaded  •  ${day(u.uploadedAt) ?? ""}`, state: "uploaded" as const, href: `/api/landlord/documents/${u.id}` };
      /* The national register counts. A current certificate is public and we
         can see it, so nobody is asked to send a copy (James, 17 Sep 2026). */
      if (r.kind === "epc" && (property?.epc || registerEpc)) {
        const band = property?.epc ?? registerEpc?.band ?? null;
        return {
          title: r.title,
          sub: registerEpc && !property?.epc ? `On the national register  •  ${band ? `rating ${band}  •  ` : ""}${registerEpc.registeredOn.slice(0, 4)}` : `On record  •  rating ${band}`,
          state: "uploaded" as const,
          href: null,
        };
      }
      return { title: r.title, sub: r.missing, state: "missing" as const, href: null };
    }),
    ...mine.filter((d) => d.kind === "other").map((d) => ({ title: d.name, sub: `Uploaded  •  ${day(d.uploadedAt) ?? ""}`, state: "uploaded" as const, href: `/api/landlord/documents/${d.id}` })),
  ];
  const required = documents.filter((d) => needDocs.some((r) => r.title === d.title));
  const have = required.filter((d) => d.state === "uploaded").length;
  const allIn = have === required.length;
  /* Enough to book the photographs: everything in, or at the very least an
     EPC - theirs or the register's (James, 17 Sep 2026: "as a minimum it
     will be EPC for the moment"). */
  const photosReady = allIn || required.some((d) => d.title.includes("Energy Performance") && d.state === "uploaded");
  const readiness = Math.round(((at + have / required.length) / STAGES.length) * 100);

  const activity: LandlordView["activity"] = [
    ...mine.map((d) => ({ title: `${needDocs.find((r) => r.kind === d.kind)?.title ?? d.name} received`, sub: "Filed on your property", date: day(d.uploadedAt) ?? "", icon: "upload" })),
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
      /* Opens the booklet IN their file (PresentModal), never the bare
         /present link - James, 17 Sep 2026: that took them to "an actual
         version of the property presentation rather than the curated one". */
      presentation: shown
        ? { id: "presentation", label: "View your presentation", sub: `${shownLabel}, from ${shown.authorName || agentName || "your agent"}`, href: null, icon: "analytics", action: "presentation" }
        : { id: "presentation", label: "View your presentation", sub: "Lands here before the visit", href: null, icon: "analytics" },
      /* Signed: off the list. Not yet: the tile opens the signing here. */
      sign: { id: "sign", label: "Sign your contract", sub: a.valuation != null ? "Review and sign your management terms" : "Follows the valuation", href: null, icon: "pencil", action: "sign", done: signed },
      /* The things only they know. Held back until the contract is signed by
         stepsForStage; counted in screens, because that is the unit the
         questionnaire itself uses. */
      questions: {
        id: "questions",
        /* James, 17 Sep 2026: after signing, "we need some details". */
        label: "We need some details",
        sub: answered.done === 0 ? "A few questions about the property - it saves as you go" : `${answered.done} of ${answered.of} done`,
        href: "/landlord/questions",
        icon: "key",
        done: answered.done >= answered.of,
      },
      /* Everything in: off the list. */
      /* The photographs. Offered once their compliance is in - and always
         optional, because a re-let often keeps the photographs it has
         (James, 17 Sep 2026). Done, so off the list, until then. */
      photos: {
        id: "photos",
        label: photoTimes ? "Times sent for the photographs" : "Suggest times for the photographs",
        sub: takeOn
          ? `Booked for ${dayLong(takeOn.startsAt) ?? "the agreed time"}`
          : photoTimes
            ? `${photoTimes.slots.length} time${photoTimes.slots.length === 1 ? "" : "s"} with your agent - they'll confirm`
            : "Optional. Tell us when suits and we'll book the visit for the photographs and floor plan.",
        href: null,
        icon: "pack/photo",
        action: "photos",
        done: Boolean(takeOn) || !photosReady,
      },
      compliance: { id: "compliance", label: "Upload your compliance documents", sub: `${required.length - have} of ${required.length} still to send`, href: "/landlord/documents", icon: "upload", done: allIn },
      message: { id: "message", label: "Message your agent", sub: "Ask questions or share information", href: null, icon: "message", action: "message" },
      listing: { id: "listing", label: "See your listing", sub: marketing?.live ? `Live on ${marketing.portals.map((p) => p.name).join(", ") || "the portals"}` : "Once marketing starts", href: marketing ? "#listing" : null, icon: "home" },
      /* With offers on the table this step IS the offers, and it opens them
         rather than scrolling to a list - James, 16 Sep 2026. Before any have
         come in it is the viewings anchor it always was. */
      viewings: offers.length
        ? { id: "viewings", label: offers.length === 1 ? "View the offer" : "View offers", sub: offersSub, href: null, icon: "key", action: "offers" as const }
        : { id: "viewings", label: "Viewings and offers", sub: offersSub, href: viewings.length ? "#viewings" : null, icon: "key" },
      tenancy: { id: "tenancy", label: "Your tenancy", sub: "Drawn up once referencing is back", href: null, icon: "file-contract" },
      maintenance: { id: "maintenance", label: "Maintenance", sub: "Opens once your tenant moves in", href: null, icon: "setting" },
      renewal: { id: "renewal", label: "Tenancy renewal", sub: "After the let", href: null, icon: "calendar" },
      certificates: { id: "certificates", label: "Certificates", sub: "After the let", href: null, icon: "shield" },
    }, {
      /* Counted by the viewer itself when the deck is genuinely on screen -
         see /api/present/opened - so this is "they read it", not "we sent it".
         Undefined while there is no presentation at all, which leaves the
         tiles exactly as they were. */
      presentationOpened: shown ? readIt : undefined,
    }),
    /* Any signing link frozen into an older deck is the agent's - see the
       builder. The file finds the landlord's own. */
    presentation: shown
      ? { ...shown.deck, builder: null, terms: shown.deck.terms ? { ...shown.deck.terms, signUrl: null } : shown.deck.terms }
      : null,
    presentationToken: shown?.token ?? null,
    documents,
    marketing,
    viewings,
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

async function managedView(p: ManagedProperty, first: string, comp: LandlordCompliance | null, offers: ViewOffer[] = []): Promise<LandlordView> {
  const maintenance = await maintenanceFor(p.propertyId);
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
    intro: "Your property is let and looked after. Here's how it's doing.",
    stage: "managed",
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
    steps: stepsForStage("managed", {
      photos: { id: "photos", label: "Photographs", sub: "Arranged with your agent", href: null, icon: "pack/photo", done: true },
      presentation: { id: "presentation", label: "View your presentation", sub: "From when we valued it", href: null, icon: "analytics" },
      sign: { id: "sign", label: "Your contract", sub: "Coming to this file", href: null, icon: "pencil" },
      questions: { id: "questions", label: "About the property", sub: "What you told us at the start", href: "/landlord/questions", icon: "key", done: true },
      compliance: { id: "compliance", label: "Certificates", sub: certsSub, href: comp ? "/landlord/documents" : null, icon: "shield" },
      message: { id: "message", label: "Message your agent", sub: "Ask questions or share information", href: null, icon: "message", action: "message" },
      listing: { id: "listing", label: "Your listing", sub: "Let", href: null, icon: "home" },
      viewings: { id: "viewings", label: "Your tenancy", sub: tenant ? `${tenant.name}, since ${day(p.letSince) ?? "—"}` : "Let", href: "#tenancy", icon: "key" },
      /* The management profile's three: what needs doing, when the tenancy turns, what is due. */
      maintenance: { id: "maintenance", label: "Maintenance", sub: maintenance.headline, href: "/landlord/maintenance", icon: "setting", done: maintenance.open === 0 },
      renewal: { id: "renewal", label: "Tenancy renewal", sub: "We'll be in touch before the tenancy turns", href: "#tenancy", icon: "calendar" },
      certificates: { id: "certificates", label: "Certificates", sub: certsSub, href: "/landlord/documents", icon: "shield", done: Boolean(comp?.allInDate) },
      tenancy: { id: "tenancy", label: "Your tenancy", sub: tenant ? `${tenant.name}, since ${day(p.letSince) ?? "—"}` : "Let", href: "#tenancy", icon: "key" },
    }),
    documents: certDocs,
    tenancy: {
      tenant: tenant?.name ?? "Your tenant",
      started: day(p.letSince),
      /* REX holds the let date, not the end: the renewal is a conversation
         your agent starts, and the line says so rather than guessing. */
      ends: null,
      renewal: "We'll be in touch before the tenancy turns to talk through renewal.",
      renewalDue: null,
      rent: p.rent == null ? "Not set" : `${money(p.rent)} per ${p.rentPeriod === "week" ? "week" : "month"}`,
      rentStatus: "Collected by us",
      deposit: null,
      agreementHref: null,
      agreementSigned: null,
      service: p.service,
    },
    maintenance,
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

/** Has this landlord read past the first spread of this deck in their own file? */
async function deckReadBy(landlordId: string, token: string): Promise<boolean> {
  const { hasDb, q } = await import("@/lib/db");
  if (!hasDb()) return false;
  const rows = await q<{ record_id: string }>(
    `SELECT record_id FROM os_case_state WHERE kind = 'landlord-deck-read' AND record_id = $1`,
    [`${landlordId}|${token}`]
  ).catch(() => []);
  return rows.length > 0;
}
