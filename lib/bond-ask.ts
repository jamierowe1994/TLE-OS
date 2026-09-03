import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hasDb, q } from "@/lib/db";
import { SIGNALS, SIGNAL_ORDER, STAGE_LABEL, type Prospect, type SignalKey } from "@/lib/radar-signals";
import { getProspect, listProspects } from "@/lib/radar";
import { getLandlord, listLandlords } from "@/lib/landlords";
import { competitorAgents } from "@/lib/competitors";
import { listCampaigns } from "@/lib/bond-campaigns";
import { bondSummary, recentActivity } from "@/lib/bond";
import { saleMatches, type RecentSale } from "@/lib/sales";

/**
 * Ask Bond: Claude, with Bond's data in front of it.
 *
 * James, 3 Sep: "a Claude consult built into this". Not a general chatbot
 * and not Steve: Steve knows the OS and the knowledge base, this knows the
 * patch. It reads what Bond has already worked out - the signals, the
 * scores, the landlords, who else holds the stock, the campaigns - and turns
 * it into the four things an agent actually asks for: what should I do
 * first, why is this door flagged, tell me the story of this one, write me
 * the letter.
 *
 * ── Read only, patch scoped, never invents ────────────────────────────────
 *
 * Every tool here reads. Nothing changes a stage, sends a card or records
 * an owner; the rooms do that and the person presses the button. The tools
 * take the person's patch and answer inside it, the way the rooms do, and a
 * door outside the patch is named as outside it rather than hidden.
 *
 * The rules in the prompt are the same ones the rest of Bond lives by: no
 * figure that did not come back from a tool, no owner name that nobody
 * recorded, cold contact to an individual by post only, never a supplier's
 * name on an agent's screen. They are written into the prompt because the
 * model reads them; they are also enforced where they can be, in what the
 * tools return.
 *
 * ── The spend ceiling ─────────────────────────────────────────────────────
 *
 * Its own daily cap, counted from its own log, checked before the call and
 * again every round of the tool loop. Separate from Steve's on purpose: a
 * busy prospecting afternoon should not silence the help dock, and the
 * other way round.
 *
 * The system prompt is stable and cached; the date, the patch and the door
 * in focus travel in the user turn so the cache holds across people and
 * days.
 */

const MODEL = "claude-opus-5";
const DAILY_CAP = Number(process.env.BOND_ASK_DAILY_TOKEN_CAP ?? 300_000);
const MAX_TOOL_ROUNDS = 6;

export function askConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function spentToday(): Promise<number> {
  if (!hasDb()) return 0;
  try {
    const rows = await q<{ n: string | null }>(
      `SELECT COALESCE(SUM(out_tokens), 0)::text AS n FROM os_bond_ask WHERE created_at >= date_trunc('day', NOW())`
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    /* Cannot read the meter: fail closed, not open. */
    return DAILY_CAP;
  }
}

export async function budget(): Promise<{ spent: number; cap: number; left: number }> {
  const spent = await spentToday();
  return { spent, cap: DAILY_CAP, left: Math.max(0, DAILY_CAP - spent) };
}

/* ── The log ─────────────────────────────────────────────────────────────── */

export type AskRole = "agent" | "bond";

export interface AskLine {
  id: number;
  role: AskRole;
  text: string;
  steps: string[];
  focus: string;
  at: string;
}

export async function logAsk(p: {
  userId: string;
  userEmail: string;
  role: AskRole | "cleared";
  text: string;
  steps?: string[];
  focus?: string;
  inTokens?: number;
  outTokens?: number;
}): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_bond_ask (user_id, user_email, role, text, steps, focus, in_tokens, out_tokens)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [p.userId, p.userEmail, p.role, p.text, JSON.stringify(p.steps ?? []), p.focus ?? "", p.inTokens ?? 0, p.outTokens ?? 0]
    );
  } catch (e) {
    console.error("[bond-ask] could not log", e);
  }
}

export async function askHistory(userId: string, limit = 40): Promise<AskLine[]> {
  if (!hasDb()) return [];
  try {
    const cut = await q<{ at: string | null }>(
      `SELECT MAX(created_at)::text AS at FROM os_bond_ask WHERE user_id = $1 AND role = 'cleared'`,
      [userId]
    );
    const since = cut[0]?.at ?? null;
    const rows = await q<{ id: number; role: string; text: string; steps: unknown; focus: string; created_at: string }>(
      `SELECT id, role, text, steps, focus, created_at FROM os_bond_ask
        WHERE user_id = $1 AND role <> 'cleared' ${since ? "AND created_at > $3" : ""}
        ORDER BY created_at DESC LIMIT $2`,
      since ? [userId, limit, since] : [userId, limit]
    );
    return rows
      .map((r) => ({
        id: Number(r.id),
        role: r.role === "bond" ? ("bond" as const) : ("agent" as const),
        text: r.text,
        steps: Array.isArray(r.steps) ? (r.steps as string[]) : [],
        focus: r.focus ?? "",
        at: new Date(r.created_at).toISOString(),
      }))
      .reverse();
  } catch (e) {
    console.error("[bond-ask] could not read history", e);
    return [];
  }
}

export async function clearAsk(userId: string, userEmail: string): Promise<void> {
  await logAsk({ userId, userEmail, role: "cleared", text: "Cleared the conversation" });
}

/* ── What it can go and read ──────────────────────────────────────────────── */

export interface AskContext {
  /** The person's patch. Empty means the whole patch. */
  districts: string[];
  /** The door or landlord open in front of them, if any. */
  focus: { kind: "door" | "landlord"; key: string; label: string } | null;
}

interface Tool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  label: (input: Record<string, unknown>) => string;
  run: (input: Record<string, unknown>, ctx: AskContext) => Promise<unknown>;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const daysOn = (listed: string | null): number | null => {
  if (!listed) return null;
  const t = new Date(listed).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) : null;
};
const inPatch = (p: { district: string | null }, districts: string[]) =>
  districts.length === 0 || (p.district != null && districts.includes(p.district.toUpperCase()));

/** A prospect as the model sees it: everything that bears on a decision, nothing that does not. */
function compact(p: Prospect, districts: string[]) {
  return {
    property_key: p.property_key,
    address: p.address || p.street || "",
    postcode: p.postcode,
    district: p.district,
    in_your_patch: inPatch(p, districts),
    beds: p.beds,
    type: p.property_type,
    market: p.market,
    rent_pcm: p.market === "let" ? p.rent : null,
    asking_price: p.market === "sale" ? p.asking_price : null,
    agent: p.agent,
    listing_status: p.status,
    days_on_market: daysOn(p.listed_on),
    score: p.score,
    stage: STAGE_LABEL[p.stage],
    assigned_to: p.assigned_to,
    signals: p.signals.map((s) => ({ signal: SIGNALS[s.key]?.label ?? s.key, weight: SIGNALS[s.key]?.weight ?? 0, seen: s.detail })),
    tenancy: p.next_anniversary
      ? { started_about: p.tenancy_start, next_anniversary: p.next_anniversary, basis: p.tenancy_basis }
      : "not known",
    epc: p.epc_band ? { band: p.epc_band, registered_on: p.epc_registered_on, condition_score: p.condition_score } : "no certificate matched",
    hmo_licence: p.hmo_licence_ref ? { ref: p.hmo_licence_ref, expires_on: p.hmo_expires_on } : null,
    company_owner: p.company ? { name: p.company.name, number: p.company.number, registered_office: p.company.address } : null,
    owner_recorded: p.owner ? { name: p.owner.name, correspondence_address: p.owner.address, source: p.owner.source } : "nobody has recorded an owner",
    front_door: p.resolved_address ? { address: p.resolved_address, confidence: p.address_confidence } : "not pinned down yet",
    notes: p.notes ? p.notes.slice(0, 600) : "",
    added_by_hand_because: p.hand_reason,
    first_flagged: p.first_flagged.slice(0, 10),
  };
}

const patchOverview: Tool = {
  name: "patch_overview",
  description:
    "The shape of the patch today: how many doors are flagged, how many are new, how many signals of each kind, how many at each stage, when the sweep last ran. Call this first for 'what should I do today' and 'what is new'.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  label: () => "Reading the patch",
  run: async (_input, ctx) => {
    const [summary, all] = await Promise.all([bondSummary(), listProspects()]);
    const mine = all.filter((p) => inPatch(p, ctx.districts) && p.score > 0);
    const bySignal: Record<string, number> = {};
    const byStage: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    let newToday = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const p of mine) {
      for (const s of p.signals) bySignal[SIGNALS[s.key]?.label ?? s.key] = (bySignal[SIGNALS[s.key]?.label ?? s.key] ?? 0) + 1;
      byStage[STAGE_LABEL[p.stage]] = (byStage[STAGE_LABEL[p.stage]] ?? 0) + 1;
      if (p.agent) byAgent[p.agent] = (byAgent[p.agent] ?? 0) + 1;
      if (p.first_flagged.slice(0, 10) === today) newToday++;
    }
    const anniversaries60 = mine.filter((p) => p.next_anniversary && p.next_anniversary >= today && p.next_anniversary <= addDays(today, 60)).length;
    return {
      patch: ctx.districts.length ? ctx.districts : "the whole patch",
      flagged_in_patch: mine.length,
      new_today_in_patch: newToday,
      anniversaries_next_60_days: anniversaries60,
      by_signal: bySignal,
      by_stage: byStage,
      top_listing_agents: Object.entries(byAgent).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([agent, n]) => ({ agent, flagged_doors: n })),
      whole_book: { flagged: summary.flagged, new_today: summary.newToday, appraisals_booked: summary.appraisalsBooked, owners_found: summary.ownersFound, postcards_sent: summary.postcardsSent },
      last_sweep: summary.lastSweep,
    };
  },
};

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const topProspects: Tool = {
  name: "top_prospects",
  description:
    "The flagged doors in the person's patch, strongest first, with every signal on each. Filter by signal, stage or market; sort by score, newest, or soonest anniversary. Use it to pick a shortlist, to answer 'who should I write to', and before drafting anything for 'the best ones'.",
  input_schema: {
    type: "object",
    properties: {
      signals: { type: "array", items: { type: "string", enum: SIGNAL_ORDER }, description: "Only doors carrying at least one of these signals." },
      stage: { type: "string", enum: ["new", "queued", "contacted", "appraisal_booked", "won", "not_interested", "do_not_contact", "open"], description: "'open' means new, queued, contacted or appraisal booked (the default)." },
      market: { type: "string", enum: ["let", "sale"] },
      sort: { type: "string", enum: ["score", "newest", "anniversary", "days_on_market"] },
      limit: { type: "integer", minimum: 1, maximum: 30 },
    },
    additionalProperties: false,
  },
  label: (i) => {
    const s = Array.isArray(i.signals) && i.signals.length ? ` with ${(i.signals as string[]).map((k) => SIGNALS[k as SignalKey]?.label ?? k).join(", ")}` : "";
    return `Reading the top prospects${s}`;
  },
  run: async (input, ctx) => {
    const all = await listProspects();
    const wanted = Array.isArray(input.signals) ? (input.signals as string[]).filter((k): k is SignalKey => k in SIGNALS) : [];
    const stage = str(input.stage) || "open";
    const market = str(input.market);
    const limit = Math.min(30, Math.max(1, Number(input.limit) || 15));
    let rows = all.filter((p) => inPatch(p, ctx.districts) && p.score > 0);
    if (wanted.length) rows = rows.filter((p) => p.signals.some((s) => wanted.includes(s.key)));
    if (stage === "open") rows = rows.filter((p) => ["new", "queued", "contacted", "appraisal_booked"].includes(p.stage));
    else rows = rows.filter((p) => p.stage === stage);
    if (market) rows = rows.filter((p) => p.market === market);
    const sort = str(input.sort) || "score";
    rows.sort((a, b) => {
      if (sort === "newest") return b.first_flagged.localeCompare(a.first_flagged) || b.score - a.score;
      if (sort === "anniversary") return (a.next_anniversary ?? "9999").localeCompare(b.next_anniversary ?? "9999") || b.score - a.score;
      if (sort === "days_on_market") return (daysOn(b.listed_on) ?? -1) - (daysOn(a.listed_on) ?? -1) || b.score - a.score;
      return b.score - a.score;
    });
    return { matching: rows.length, showing: Math.min(limit, rows.length), prospects: rows.slice(0, limit).map((p) => compact(p, ctx.districts)) };
  },
};

const door: Tool = {
  name: "door",
  description:
    "Everything Bond holds on one property: the signals and why each matters, the listing history across both feeds, sales from the Land Registry price paid data, the tenancy estimate, the certificate, the owner if anybody recorded one, what colleagues have done, and any campaign cards queued or held for it. Give a property_key when you have one, otherwise the address as the person said it.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "A property_key, or part of the address (house number and street is enough)." } },
    required: ["query"],
    additionalProperties: false,
  },
  label: (i) => (/^(uprn|addr|street|title):/.test(str(i.query)) ? "Reading the door in front of you" : `Reading ${str(i.query) || "the door"}`),
  run: async (input, ctx) => {
    const query = str(input.query);
    if (!query) return { error: "Say which door." };
    let p = await getProspect(query);
    if (!p) {
      const needle = query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const all = await listProspects();
      const hits = all.filter((x) => `${x.address} ${x.street ?? ""} ${x.postcode}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").includes(needle));
      if (hits.length === 0) return { error: `Nothing on the board matches "${query}". It may not be flagged: the Look up room can search any address on the register and add it by hand.` };
      if (hits.length > 1) {
        return { several_match: hits.slice(0, 8).map((x) => ({ property_key: x.property_key, address: `${x.address}, ${x.postcode}`, score: x.score })), note: "Ask which one, or call again with the property_key." };
      }
      p = hits[0];
    }
    const [history, sales, activity, cards] = await Promise.all([
      q<Record<string, unknown>>(
        `SELECT market, agent, coalesce(rent, 0) AS price, status, listed_on::text AS listed_on, first_seen::date::text AS first_seen, last_seen::date::text AS last_seen,
                let_agreed_at::date::text AS let_agreed_at, gone_at::date::text AS gone_at, reduced_at::text AS reduced_at
           FROM os_listing_capture WHERE property_key = $1 ORDER BY coalesce(listed_on, first_seen::date) DESC LIMIT 12`,
        [p.property_key]
      ),
      q<RecentSale & Record<string, unknown>>(
        `SELECT upper(postcode) AS postcode, house_number, saon, sold_on::text AS sold_on, price, new_build, category, tenure
           FROM os_sales WHERE upper(postcode) = upper($1) ORDER BY sold_on DESC LIMIT 40`,
        [p.postcode]
      ),
      q<Record<string, unknown>>(`SELECT actor, kind, detail, at::text AS at FROM os_bond_activity WHERE property_key = $1 ORDER BY at DESC LIMIT 12`, [p.property_key]),
      q<Record<string, unknown>>(
        `SELECT c.name AS campaign, s.title AS step, s.mail_type, x.due_on::text AS due_on, x.status, x.reason
           FROM os_bond_campaign_sends x JOIN os_bond_campaign_steps s ON s.id = x.step_id JOIN os_bond_campaigns c ON c.id = x.campaign_id
          WHERE x.property_key = $1 ORDER BY x.due_on LIMIT 12`,
        [p.property_key]
      ),
    ]);
    const addr = p.address || p.street || "";
    return {
      door: compact(p, ctx.districts),
      why_each_signal_matters: p.signals.map((s) => ({ signal: SIGNALS[s.key]?.label ?? s.key, why: SIGNALS[s.key]?.why ?? "" })),
      listings_seen: history.map((h) => ({ market: h.market, agent: h.agent, price: h.price, status: h.status, listed_on: h.listed_on, first_seen: h.first_seen, last_seen: h.last_seen, let_agreed_at: h.let_agreed_at, gone_at: h.gone_at, reduced_at: h.reduced_at })),
      sales_at_this_address: sales.filter((s) => saleMatches(addr, s)).map((s) => ({ sold_on: s.sold_on, price: s.price, new_build: s.new_build, tenure: s.tenure ?? null })),
      colleagues_did: activity.map((a) => ({ who: a.actor, what: a.kind, detail: a.detail, when: a.at })),
      campaign_cards: cards.length ? cards : "none queued or held",
    };
  },
};

const landlord: Tool = {
  name: "landlord",
  description:
    "One landlord Bond knows about - a company from the Land Registry files or an owner somebody recorded - with their portfolio, the flagged doors in it, the opportunity score and the marketing status. Search by name, company number or landlord_key.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
  label: (i) => `Reading ${str(i.query) || "the landlord"}`,
  run: async (input, ctx) => {
    const query = str(input.query);
    if (!query) return { error: "Say which landlord." };
    let hit = await getLandlord(query);
    if (!hit) {
      const needle = query.toLowerCase();
      const all = await listLandlords();
      const hits = all.filter((l) => l.name.toLowerCase().includes(needle) || (l.company_number ?? "") === query.toUpperCase());
      if (hits.length === 0) return { error: `No landlord on the list matches "${query}".` };
      if (hits.length > 1) return { several_match: hits.slice(0, 8).map((l) => ({ landlord_key: l.landlord_key, name: l.name, portfolio: l.portfolio_size, score: l.score })) };
      hit = await getLandlord(hits[0].landlord_key);
      if (!hit) return { error: "Could not read that landlord." };
    }
    const l = hit.landlord;
    return {
      landlord: {
        landlord_key: l.landlord_key, kind: l.kind, name: l.name, company_number: l.company_number, address: l.address, known_from: l.source,
        portfolio_size: l.portfolio_size, flagged_doors: l.flagged, opportunity_score: l.score, band: l.band, marketing_status: l.marketing_status,
        portfolio_condition: l.condition_score, notes: l.notes.slice(0, 600),
      },
      doors: hit.doors.slice(0, 40).map((d) => (d.prospect ? compact(d.prospect, ctx.districts) : { property_key: d.property_key, address: d.address, postcode: d.postcode, flagged: false })),
    };
  },
};

const competitors: Tool = {
  name: "competitors",
  description: "Who holds the lettings stock in the person's patch: each agent, how many doors, how many tenanted, how many on the market, how many anniversaries in the next 90 days.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  label: () => "Reading the competitors",
  run: async (_input, ctx) => ({ agents: (await competitorAgents(ctx.districts)).slice(0, 20) }),
};

const campaigns: Tool = {
  name: "campaigns",
  description: "The campaign sequences and their current copy, with what is queued, held and sent. Read this before drafting or improving a step's copy so the draft fits the sequence.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  label: () => "Reading the campaigns",
  run: async () => ({
    campaigns: (await listCampaigns()).map((c) => ({
      name: c.name, trigger: c.trigger, active: c.active, queue: c.stats,
      steps: c.steps.map((s) => ({ title: s.title, offset_days: s.offset_days, mail_type: s.mail_type, active: s.active, copy: s.copy })),
    })),
    merge_fields: "{landlord} {address} {postcode} {agent} {anniversary} {since} {phone}",
  }),
};

const activityTool: Tool = {
  name: "recent_activity",
  description: "What colleagues have done in Bond lately: stages moved, notes, appraisals booked, owners recorded.",
  input_schema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 40 } }, additionalProperties: false },
  label: () => "Reading what colleagues did",
  run: async (input) => ({ activity: await recentActivity(Math.min(40, Math.max(1, Number(input.limit) || 20))) }),
};

const TOOLS: Tool[] = [patchOverview, topProspects, door, landlord, competitors, campaigns, activityTool];
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
const TOOL_SCHEMAS: Anthropic.Tool[] = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

/* ── The brief ───────────────────────────────────────────────────────────── */

function signalCatalogue(): string {
  return SIGNAL_ORDER.map((k) => `- ${SIGNALS[k].label} (${SIGNALS[k].weight}): ${SIGNALS[k].why}`).join("\n");
}

const PERSONA = `You are Bond's analyst: the consult panel inside Bond, the prospecting workspace The Lettings Experts use to find landlords in Northampton (NN), Milton Keynes (MK) and Bedford (MK40 to MK46). The people asking are lettings agents in the middle of a prospecting session. If somebody asks who you are, you are Bond. Say it and get on with it.

WHAT BOND IS. Every day Bond sweeps the lettings and sales feeds for the patch and keeps every advert it sees. From what changes it raises SIGNALS on individual doors, and the doors with signals are the PROSPECTS. It also holds the Land Registry price paid data, the Land Registry company owner files, the council HMO registers, the EPC register, the tenancy anniversary predictor, the photo of every advert, the landlords behind the doors, who else holds the stock, and the campaign sequences that write to landlords.

THE SIGNALS, with their weights and why each one matters:
${signalCatalogue()}

A door's SCORE is the sum of the weights of the signals on it. It is a ranking, not a probability. The anniversary predictor takes the date a let was agreed (observed) or the advert's date plus a few weeks (estimated) and adds a year. The CONDITION SCORE is 0 to 100 from the EPC band (A 95, B 85, C 70, D 55, E 40, F 25, G 10), a little lower when the certificate is over eight years old or the potential band is much better than the current one. A LANDLORD'S opportunity score is their strongest flagged door plus a little for each further flagged door and a little for portfolio size; the bands are Very high 70+, High 45+, Medium 25+.

THE ROOMS, so you can say where to go: Today (the figures and what colleagues did), Map (pins coloured by signal, numbers are days on the market), Prospects (the same book as a list), Landlords, Competitors, Look up (any address on the register, and add a door by hand), Campaigns (the sequences and their copy), Owners (owner lookups) and Postcards (the queue of cards). Name the room in plain words; there are no links.

STAGES a door moves through: New, Queued, Contacted, Appraisal booked, Won, Not interested, Do not contact. A door marked Do not contact is never written to.

CAMPAIGNS. Two sequences run: the tenancy anniversary (a postcard twelve and eight weeks before, a letter at six and four weeks) and just bought (a letter at once, a postcard two weeks later). Cards are QUEUED when an owner and a correspondence address are known and HELD, with the reason, when they are not. Copy carries merge fields in braces: {landlord} {address} {postcode} {agent} {anniversary} {since} {phone}.

YOU CAN LOOK THINGS UP, and you must. Every factual answer comes from a tool. Chain them without asking permission: "what should I do first" is patch_overview then top_prospects; "tell me about 12 Abbey Road" is door; "write to this landlord" is door (or landlord) first, then the draft. A tool that says nobody has recorded an owner, or no certificate matched, has given you a real answer: say that, do not fill the gap. Never invent a figure, a rent, a date, an owner's name, an address, a fee, or a phone number. If it is not in what came back, it is not known.

HOW TO ANSWER.
- Lead with the answer. Short. These people are mid-task. Three to six lines for a question; a numbered list for a shortlist, one line each with the address, the reason in an agent's words and the first action.
- Plain UK English. No em dashes; use a hyphen or a full stop. No emojis. No headings. Bold sparingly, for an address at most.
- When you name a door, give the address as the tool returned it, so the person can find it in Prospects.
- A door outside the person's patch is named as outside it.
- Explain a score by its parts: name each signal and what was seen, in the order of weight.
- "This week's ten" or any shortlist: read the top prospects, prefer doors that are New or Queued, spread across signals rather than ten of the same, and say why each earns its place. Anniversary doors go by how soon the date is: write before it, not after.

WRITING TO LANDLORDS. Drafts only; James or Susan sign off copy before it goes anywhere. A letter is under 180 words, a postcard under 45. Warm, specific to the door, never pushy, no claims about rents beyond offering a rent check, no fees or figures unless a tool returned them. Address an individual by the recorded name; when nobody has recorded an owner write to {landlord} and say so. Sign off The Lettings Experts. Put the draft on its own lines so it can be copied.

WHAT MUST NOT HAPPEN.
- Contact with an individual is by post only, to the property or to a correspondence address somebody recorded. Never suggest phoning, emailing or messaging a private individual, and never suggest finding them on social media, scraping a website, or tracing them through credit or electoral data. A company can be written to, phoned or emailed at its registered office.
- Never name a data supplier, a print house or a lookup provider. Say "the owner lookup", "the Land Registry", "the postcard".
- Never say you have done something. You read and you write drafts; the rooms act, and the person presses the button. "Here is the letter, paste it into the step in Campaigns" not "I have sent it".
- Do not give legal advice. For anything about the law say what Bond knows in a line and suggest they check with the office.
- If a question is about the OS rather than Bond (tenancies, compliance, REX), say Steve in the corner of the OS is the one for that.`;

function systemBlocks(): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: PERSONA, cache_control: { type: "ephemeral" } }];
}

function contextNote(ctx: AskContext): string {
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const lines = [`Today is ${today}.`, ctx.districts.length ? `The person's patch is ${ctx.districts.join(", ")}.` : "The person covers the whole patch."];
  if (ctx.focus) {
    lines.push(
      ctx.focus.kind === "door"
        ? `They have a door open in front of them: ${ctx.focus.label} (property_key ${ctx.focus.key}). "This one", "this door", "this landlord" and "here" mean that door; read it with the door tool.`
        : `They have a landlord open in front of them: ${ctx.focus.label} (landlord_key ${ctx.focus.key}). "This landlord", "them" and "this one" mean that landlord; read it with the landlord tool.`
    );
  }
  return lines.join(" ");
}

/** House style, enforced after the fact: no em dashes on the screen. */
export function houseStyle(text: string): string {
  return text.replace(/\s+[—–]\s+/g, " - ").replace(/[—–]/g, "-");
}

export type Turn = { role: "user" | "assistant"; text: string };

export interface Answer {
  text: string;
  steps: string[];
  inTokens: number;
  outTokens: number;
  /** The cap or the missing key spoke, not Claude. */
  canned: boolean;
}

export async function ask(history: Turn[], question: string, ctx: AskContext): Promise<Answer> {
  if (!askConfigured()) {
    return { text: "Ask Bond is not switched on in this environment: there is no key for it. James can add one.", steps: [], inTokens: 0, outTokens: 0, canned: true };
  }
  const b = await budget();
  if (b.left <= 0) {
    return { text: "I have used my thinking budget for today. Ask me again tomorrow, or James can raise it.", steps: [], inTokens: 0, outTokens: 0, canned: true };
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.text })),
    { role: "user" as const, content: `${contextNote(ctx)}\n\n${question}` },
  ];
  const system = systemBlocks();
  const steps: string[] = [];
  let inTokens = 0;
  let outTokens = 0;
  let spent = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const left = b.left - spent;
    if (left <= 0) {
      steps.push("Stopped: daily budget reached");
      break;
    }
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: Math.min(2000, Math.max(300, left)),
      output_config: { effort: "medium" },
      system,
      tools: TOOL_SCHEMAS,
      messages,
    });
    inTokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0);
    outTokens += res.usage.output_tokens;
    spent += res.usage.output_tokens;

    if (res.stop_reason === "refusal") {
      return { text: "I cannot help with that one.", steps, inTokens, outTokens, canned: false };
    }
    const calls = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!calls.length || res.stop_reason !== "tool_use") {
      const text = houseStyle(res.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("\n").trim());
      return { text: text || "I could not put an answer together for that. Try it a little more specifically.", steps, inTokens, outTokens, canned: false };
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const input = (call.input ?? {}) as Record<string, unknown>;
      const tool = BY_NAME.get(call.name);
      steps.push(tool ? tool.label(input) : "Working");
      let out: unknown;
      try {
        out = tool ? await tool.run(input, ctx) : { error: `No such tool: ${call.name}` };
      } catch (e) {
        out = { error: e instanceof Error ? e.message : "That lookup failed." };
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) });
    }
    /* Every result in one user message, so parallel calls stay parallel. */
    messages.push({ role: "user", content: results });
  }
  return { text: "I went round in circles on that one and stopped. Ask again, a little more specifically.", steps, inTokens, outTokens, canned: false };
}
