/**
 * THE MARKET APPRAISALS DEMO - the valuation, from the board to the terms,
 * on the real screens with nothing saved or sent.
 *
 * James, 11 Oct 2026: the tour's valuation tablet "should be almost like a live
 * reprint of the actual system ... it will show me where to click and how to do
 * it ... they need to be able to actually go through the system and almost do
 * a dummy run". So the Market Appraisals board, Book an appraisal, the file and
 * recording the figure run here the way the Back Office screens do
 * (components/showroom/demo/DemoNet): every /api call they make is answered
 * from this invented book, and anything not answered is refused.
 *
 * ── What it copies, and keeps in step with ──────────────────────────────
 *
 * The stage, the line saying why and the ticks are a port of
 * lib/appraisal-stage (deriveAppraisalStage and signalsFor), which is
 * server-only. When that changes, change `stageOf` and `ticksOf` here.
 * The figure rules are app/api/appraisals PATCH (money, pct, service level).
 *
 * The sample is the Showroom's own: Raj Chauhan's 8 Recreation Terrace, Sam
 * Whitaker the agent, and the OS's test-file figures (£1,250 pcm, fully
 * managed, 12%, £750 set-up; lib/test-files). The other files on the board are
 * invented too: Ofcom drama numbers, example.com emails. Times run backwards
 * from now, so nothing goes stale.
 */

import type { AppraisalTick, MarketAppraisal, MaStage, ServiceLevel } from "@/lib/market-appraisal";
import { SERVICE_LEVELS } from "@/lib/market-appraisal";
import { CAST } from "@/lib/showroom/demo-world";
import type { DemoReply } from "@/lib/showroom/demo-api";
import { buildGuide } from "@/lib/ma-guide";
import type { Comparable, MaResearch, MarketListing, RecentLet } from "@/lib/ma-research";
import type { MarketPicture } from "@/lib/market-picture";

export const RAJ_APPRAISAL = "demo-ma-raj";
export const RAJ_LEAD = "os-demo-raj";
export const APPRAISAL_MOMENTS = ["board", "booked", "visit", "valued", "terms", "signed"] as const;

const H = 3_600_000;
const D = 24 * H;
const iso = (t: number) => new Date(t).toISOString();

interface Deck { kind: "pre-appraisal" | "appraisal" | "post-appraisal"; token: string; createdAt: string; opens: number; firstOpenedAt: string | null }
interface Send { kind: string; state: "queued" | "sent" | "declined"; sendAt: string; sentAt: string | null; createdAt: string }

export interface DemoAppraisal {
  ma: MarketAppraisal;
  decks: Deck[];
  sends: Send[];
  confirmedAt: string | null;
  terms: { firstSentAt: string; lastSentAt: string; count: number } | null;
  signed: { name: string; at: string } | null;
  facts: { type: string; beds: number; baths: number };
  /** The agent's half of the terms, signed on the stand-in (components/landlord/DocusealEmbed). */
  agentSignedAt?: string | null;
}

export interface AppraisalBook {
  files: DemoAppraisal[];
  /** os_case_state, by kind and id (the builder's ticks, the facts). */
  cases: Record<string, unknown>;
  /** Landlords the wizard made, so a second booking finds them. */
  contacts: { id: string; name: string; email: string; mobile: string; address: string }[];
  seq: number;
}

function bare(id: string, o: Partial<MarketAppraisal> & Pick<MarketAppraisal, "landlord" | "address" | "postcode" | "appointmentAt">, now: number): MarketAppraisal {
  return {
    id, leadId: `os-${id}`, agent: CAST.agent.name, landlordEmail: null, landlordMobile: null, stage: "booked",
    valuation: null, serviceLevel: null, feePct: null, setupFee: null, valuationNote: null, valuedAt: null, valuedBy: null,
    rexPropertyId: null, listingId: null, presentToken: null, termsSentAt: null, createdAt: iso(now - 3 * D), ...o,
  };
}

const deck = (kind: Deck["kind"], at: number, opens = 0): Deck => ({ kind, token: "sample", createdAt: iso(at), opens, firstOpenedAt: opens ? iso(at + 2 * H) : null });

/** Everything on the board at moment `at`. */
export function appraisalBook(at: number, now = Date.now()): AppraisalBook {
  const day = (n: number, h: number) => { const d = new Date(now + n * D); d.setHours(h, 30, 0, 0); return d.getTime(); };
  const files: DemoAppraisal[] = [
    {
      ma: bare("demo-ma-1", { landlord: "Priya Shah", address: "27 Abington Avenue, Nottingham", postcode: "NG7 1HS", appointmentAt: iso(day(2, 10)), landlordEmail: "priya.sample@example.com", landlordMobile: "07700 900211" }, now),
      decks: [], sends: [], confirmedAt: iso(now - 26 * H), terms: null, signed: null, facts: { type: "Terraced", beds: 3, baths: 1 },
    },
    {
      ma: bare("demo-ma-2", { landlord: "Helen Marsh", address: "14 Orchard Close, Nottingham", postcode: "NG5 2LP", appointmentAt: iso(day(1, 15)), landlordEmail: "helen.sample@example.com", landlordMobile: "07700 900322" }, now),
      decks: [deck("pre-appraisal", now - 20 * H, 1)], sends: [{ kind: "pre-appraisal", state: "sent", sendAt: iso(now - 18 * H), sentAt: iso(now - 18 * H), createdAt: iso(now - 20 * H) }],
      confirmedAt: iso(now - 30 * H), terms: null, signed: null, facts: { type: "Semi-detached", beds: 3, baths: 2 },
    },
    {
      ma: bare("demo-ma-3", { landlord: "Tom Becker", address: "12 Dover Close, Nottingham", postcode: "NG9 4DT", appointmentAt: iso(now - 2 * D), landlordEmail: "tom.sample@example.com", landlordMobile: "07700 900433" }, now),
      decks: [deck("pre-appraisal", now - 4 * D, 2)], sends: [{ kind: "pre-appraisal", state: "sent", sendAt: iso(now - 4 * D), sentAt: iso(now - 4 * D), createdAt: iso(now - 4 * D) }],
      confirmedAt: iso(now - 5 * D), terms: null, signed: null, facts: { type: "Flat", beds: 2, baths: 1 },
    },
    {
      ma: bare("demo-ma-4", {
        landlord: "Grace Oduya", address: "8 Cedar Way, Nottingham", postcode: "NG3 6CW", appointmentAt: iso(now - 4 * D), landlordEmail: "grace.sample@example.com", landlordMobile: "07700 900544",
        valuation: 1100, serviceLevel: "full_managed", feePct: 12, setupFee: 750, valuedAt: iso(now - 4 * D + 2 * H), valuedBy: CAST.agent.name, termsSentAt: iso(now - 3 * D),
      }, now),
      decks: [deck("pre-appraisal", now - 6 * D, 1), deck("post-appraisal", now - 3 * D, 3)], sends: [{ kind: "pre-appraisal", state: "sent", sendAt: iso(now - 6 * D), sentAt: iso(now - 6 * D), createdAt: iso(now - 6 * D) }],
      confirmedAt: iso(now - 7 * D), terms: { firstSentAt: iso(now - 3 * D), lastSentAt: iso(now - 3 * D), count: 1 }, signed: null, facts: { type: "Detached", beds: 4, baths: 2 },
    },
    {
      ma: bare("demo-ma-5", { landlord: "Daniel Kerr", address: "44 Rosedale Grove, Nottingham", postcode: "NG8 1RG", appointmentAt: iso(day(4, 12)), landlordEmail: "daniel.sample@example.com", landlordMobile: "07700 900655" }, now),
      decks: [], sends: [], confirmedAt: null, terms: null, signed: null, facts: { type: "Terraced", beds: 2, baths: 1 },
    },
  ];

  /* Raj: not on the board until he is booked; then he moves on with each moment. */
  if (at >= 1) {
    const visit = at >= 2 ? now - 40 * 60_000 : day(1, 11);
    const raj: DemoAppraisal = {
      ma: bare(RAJ_APPRAISAL, {
        leadId: RAJ_LEAD, landlord: CAST.landlord.name, address: `${CAST.property}, Nottingham`, postcode: CAST.postcode, appointmentAt: iso(visit),
        landlordEmail: CAST.landlord.email, landlordMobile: CAST.landlord.phone, createdAt: iso(now - (at >= 2 ? 2 * D : 10 * 60_000)),
      }, now),
      decks: [], sends: [], confirmedAt: at >= 2 ? iso(now - 2 * D) : null, terms: null, signed: null, facts: { type: "Terraced", beds: 2, baths: 1 },
    };
    if (at >= 2) {
      raj.decks.push(deck("pre-appraisal", now - 2 * D + H, 2), deck("appraisal", now - D, 1));
      raj.sends.push({ kind: "pre-appraisal", state: "sent", sendAt: iso(now - 2 * D + 3 * H), sentAt: iso(now - 2 * D + 3 * H), createdAt: iso(now - 2 * D + H) });
    }
    if (at >= 3) Object.assign(raj.ma, { valuation: 1250, serviceLevel: "full_managed", feePct: 12, setupFee: 750, valuedAt: iso(now - 10 * 60_000), valuedBy: CAST.agent.name });
    if (at >= 4) {
      raj.decks.push(deck("post-appraisal", now - 8 * 60_000, 0));
      raj.ma.termsSentAt = iso(now - 5 * 60_000);
      raj.terms = { firstSentAt: raj.ma.termsSentAt, lastSentAt: raj.ma.termsSentAt, count: 1 };
      raj.agentSignedAt = iso(now - 12 * 60_000);
    }
    if (at >= 5) raj.signed = { name: CAST.landlord.name, at: iso(now - 2 * 60_000) };
    files.unshift(raj);
  }
  return { files, cases: {}, contacts: [], seq: 100 };
}

/* ─────────────────── the stage and the ticks (lib/appraisal-stage) ─────────────────── */

function stageOf(f: DemoAppraisal, now: number): { stage: MaStage; why: string } {
  const { ma } = f;
  if (ma.stage === "lost") return { stage: "lost", why: "Marked lost." };
  if (ma.stage === "won") return { stage: "won", why: "Marked won." };
  if (f.signed) return { stage: "takeon", why: "Terms signed. The landlord still has property questions to answer - they are chased by email until they do." };
  if (ma.valuation != null) return { stage: "post_appraisal", why: "A figure has been recorded." };
  if (ma.appointmentAt && new Date(ma.appointmentAt).getTime() < now) return { stage: "appraisal", why: "The visit has happened. No figure recorded yet." };
  if (f.decks.some((d) => d.kind === "pre-appraisal")) return { stage: "pre_appraisal", why: "The pre-presentation is made. Record a video, or send it without one." };
  return { stage: "pre_appraisal", why: "Booked and in the diary. The pre-presentation is next." };
}

const dayWords = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");

function ticksOf(f: DemoAppraisal, now: number): Pick<MarketAppraisal, "ticks" | "videoState" | "preSend" | "nudgeAt"> {
  const { ma } = f;
  const ticks: AppraisalTick[] = [];
  const tick = (stage: MaStage, id: string, label: string, done: boolean, at: string | null = null, detail?: string) => ticks.push({ id, stage, label, done, at, ...(detail ? { detail } : {}) });
  const latest = (kind: Deck["kind"]) => f.decks.filter((d) => d.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const pre = latest("pre-appraisal"), post = latest("post-appraisal");
  const declined = f.sends.some((s) => s.kind === "video-chase" && s.state === "declined");
  const visitPassed = Boolean(ma.appointmentAt && new Date(ma.appointmentAt).getTime() < now);

  tick("booked", "video", "Record a personalised video for your appraisal", declined, null, declined ? "sending without one" : undefined);
  if (f.confirmedAt) tick("booked", "send-confirmation", "Confirmation sent", true, f.confirmedAt);
  const preMail = f.sends.find((s) => s.kind === "pre-appraisal");
  const queued = preMail && !preMail.sentAt && preMail.state === "queued" ? preMail : null;
  const visit = ma.appointmentAt ? new Date(ma.appointmentAt).getTime() : 0;
  const would = visit > now ? iso(now + (visit - now < 3 * H ? 15 * 60_000 : 2 * H)) : null;
  const preSend: MarketAppraisal["preSend"] = preMail?.sentAt ? { state: "sent", at: preMail.sentAt, opens: pre?.opens ?? 0 } : queued ? { state: "queued", at: queued.sendAt } : { state: "none", at: would };
  tick("pre_appraisal", "pre-made", "Pre-presentation made", Boolean(pre), pre?.createdAt ?? null);
  tick("pre_appraisal", "pre-sent", "Sent to the landlord", Boolean(preMail?.sentAt), preMail?.sentAt ?? null, queued ? `goes out ${dayWords(queued.sendAt)}` : undefined);
  tick("pre_appraisal", "pre-opened", "Opened by the landlord", Boolean(pre && pre.opens > 0), pre?.firstOpenedAt ?? null, pre && pre.opens > 1 ? `opened ${pre.opens} times` : undefined);
  tick("appraisal", "visit", "Visit happened", visitPassed, visitPassed ? ma.appointmentAt : null, !ma.appointmentAt ? "no date on the booking" : !visitPassed ? dayWords(ma.appointmentAt) : undefined);
  tick("appraisal", "figure", "Figure recorded", ma.valuation != null, ma.valuedAt, ma.valuation != null ? `£${ma.valuation.toLocaleString("en-GB")} pcm` : undefined);
  tick("post_appraisal", "post-sent", "Post-appraisal deck sent", Boolean(post), post?.createdAt ?? null);
  tick("post_appraisal", "post-opened", "Opened by the landlord", Boolean(post && post.opens > 0), post?.firstOpenedAt ?? null);
  tick("post_appraisal", "terms-sent", "Terms sent for signature", Boolean(ma.termsSentAt), ma.termsSentAt ?? null);
  tick("post_appraisal", "terms-signed", "Terms signed", Boolean(f.signed), f.signed?.at ?? null, f.signed ? `by ${f.signed.name}` : undefined);
  tick("takeon", "questions", "Property questions answered", false, null);
  tick("aml", "id", "ID on the landlord portal", false);
  tick("aml", "ownership", "Proof of ownership on the portal", false);
  tick("won", "listed", "Listed", false);
  return { ticks, videoState: declined ? "declined" : "none", preSend, nudgeAt: null };
}

function staged(f: DemoAppraisal, now = Date.now()): MarketAppraisal {
  const s = stageOf(f, now);
  return { ...f.ma, stage: s.stage === "lost" || s.stage === "won" ? s.stage : f.ma.stage, liveStage: s.stage, stageWhy: s.why, ...ticksOf(f, now), unreadMessages: 0 };
}

/* ─────────────────── the builder's market (lib/ma-research, lib/market-picture) ───────────────────
   Raj's side of town as the builder reads it: what we have let ourselves (the comparables the guide is
   worked out from), what is advertised near him now, what has let, and the area's numbers. Invented,
   at the scale of a three-bed terrace in a Nottingham sector, and laid out from now. Photographs are
   the handful of real house pictures the demos already use (public/rex). */
const PHOTOS = ["295517", "295547", "299698", "300102", "325696", "334480", "339326", "367819", "415656", "480975"].map((id) => `/rex/${id}.jpg`);
const STREETS = ["Larkfield Road", "Meadow Row", "Chapel Terrace", "Orchard Street", "Willow Grove", "Bramley Close", "Foundry Lane", "Queen's Walk", "Mill Street", "Hawthorn Avenue"];

function research(f: DemoAppraisal, now: number): MaResearch {
  const day = (n: number) => new Date(now - n * D).toISOString().slice(0, 10);
  const comps: Comparable[] = [
    [1, 1175, 9, true, "C"], [2, 1225, 14, true, "D"], [3, 1250, 6, true, "C"], [4, 1295, 11, false, "C"], [5, 1200, 18, true, "D"], [6, 1325, 8, true, "B"], [7, 1150, 21, true, "D"],
  ].map(([i, rent, days, agreed, epc], k) => ({
    id: `c-${k}`, name: `${10 + Number(i) * 7} ${STREETS[Number(i)]}`, locality: k < 5 ? "Nottingham NG2 3" : "Nottingham NG2 4", rentMonthly: Number(rent),
    rentDisplay: `£${Number(rent).toLocaleString("en-GB")} pcm`, daysOnMarket: Number(days), letAgreed: Boolean(agreed), epcRating: String(epc), nearness: (k < 5 ? "sector" : "district") as Comparable["nearness"],
  }));
  const onMarketNearby: MarketListing[] = [
    [0, 2, "Terraced house", 1250, "on market", 6, "Castle Homes"], [1, 2, "Terraced house", 1195, "let agreed", 12, "Pemberton Lettings"], [2, 2, "Terraced house", 1175, "on market", 3, "Riverside Property"],
    [3, 3, "Semi-detached house", 1350, "on market", 21, "Castle Homes"], [4, 3, "Terraced house", 1225, "let agreed", 9, "The Letting Experts"], [5, 4, "Terraced house", 1450, "on market", 15, "Pemberton Lettings"],
    [6, 2, "Flat", 1050, "on market", 30, "Riverside Property"], [7, 2, "Terraced house", 1275, "let agreed", 5, "Hollins & Co"],
  ].map(([i, beds, type, rent, status, days, agent], k) => ({
    address: `${3 + k * 4} ${STREETS[(Number(i) + 3) % STREETS.length]}, Nottingham`, postcode: `NG2 3${"ABDEFGHJ"[k]}${"QRSTUWXY"[k]}`, beds: Number(beds), type: String(type), rent: Number(rent),
    image: PHOTOS[k % PHOTOS.length], status: status as MarketListing["status"], listingId: 900100 + k, listedOn: day(Number(days)), daysListed: Number(days), agent: String(agent),
    reducedAt: k === 3 ? day(4) : null, lat: CAST.lat + (k % 3 - 1) * 0.004, lon: CAST.lng + (k % 4 - 1.5) * 0.005,
  }));
  const recentlyLet: RecentLet[] = [[1, 2, 1225, 7, 12], [2, 2, 1250, 11, 26], [3, 2, 1180, 5, 40], [4, 2, 1295, 9, 55], [5, 3, 1450, 14, 71]].map(([i, beds, rent, toLet, ago]) => ({
    address: `${20 + Number(i) * 3} ${STREETS[(Number(i) + 5) % STREETS.length]}, Nottingham`, postcode: "NG2 3", beds: Number(beds), rent: Number(rent), daysToLet: Number(toLet), letOn: day(Number(ago)),
  }));
  return {
    address: f.ma.address, postcode: f.ma.postcode, sector: "NG2 3", subject: { hsId: 9001, label: `${f.ma.address}, ${f.ma.postcode}` }, addressWarning: null,
    areaAverage: { beds: 2, avgRent: 1215 },
    marketScopes: [
      { area: "NG2", level: "district", avgRent: 1190, toLetNow: 142, letLast12m: 1310, monthsOfSupply: 1.3 },
      { area: "NG2 3", level: "sector", avgRent: 1215, toLetNow: 21, letLast12m: 198, monthsOfSupply: 1.27 },
      { area: f.ma.postcode, level: "postcode", avgRent: null, toLetNow: 2, letLast12m: 9, monthsOfSupply: null },
    ],
    scopeBeds: 2, market: { onMarket: 21, offMarket: 177, availabilityPct: 11 }, onMarketNearby,
    /* What the records hold about the house itself (lib/matinfo's groups), so the first screen is the property, not a blank. */
    material: {
      hsId: 9001, known: 18, possible: 26, bedrooms: 2, lat: CAST.lat, lon: CAST.lng, valuation: null,
      groups: [
        { id: "what", title: "What it is", fields: [{ label: "Property type", value: "Terraced house", headline: true }, { label: "Bedrooms", value: "2", headline: true }, { label: "Floor area", value: "74 m²", headline: true }, { label: "Built", value: "1900 to 1929" }, { label: "Garden faces", value: "South west" }] },
        { id: "legal", title: "Tenure and tax", fields: [{ label: "Tenure", value: "Freehold", headline: true }, { label: "Council tax band", value: "B", headline: true }, { label: "Council", value: "Nottingham City" }] },
        { id: "epc", title: "Energy", fields: [{ label: "EPC rating", value: "D (62)", headline: true }, { label: "Could be", value: "B (84)" }, { label: "Heating", value: "Boiler and radiators" }, { label: "Heating fuel", value: "Mains gas" }] },
        { id: "utilities", title: "Utilities and connectivity", fields: [{ label: "Broadband", value: "Full fibre available" }, { label: "Water", value: "Severn Trent" }] },
        { id: "build", title: "Construction", fields: [{ label: "Walls", value: "Solid brick, as built" }, { label: "Roof", value: "Pitched, 200 mm loft insulation" }, { label: "Windows", value: "Fully double glazed" }] },
        { id: "risk", title: "Risks and restrictions", fields: [{ label: "Flood risk", value: "Very low" }] },
      ],
      compliance: { epcRating: "D", epcScore: 62, epcAssessedOn: new Date(now - 1400 * D).toISOString().slice(0, 10), potentialRating: "B", potentialScore: 84, floodRisk: "Very low", conservationArea: null, leaseYearsRemaining: null },
    },
    marketFilters: { appliedRadius: false }, recentlyLet, subjectPoint: { lat: CAST.lat, lon: CAST.lng }, comparables: comps, guide: buildGuide(comps), pulledAt: iso(now),
  };
}

function marketPicture(postcode: string, now: number): MarketPicture {
  const s = (median: number, n: number, low: number, high: number) => ({ median, n, low, high });
  const scope = (area: string, level: "district" | "sector", k: number) => ({
    area, level, advertised: Math.round(160 * k), letAgreed: Math.round(58 * k), daysAdvertised: s(19, Math.round(150 * k), 7, 41),
    bands: { newIn14: Math.round(52 * k), days15to28: Math.round(41 * k), days29to84: Math.round(48 * k), over84: Math.round(15 * k), undated: Math.round(4 * k) },
    houses: Math.round(96 * k), flats: Math.round(64 * k),
    beds: [{ beds: 1, n: Math.round(31 * k), rent: s(895, Math.round(31 * k), 825, 975) }, { beds: 2, n: Math.round(52 * k), rent: s(1195, Math.round(52 * k), 1125, 1295) }, { beds: 3, n: Math.round(57 * k), rent: s(1395, Math.round(57 * k), 1300, 1495) }, { beds: 4, n: Math.round(20 * k), rent: s(1650, Math.round(20 * k), 1550, 1800) }],
    rent: s(1195, Math.round(160 * k), 950, 1395), reduced: Math.round(17 * k),
    agents: [{ agent: "Castle Homes", n: Math.round(34 * k), ours: false }, { agent: "Pemberton Lettings", n: Math.round(29 * k), ours: false }, { agent: "The Letting Experts", n: Math.round(24 * k), ours: true }, { agent: "Riverside Property", n: Math.round(18 * k), ours: false }],
  });
  return { postcode, scopes: [scope("NG2", "district", 1), scope("NG2 3", "sector", 0.14)], ourLetSpeed: { median: 11, n: 23 }, pulledAt: iso(now) };
}

/* ─────────────────────────── the network ─────────────────────────── */

const ok = (json: Record<string, unknown>, sent: string[] = [], did?: string): DemoReply => ({ status: 200, json: { ok: true, ...json }, sent, did });
const no = (error: string, status = 400): DemoReply => ({ status, json: { ok: false, error }, sent: [] });
const str = (v: unknown) => String(v ?? "").trim();

const money = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const pct = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
};

/* Addresses the lookup offers: Raj's first, then a handful on his side of town,
   then whatever was typed, so any address an agent tries can be picked. */
const STREET = [`${CAST.property}, Nottingham`, "10 Recreation Terrace, Nottingham", "6 Recreation Terrace, Nottingham", "8 Recreation Street, Nottingham", "8 Recreation Road, Nottingham"];

function emailHtml(f: { landlord: string; address: string; appointmentAt: string | null }): string {
  const when = f.appointmentAt ? new Date(f.appointmentAt).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "the time we agreed";
  const first = f.landlord.split(/\s+/)[0];
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2e2422"><p>Hi ${first},</p><p>Thank you for booking your market appraisal at ${f.address}. I'll see you on ${when}.</p><p>Before I arrive you'll get a short presentation about your home and the market around it, so we can make the most of our time together.</p><p>Kind regards,<br>${CAST.agent.name}<br>The Letting Experts</p></div>`;
}

/** An appraisal call, answered; null when the path is not one of these. */
export function answerAppraisals(book: AppraisalBook, method: string, url: URL, body: unknown): DemoReply | null {
  const p = url.pathname, sp = url.searchParams, b = (body && typeof body === "object" && !(body instanceof FormData) ? body : {}) as Record<string, unknown>;
  const now = Date.now();
  const byId = (id: string) => book.files.find((f) => f.ma.id === id) ?? null;
  const byRef = (ref: string) => book.files.find((f) => f.ma.id === ref || f.ma.leadId === ref) ?? null;

  /* ── who is signed in, and their preferences ── */
  if (p === "/api/auth/me") return ok({ user: { id: "u-demo-sam", name: CAST.agent.name, email: CAST.agent.email, role: "agent", photo: null, phone: CAST.agent.phone } });
  if (p === "/api/prefs") return ok({ prefs: {}, signedIn: false });

  /* ── the board and one file ── */
  if (p === "/api/appraisals" && method === "GET") return ok({ appraisals: book.files.map((f) => staged(f, now)) });
  const one = p.match(/^\/api\/appraisals\/([^/]+)$/);
  if (one && method === "GET") {
    const f = byId(decodeURIComponent(one[1]));
    return f ? ok({ appraisal: staged(f, now) }) : no("No such appraisal.", 404);
  }
  if (p === "/api/appraisals" && method === "POST") {
    const landlord = str(b.landlord), address = str(b.address);
    if (!landlord || !address) return no("An appraisal needs a landlord and an address.");
    const id = landlord.toLowerCase().includes("raj") && !byId(RAJ_APPRAISAL) ? RAJ_APPRAISAL : `demo-ma-${++book.seq}`;
    const contact = book.contacts.find((c) => `os-${c.id}` === b.leadId || c.name === landlord);
    const f: DemoAppraisal = {
      ma: bare(id, { leadId: str(b.leadId) || `os-${id}`, landlord, address, postcode: str(b.postcode), agent: str(b.agent) || CAST.agent.name, appointmentAt: str(b.appointmentAt) || null, landlordEmail: contact?.email ?? null, landlordMobile: contact?.mobile ?? null, createdAt: iso(now) }, now),
      decks: [], sends: [], confirmedAt: null, terms: null, signed: null, facts: { type: "Terraced", beds: 2, baths: 1 },
    };
    book.files.unshift(f);
    const pre = { appraisalId: id, self: true, agentName: CAST.agent.name, landlord, address, deck: null, state: "none", at: ticksOf(f, now).preSend?.at ?? null, told: false };
    return ok({ appraisal: staged(f, now), pre, confirmation: null, rexDiary: null, outlook: { ok: true, detail: "In your Outlook calendar." } }, [], "booked");
  }
  if (p === "/api/appraisals" && method === "PATCH") {
    const f = byId(str(b.id));
    if (!f) return no("No such appraisal.", 404);
    if (b.outcome !== undefined) {
      if (b.outcome !== "won" && b.outcome !== "lost" && b.outcome !== null) return no("An outcome is won, lost, or null to reopen.");
      f.ma.stage = b.outcome ?? "booked";
      return ok({ appraisal: staged(f, now) }, [], `outcome_${b.outcome ?? "reopened"}`);
    }
    if (b.valuation !== undefined) f.ma.valuation = money(b.valuation) ?? null;
    if (b.serviceLevel !== undefined) f.ma.serviceLevel = (SERVICE_LEVELS.find((s) => s.id === b.serviceLevel)?.id ?? null) as ServiceLevel | null;
    if (b.feePct !== undefined) f.ma.feePct = pct(b.feePct) ?? null;
    if (b.setupFee !== undefined) f.ma.setupFee = money(b.setupFee) ?? null;
    if (b.valuationNote !== undefined) f.ma.valuationNote = str(b.valuationNote).slice(0, 2000) || null;
    if (b.rexPropertyId !== undefined) f.ma.rexPropertyId = str(b.rexPropertyId).replace(/\D/g, "") || null;
    if (b.valuation !== undefined || b.serviceLevel !== undefined) { f.ma.valuedAt = iso(now); f.ma.valuedBy = CAST.agent.name; }
    return ok({ appraisal: staged(f, now) }, [], b.valuation !== undefined ? "valued" : "saved");
  }

  /* ── the file's side panels ── */
  const sub = p.match(/^\/api\/appraisals\/([^/]+)\/([a-z-]+)$/);
  if (sub) {
    const f = byId(decodeURIComponent(sub[1]));
    if (!f) return no("No such appraisal.", 404);
    const what = sub[2];
    if (what === "sent") {
      const items = f.confirmedAt ? [{ id: "confirm-1", subject: `Your market appraisal at ${f.ma.address}`, sentAt: f.confirmedAt, label: "Confirmation" }] : [];
      if (sp.get("email")) return f.confirmedAt ? ok({ email: { ...items[0], html: emailHtml(f.ma), to: f.ma.landlordEmail } }) : no("That email isn't on file.", 404);
      return ok({ to: f.ma.landlordEmail, items });
    }
    if (what === "terms" && method === "GET") {
      const landlord = { role: "landlord", name: f.ma.landlord, email: f.ma.landlordEmail ?? "", status: f.signed ? "completed" : f.terms ? "sent" : "awaiting", sentAt: f.terms?.lastSentAt ?? null, openedAt: null, completedAt: f.signed?.at ?? null, embedSrc: null };
      const signedAt = f.agentSignedAt ?? (f.terms ? f.terms.firstSentAt : null);
      const agent = { role: "agent", name: CAST.agent.name, email: CAST.agent.email, status: signedAt ? "completed" : "awaiting", sentAt: null, openedAt: null, completedAt: signedAt, embedSrc: signedAt ? null : `demo:${f.ma.id}` };
      return ok({ connected: true, sendUnlocked: f.ma.valuation != null && Boolean(f.ma.landlordEmail), parties: [agent, landlord], sent: f.terms, nudge: { count: 0, autoCount: 0, lastAt: null, lastBy: null }, nextNudgeAt: f.terms ? iso(new Date(f.terms.firstSentAt).getTime() + 2 * D) : null, views: { presentation: f.decks.find((d) => d.kind === "post-appraisal")?.opens ?? 0, contract: 0 } });
    }
    if ((what === "terms" || what === "nudge") && method === "POST") {
      if (f.ma.valuation == null) return no("Record the figure first: the terms are drawn up from it.");
      const at = iso(now), again = Boolean(f.terms);
      f.terms = { firstSentAt: f.terms?.firstSentAt ?? at, lastSentAt: at, count: (f.terms?.count ?? 0) + 1 };
      f.ma.termsSentAt = at;
      const to = f.ma.landlordEmail ?? "the landlord";
      return ok({ again, to, message: again ? `Reminder sent to ${to}, with a fresh link into their file.` : `Sent to ${to}: the presentation and the contract, in one email from you.` }, ["landlord-contract-pack"], again ? "nudged" : "terms");
    }
    if (what === "takeon") return ok({ times: null, access: null, booking: null });
    if (what === "messages") return method === "GET" ? ok({ messages: [] }) : ok({ message: { id: "m1", from: "agent", body: str(b.text), sentAt: iso(now), readAt: null }, emailed: true, to: f.ma.landlordEmail }, [], "message");
    if (what === "photos") return method === "GET" ? ok({ photos: [] }) : no("Photos aren't part of this demo.");
    if (what === "details") return ok({ fields: [], known: {}, advert: null, compliance: { has: [], missing: [], landlord: f.ma.landlord, email: f.ma.landlordEmail } });
    return no("That part of the file isn't in the demo.", 404);
  }
  if (p === "/api/appraisals/video-chase") {
    const f = byId(str(b.id));
    if (!f) return no("No such appraisal.", 404);
    if (b.mode === "decline") { f.sends.push({ kind: "video-chase", state: "declined", sendAt: iso(now), sentAt: null, createdAt: iso(now) }); return ok({ held: false, detail: "Sending it without a video." }, [], "video_declined"); }
    return ok({ sent: true, held: false, at: iso(now), detail: "The pre-presentation is on its way." }, ["appraisal-pre"], "pre_sent");
  }

  /* ── the lead behind it: facts, touches ── */
  const facts = p.match(/^\/api\/leads\/([^/]+)\/facts$/);
  if (facts) {
    const f = byRef(decodeURIComponent(facts[1]));
    if (method === "GET") return ok({ property: { type: f?.facts.type ?? "Terraced", beds: f?.facts.beds ?? 3, baths: f?.facts.baths ?? 1, address: f?.ma.address ?? "", postcode: f?.ma.postcode ?? "" } });
    const pr = (b.property ?? {}) as Record<string, unknown>;
    if (f) f.facts = { type: str(pr.type) || f.facts.type, beds: Number(pr.beds) || f.facts.beds, baths: Number(pr.baths) || f.facts.baths };
    return ok({});
  }
  if (/^\/api\/leads\/[^/]+\/touches$/.test(p)) return ok({}, [], "touch");

  /* ── the decks ── */
  if (p === "/api/presentations" && method === "GET") {
    const f = byRef(sp.get("ref") ?? "");
    const sent = (f?.decks ?? []).map((d) => ({ token: d.token, kind: d.kind, url: `/present/sample?kind=${d.kind}`, createdAt: d.createdAt, opens: d.opens, authorName: CAST.agent.name, updatedAt: d.createdAt, builder: null, firstOpenedAt: d.firstOpenedAt, lastOpenedAt: d.firstOpenedAt }));
    return ok({ sent });
  }
  if (p === "/api/presentations" && method === "POST") {
    const f = byRef(str(b.ref));
    const kind = (["pre-appraisal", "appraisal", "post-appraisal"].includes(str(b.kind)) ? str(b.kind) : "appraisal") as Deck["kind"];
    if (f) f.decks = [...f.decks.filter((d) => d.kind !== kind), deck(kind, now)];
    return ok({ url: `/present/sample?kind=${kind}`, token: "sample" }, [], `deck_${kind}`);
  }
  if (p === "/api/scheduled-sends" && method === "POST") {
    const f = byRef(str(b.ref));
    if (f && str(b.kind) === "pre-appraisal" && !f.sends.some((s) => s.kind === "pre-appraisal")) f.sends.push({ kind: "pre-appraisal", state: "queued", sendAt: str(b.sendAt) || iso(now + 2 * H), sentAt: null, createdAt: iso(now) });
    return ok({}, [], "scheduled");
  }

  /* ── the confirmation to the landlord ── */
  if (p === "/api/confirmations" && method === "POST") {
    /* A booking not yet made (the wizard's last step) sends its details instead of an id. */
    const fresh = b.appraisal as Record<string, unknown> | undefined;
    if (fresh && b.action === "draft") {
      const landlord = str(fresh.landlord), address = str(fresh.address), email = str(fresh.email) || null;
      return ok({ to: email, toName: landlord, subject: `Your market appraisal at ${address}`, html: emailHtml({ landlord, address, appointmentAt: str(fresh.startsAt) || null }), attachment: "appraisal.ics" });
    }
    const id = str(b.id) || str(fresh?.leadId);
    const f = byId(id) ?? byRef(id) ?? book.files[0];
    if (b.action === "draft") {
      if (b.kind === "takeon") return ok({ to: f.ma.landlordEmail, toName: f.ma.landlord, subject: `Your take-on visit at ${f.ma.address}`, html: emailHtml(f.ma), attachment: "visit.ics" });
      return ok({ to: f.ma.landlordEmail, toName: f.ma.landlord, subject: `Your market appraisal at ${f.ma.address}`, html: emailHtml(f.ma), attachment: "appraisal.ics", ...(f.confirmedAt ? { alreadySent: { at: f.confirmedAt, to: f.ma.landlordEmail ?? "", subject: `Your market appraisal at ${f.ma.address}` } } : {}) });
    }
    if (b.action === "send") {
      f.confirmedAt = iso(now);
      return ok({ sent: true, detail: `Sent to ${f.ma.landlordEmail ?? f.ma.landlord}, with the calendar invite.` }, ["appraisal-confirm"], "confirmed");
    }
    return no("Draft or send?");
  }

  /* ── the wizard: landlords, addresses, the property ── */
  if (p === "/api/contacts/existing") {
    const e = (sp.get("email") ?? "").toLowerCase(), m = (sp.get("mobile") ?? "").replace(/\D/g, "");
    const hit = book.contacts.filter((c) => (e && c.email.toLowerCase() === e) || (m && c.mobile.replace(/\D/g, "") === m));
    return ok({ matches: hit.map((c) => ({ ...c, kind: "landlord", by: e ? "email" : "mobile", appraisal: null })) });
  }
  if (p === "/api/contacts/match") return ok({ matches: [] });
  if (p === "/api/contacts" && method === "POST") {
    const c = { id: `c-${++book.seq}`, name: str(b.name), email: str(b.email), mobile: str(b.mobile), address: str(b.address) };
    if (!c.name) return no("A landlord needs a name.");
    book.contacts.push(c);
    return ok({ contact: c }, [], "landlord");
  }
  if (p === "/api/address") {
    const r = sp.get("resolve");
    if (r) { const label = decodeURIComponent(r).replace(/^demo:/, ""); const pc = label.includes("Recreation") ? CAST.postcode : "NG7 1AA"; return ok({ address: label.replace(/, Nottingham$/, ""), postcode: pc, lat: CAST.lat, lng: CAST.lng }); }
    const q = (sp.get("q") ?? "").trim();
    const typed = q.length > 3 ? [`${q.replace(/,?\s*nottingham$/i, "")}, Nottingham`] : [];
    const list = [...new Set([...STREET.filter((s) => !q || s.toLowerCase().includes(q.toLowerCase().split(/\s+/)[0] ?? "")), ...typed, ...STREET])].slice(0, 6);
    return ok({ suggestions: list.map((label) => ({ id: `demo:${label}`, label })) });
  }
  if (p === "/api/dossier") return ok({ propertyType: "Terraced", beds: 2, baths: 1 });
  if (p === "/api/case-state") {
    const key = `${sp.get("kind") ?? str(b.kind)}:${sp.get("id") ?? str(b.id)}`;
    if (method === "GET") {
      /* The facts checked with the landlord at booking (the wizard saves them), else the file's own. */
      const f = sp.get("kind") === "appraisal-facts" ? byRef(sp.get("id") ?? "") : null;
      const fallback = f ? { type: f.facts.type === "Terraced" ? "Terraced house" : f.facts.type, beds: f.facts.beds, baths: f.facts.baths, ignoreLookup: false } : null;
      return ok({ payload: book.cases[key] ?? fallback });
    }
    book.cases[key] = b.payload ?? null;
    return ok({ saved: true });
  }

  /* ── the diary the booker shows ── */
  if (p === "/api/diary") {
    /* lib/diary Appt: day is days from today, start "HH:MM". */
    const dayOf = (t: number) => { const a = new Date(t); a.setHours(0, 0, 0, 0); const b = new Date(now); b.setHours(0, 0, 0, 0); return Math.round((a.getTime() - b.getTime()) / D); };
    const hm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    const appt = (id: string, t: number, mins: number, kind: string, what: string, where: string) => ({ id, day: dayOf(t), start: hm(t), mins, kind, what, where, who: CAST.agent.name, agent: CAST.agent.name, agentEmail: CAST.agent.email, own: true, lat: CAST.lat, lng: CAST.lng });
    const at = (d: number, h: number, m = 0) => { const x = new Date(now + d * D); x.setHours(h, m, 0, 0); return x.getTime(); };
    const appts = book.files.filter((f) => f.ma.appointmentAt && new Date(f.ma.appointmentAt).getTime() > now - D).map((f) => appt(`ma-${f.ma.id}`, new Date(f.ma.appointmentAt!).getTime(), 60, "appraisal", `Market appraisal - ${f.ma.landlord}`, f.ma.address));
    appts.push(appt("v-1", at(1, 14), 30, "viewing", "Viewing - 31 Gregory Boulevard", "31 Gregory Boulevard, Nottingham"), appt("v-2", at(2, 9, 30), 30, "viewing", "Viewing - 14 Arboretum Street", "14 Arboretum Street, Nottingham"), appt("v-3", at(3, 16), 30, "viewing", "Viewing - 31 Gregory Boulevard", "31 Gregory Boulevard, Nottingham"));
    return ok({ live: true, appts, agents: [CAST.agent.name], everything: false, whose: CAST.agent.name, outlook: { state: "connected" }, stale: false });
  }
  if (p === "/api/travel") return ok({ legs: [], precise: false, resolved: true });
  if (p === "/api/appointments" && method === "POST") return ok({ id: `appt-${++book.seq}` }, [], "diary");

  /* ── the builder: the market, the area, photographs, history, the address list ── */
  if (p === "/api/ma-research") { const f = book.files.find((x) => x.ma.address === sp.get("address")) ?? byId(RAJ_APPRAISAL) ?? book.files[0]; return { status: 200, json: research(f, now), sent: [] }; }
  if (p === "/api/ma-research/addresses") return ok({ addresses: [{ hsId: 9001, label: `${CAST.property}, Nottingham ${CAST.postcode}` }, { hsId: 9002, label: `10 Recreation Terrace, Nottingham ${CAST.postcode}` }] });
  if (p === "/api/market-picture") return { status: 200, json: marketPicture(sp.get("postcode") ?? CAST.postcode, now), sent: [] };
  if (p === "/api/ma-photos") {
    const ids = (sp.get("ids") ?? "").split(",").filter(Boolean), photos: Record<string, string[]> = {}, adverts: Record<string, string | null> = {};
    ids.forEach((id, k) => { photos[id] = [0, 1, 2].map((j) => PHOTOS[(k + j * 3) % PHOTOS.length]); adverts[id] = null; });
    return ok({ photos, adverts });
  }
  if (p === "/api/property-history") return ok({ listings: [] });
  if (p === "/api/presentations/email" && method === "POST") {
    const f = byId(str(b.appraisalId)) ?? byId(RAJ_APPRAISAL);
    return ok({ to: f?.ma.landlordEmail ?? CAST.landlord.email }, ["appraisal-post"], "deck_emailed");
  }

  /* ── the terms: the agent signs their half on the stand-in, then sends ── */
  if (p === "/api/docuseal/sign" && method === "POST") {
    const f = byId(str(b.id));
    if (!f) return no("No such appraisal.", 404);
    if (f.ma.valuation == null) return no("Record the figure first: the contract is drawn up from it.");
    if (b.replace) f.agentSignedAt = null;
    return ok({ embedSrc: `demo:${f.ma.id}` }, [], "contract_drawn");
  }
  if (p === "/api/docuseal/demo-signed" && method === "POST") {
    /* demo:<id> is the agent's half (Prepare and send); demo:landlord:<id> is the landlord's, from his portal. */
    const landlord = str(b.src).startsWith("demo:landlord:");
    const f = byId(str(b.src).replace(/^demo:(landlord:)?/, ""));
    if (!f) return no("No such appraisal.", 404);
    if (!landlord) { f.agentSignedAt = iso(now); return ok({}, [], "agent_signed"); }
    f.signed = { name: str(b.name) || f.ma.landlord, at: iso(now) };
    return ok({}, [], "signed");
  }

  /* ── the welcome video: none recorded; recording one is a real camera, so not in the demo ── */
  if (p === "/api/video") return method === "GET" ? ok({ video: null }) : no("Recording a video isn't part of the demo. Press Send it without a video instead.");

  /* ── the property file and documents on the appraisal ── */
  if (p === "/api/documents") return method === "GET" ? ok({ docs: [] }) : no("Uploads aren't part of this demo.");

  return null;
}
