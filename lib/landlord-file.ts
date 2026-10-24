import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { deckData } from "@/lib/appraisal-deck";
import { splitAddress } from "@/lib/pre-pack";
import { firstNameOf, initialsOf, type PresentDeck } from "@/lib/present";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import type { LandlordView, Stage } from "@/lib/landlord-view";

/**
 * THE LANDLORD FILE AND THE PLAN (Claude Design, 24 Oct 2026).
 *
 * James's new landlord page - Overview, Documents, Messages, Journey - and
 * The Plan, the letting plan as a page-turning magazine. Kept as the design's
 * own page (lib/decks/landlord-file.html), the same way as the pre-appraisal
 * pack and the appraisal presentation, and filled here from what the current
 * file already reads: the landlord's view (lib/landlord-home-view), the
 * appraisal, and the presentation we sent them.
 *
 * Nothing new is invented for a landlord to read. Where the design leans on a
 * figure we do not hold - enquiries per listing, a twelve-month rent trend,
 * who is looking - the page is drawn from what we do hold instead (homes
 * advertised nearby, how long they have been up, asking rent by bedrooms).
 */

export type FileDoc = { k: string; name: string; sub: string; file: string | null; date?: string; href?: string | null; flag?: string };

export type FileData = {
  sample: boolean;
  appraisalId: string | null;
  landlord: { first: string; full: string };
  agent: { first: string; name: string; role: string; initials: string; phone: string; email: string; whatsapp: string; replies: string; photo: string };
  property: { street: string; no: string; town: string; postcode: string; area: string; type: string; beds: number | null; baths: number | null; epc: string; valued: string; image: string };
  /** The fees as agreed, including VAT. Null hides the fees row and the receipt's lines. */
  service: { name: string; fee: number; setup: number | null; setupWords: string; marketing: string } | null;
  figure: { low: number; high: number; ask: number; weeks: string } | null;
  readiness: number;
  /** 0-6, the journey's own steps. */
  stage: number;
  signed: boolean;
  /** Where Sign goes: the current file's contract (it opens on ?sign=1). Null when there is nothing to sign yet. */
  signHref: string | null;
  next: { title: string; sub: string; action: "sign" | "book" | "documents" | "messages" | "link" | "none"; label: string; href: string | null };
  journey: [string, string, string, string, string][];
  docs: FileDoc[];
  fromUs: [string, string, "sign" | "book" | "open", string | null][];
  messages: ([string] | ["me" | "them", string, string])[];
  /** The Plan. Null when no presentation has been sent: no card, no booklet. */
  plan: null | {
    issue: string;
    market: null | {
      area: string;
      advertised: number | null;
      under4: number;
      bandTotal: number;
      rentByBed: { label: string; n: number; rent: number }[];
      mine: { label: string; rent: number } | null;
      agents: { agent: string; n: number; ours: boolean }[];
      pulled: string;
    };
    comps: [string, number, string][];
    loves: [string, string][];
    fixes: [string, string][];
    /** What the agent noted at the visit (the deck's own rows), for the loves page when nobody wrote any. */
    notes: [string, string][];
  };
};

const LONDON = "Europe/London";
const day = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.valueOf()) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: LONDON }).format(d) : "";
};
const dayHead = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: LONDON }).format(new Date(iso));
const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: LONDON }).format(new Date(iso));
const clean = (s: string | null | undefined) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ").replace(/\s+•\s+/g, " · ").trim();

const ORDER: Stage[] = ["valuation", "instruction", "compliance", "marketing", "viewings", "let", "managed"];

/* The design's words for every step: what it is, your part, our part. */
const JOURNEY: [string, string, string, string][] = [
  ["Valuation", "You show us round; we value the home.", "Be there for the visit", "Value the home and build your plan"],
  ["Instruction signed", "Nothing is marketed until both of us have signed the terms.", "Sign the management terms", "Set up your property file"],
  ["Compliance", "The certificates every let needs, checked before we list.", "Upload your documents", "Review them and advise"],
  ["Marketing", "Photos, the advert and the portals.", "Nothing, we handle it", "List and market your home"],
  ["Viewings and offers", "Viewings, feedback and offers to consider.", "Consider the offers", "Arrange and run every viewing"],
  ["Let agreed", "References, checks and the tenancy agreement.", "Approve the tenancy", "Set up the tenancy"],
  ["Move-in and management", "Keys handed over, and we look after it from here.", "Nothing, enjoy it", "Manage the property, month by month"],
];

/* The fees as the contract has them, VAT in (James, 16 Sep 2026: always show the figure including VAT). */
function serviceOf(a: MarketAppraisal | null, ask: number | null): FileData["service"] {
  if (!a?.serviceLevel) return null;
  const vat = (n: number) => Math.round(n * 1.2 * 100) / 100;
  const setup = a.setupFee != null ? vat(a.setupFee) : ask ? Math.round(ask * 0.6) : null;
  const setupWords = a.setupFee === 0 ? "None" : a.setupFee != null ? "" : "60% of the first month's rent";
  switch (a.serviceLevel) {
    case "full_managed":
      return { name: "Fully managed", fee: vat(a.feePct ?? 14), setup: a.setupFee === 0 ? 0 : setup, setupWords, marketing: "Included" };
    case "rent_collect":
      return { name: "Rent collection", fee: vat(a.feePct ?? 12), setup: a.setupFee === 0 ? 0 : setup, setupWords, marketing: "Included" };
    case "tenant_find":
      return { name: "Tenant find", fee: 0, setup: ask ? Math.max(600, Math.round(ask * 0.9)) : null, setupWords: "90% of the first month's rent, £600 minimum", marketing: "Included" };
    default:
      return { name: "Marketing only", fee: 0, setup: null, setupWords: "As agreed", marketing: "Included" };
  }
}

/** A UK mobile as WhatsApp wants it, or nothing. */
const whatsappOf = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  if (/^07\d{9}$/.test(d)) return "44" + d.slice(1);
  if (/^447\d{9}$/.test(d)) return d;
  return "";
};

export function fileData(opts: {
  view: LandlordView;
  first: string;
  full: string;
  appraisal?: MarketAppraisal | null;
  deck?: PresentDeck | null;
  /** The documents asked for, by kind and title, so an upload is filed as the right thing. */
  asked?: { kind: string; title: string }[];
  sample?: boolean;
  /** The sample's stand-ins, never a real landlord's. */
  sampleFigure?: FileData["figure"];
  sampleService?: FileData["service"];
}): FileData {
  const { view, appraisal = null, deck = null, asked = [], sample = false } = opts;
  const stage = Math.max(0, ORDER.indexOf(view.stage));
  const where = splitAddress(view.property.address, view.property.postcode);
  const facts = view.property.facts.join(" ");
  const beds = deck?.property.beds ?? (Number.parseInt(/(\d+)\s*bed/i.exec(facts)?.[1] ?? "", 10) || null);
  const baths = deck?.property.baths ?? (Number.parseInt(/(\d+)\s*bath/i.exec(facts)?.[1] ?? "", 10) || null);
  const a = view.agent;
  const agentFirst = a?.name ? firstNameOf(a.name) : "your agent";
  const phone = a?.phone ?? "";

  /* The plan's figures, the appraisal presentation's own reading of the deck. */
  const dd = deck ? deckData(deck, null, { firm: { homes: null }, appraisal }) : null;
  const figure = sample
    ? opts.sampleFigure ?? null
    : dd?.figure ?? (appraisal?.valuation ? { low: appraisal.valuation, high: appraisal.valuation, ask: appraisal.valuation, weeks: "" } : null);
  const service = sample ? opts.sampleService ?? null : serviceOf(appraisal, figure?.ask ?? null);

  const signedDoc = view.documents.find((d) => /terms of business/i.test(d.title));
  const signed = stage >= 2 || signedDoc?.state === "uploaded";
  const canSign = !signed && Boolean(view.contractUrl || view.steps.some((s) => s.action === "sign"));
  const signHref = canSign ? (sample ? "#sample-sign" : "/landlord?sign=1") : null;

  const docs: FileDoc[] = view.documents
    .filter((d) => !/terms of business|bank details/i.test(d.title))
    .map((d) => {
      const kind = asked.find((x) => x.title === d.title)?.kind ?? (/photo id/i.test(d.title) ? "id" : /ownership/i.test(d.title) ? "ownership" : /gas/i.test(d.title) ? "gas" : /eicr|electrical/i.test(d.title) ? "eicr" : /epc|energy/i.test(d.title) ? "epc" : "other");
      const got = d.state !== "missing";
      const sub = clean(d.sub);
      return {
        k: kind,
        name: d.title,
        sub: got ? "" : sub.replace(/^Missing\s*·\s*/i, ""),
        file: got ? sub.split(" · ")[0] || "Received" : null,
        date: got ? sub.split(" · ").slice(1).join(" · ") : undefined,
        href: d.href ?? null,
        ...(d.state === "pending" ? { flag: "Being checked" } : {}),
      };
    });

  /* What we have sent them. */
  const fromUs: FileData["fromUs"] = [];
  if (signedDoc) fromUs.push(["Terms of Business", signed ? clean(signedDoc.sub) || "Signed" : canSign ? "Ready for you to sign" : "On its way from " + agentFirst, signed ? "open" : canSign ? "sign" : "open", signed ? signedDoc.href ?? null : null]);
  if (deck) fromUs.push(["Your letting plan", `From ${agentFirst}${deck.createdAt ? " · " + day(deck.createdAt) : ""}`, "book", null]);

  /* The next step: the current file's first step, in the design's card. */
  const s0 = view.steps.find((s) => !s.done) ?? null;
  const next: FileData["next"] = !s0
    ? { title: "Nothing needed from you", sub: "We'll let you know the moment there's something to do.", action: "none", label: "", href: null }
    : s0.action === "sign" || s0.id === "sign"
      ? { title: "Sign your contract", sub: "Review and sign your management terms. It takes two minutes.", action: canSign ? "sign" : "none", label: "Sign now", href: signHref }
      : s0.action === "presentation" || s0.id === "presentation"
        ? { title: "Read your letting plan", sub: "Your figure, the market and what happens next, in one place.", action: deck ? "book" : "link", label: "Open The Plan", href: s0.href }
        : s0.id === "compliance"
          ? { title: clean(s0.label), sub: clean(s0.sub), action: "documents", label: "Upload", href: null }
          : s0.action === "message" || s0.id === "message"
            ? { title: clean(s0.label), sub: clean(s0.sub), action: "messages", label: "Message " + agentFirst, href: null }
            : { title: clean(s0.label), sub: clean(s0.sub), action: s0.href ? "link" : "none", label: "Open", href: s0.href };

  /* Messages, a day line before each new day. */
  const messages: FileData["messages"] = [];
  let last = "";
  for (const m of [...(view.messages ?? [])].sort((x, y) => x.sentAt.localeCompare(y.sentAt))) {
    const head = dayHead(m.sentAt);
    if (head !== last) messages.push([head]);
    last = head;
    messages.push([m.from === "landlord" ? "me" : "them", clock(m.sentAt), m.body]);
  }

  const journey = JOURNEY.map(([t, d, you, us], k) => {
    const stop = view.journey.find((j) => j.id === ORDER[k]);
    const when = k === 0 ? day(appraisal?.valuedAt ?? appraisal?.appointmentAt) || clean(view.property.valuedOn) : k === 1 && signed ? (signedDoc?.sub.split("•")[1]?.trim() ?? "") : "";
    return [t, d, you, us, stop?.state === "done" || k < stage ? when : ""] as [string, string, string, string, string];
  });

  /* The Plan, from the presentation. */
  let plan: FileData["plan"] = null;
  if (dd) {
    const m = dd.market;
    const bandTotal = m ? m.bands.reduce((s, b) => s + b.n, 0) : 0;
    const under4 = m ? (m.bands[0]?.n ?? 0) + (m.bands[1]?.n ?? 0) : 0;
    const mine = m && beds ? m.rentByBed.find((r) => r.label === `${beds} bed` || (beds >= 5 && /^5\+/.test(r.label))) ?? null : null;
    plan = {
      issue: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: LONDON }).format(new Date(deck!.createdAt || Date.now())),
      market: m
        ? { area: m.area, advertised: m.advertised, under4, bandTotal, rentByBed: m.rentByBed, mine: mine ? { label: mine.label, rent: mine.rent } : null, agents: m.agents.slice(0, 3), pulled: m.pulled }
        : null,
      comps: dd.comps
        .filter((c) => c.rent != null)
        .slice(0, 4)
        .map((c) => [c.addr, c.rent as number, c.status === "let agreed" ? "Let agreed" : c.days != null ? `On for ${c.days} days` : "On the market"]),
      loves: dd.loves,
      fixes: dd.fixes,
      notes: (deck!.material ?? [])
        .filter((r) => r.value && !/^[-—]$/.test(r.value.trim()))
        .slice(0, 3)
        .map((r) => [clean(r.label), clean(r.value)] as [string, string]),
    };
  }

  return {
    sample,
    appraisalId: view.appraisalId ?? appraisal?.id ?? null,
    landlord: { first: opts.first || firstNameOf(opts.full) || "there", full: opts.full },
    agent: {
      first: agentFirst,
      name: a?.name ?? "Your letting agent",
      role: a?.title?.trim() || "Letting Expert",
      initials: a?.name ? initialsOf(a.name) : "TLE",
      phone,
      email: a?.email ?? "",
      whatsapp: whatsappOf(phone),
      replies: "Replies the same working day, Monday to Friday",
      photo: a?.photo ?? "",
    },
    property: {
      street: where.street,
      no: /^\d+[a-z]?\b/i.exec(where.street)?.[0] ?? "",
      town: where.town || where.area,
      postcode: view.property.postcode,
      area: where.area || where.town,
      type: clean(deck?.property.propertyType ?? view.property.facts[0] ?? ""),
      beds,
      baths,
      epc: dd?.property.epc ?? "",
      valued: day(appraisal?.valuedAt ?? appraisal?.appointmentAt) || clean(view.property.valuedOn),
      image: view.property.image ?? "",
    },
    service,
    figure,
    readiness: Math.max(0, Math.min(100, Math.round(view.snapshot.readinessPct))),
    stage,
    signed,
    signHref,
    next,
    journey,
    docs,
    fromUs,
    messages,
    plan,
  };
}

let page: string | null = null;
/** The design's page with this landlord's data in it. `<` is escaped so no value can close the script. */
export function fileHtml(d: FileData): string {
  if (!page || process.env.NODE_ENV !== "production") page = readFileSync(path.join(process.cwd(), "lib/decks/landlord-file.html"), "utf8");
  const json = JSON.stringify(d)
    .replace(/</g, "\\u003c")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
  return page.replace("/*__FILE_DATA__*/null", () => json);
}
