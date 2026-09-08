import "server-only";
import { hasDb, q } from "@/lib/db";
import { districtOf } from "@/lib/ma-research";

/**
 * Planning applications, into Bond.
 *
 * The signal nothing else in Bond can see: a landlord BEFORE they are a
 * landlord. Nobody converts a house into a five-bed HMO and then does not
 * need it managing, and none of these doors are on a portal yet, so the
 * Homesearch sweep will not meet them for months. Measured on 7 Sep 2026
 * across the whole patch and eighteen months: 803 applications that create
 * rental stock, 492 of them still live, and only 6 on a door the sweep
 * already knows.
 *
 * ── Where it comes from ───────────────────────────────────────────────────
 *
 * UK PlanIt (planit.org.uk), which scrapes every council's public planning
 * register and serves it as free JSON. The councils publish the register
 * because they must; we keep the metadata and link back to the council's own
 * page rather than copying any document, which is what PlanIt asks.
 *
 * Five authorities cover the patch. Their names are PlanIt's, not ours, and
 * a wrong one returns an empty page rather than an error, so the run says
 * how many rows each authority gave.
 *
 * ── Rate limits shape the whole design ────────────────────────────────────
 *
 * Measured: eight requests inside ten seconds earns a 429 with
 * `Retry-After: 262`. So this is not a "read everything now" job. One
 * authority per call, pages eight seconds apart, and a 429 the run cannot
 * wait out ends the run cleanly with its progress recorded - the next call
 * carries on. The workflow spacing is the real pacing mechanism, exactly as
 * lib/epc does with councils.
 *
 * ── Two passes, because regexes are not good enough ───────────────────────
 *
 * Pass one asks PlanIt itself for the applications whose words suggest homes
 * (see RECALL below), then applies a broad local regex to what comes back.
 * Its only job is RECALL: does this description mention homes at all?
 *
 * Pass two is Claude reading the description and deciding what it actually
 * is. This was not the first plan. The first plan was regexes all the way
 * down, and measured against 300 real West Northamptonshire applications it
 * could tell an HMO from a house (15 out of 15) but could not tell "change
 * of use to a dwelling" from "conversion of the garage into habitable
 * accommodation", or "erection of two dwellings" from "extension to the host
 * dwelling". Those are judgement calls on English, so they go to the model:
 * about sixty applications a week, batched twenty to a call.
 *
 * Without a key, or over the ceiling, rows sit at kind `unread`. They are
 * still in the room, still say so, and simply carry no signal. Nothing
 * guesses.
 */

/* ── The patch's planning authorities ─────────────────────────────────────── */

export interface PlanningAuthority {
  /** PlanIt's own area name. Wrong here means an empty answer, not an error. */
  name: string;
  /** Which of our districts it covers, for the note in the Planning room. */
  covers: string;
}

export const PLANNING_AUTHORITIES: PlanningAuthority[] = [
  { name: "West Northamptonshire", covers: "NN1-NN7, NN11-NN13" },
  { name: "North Northamptonshire", covers: "NN8-NN10, NN14-NN18" },
  { name: "Milton Keynes", covers: "MK1-MK19" },
  { name: "Bedford", covers: "MK40-MK45" },
  { name: "Central Bedfordshire", covers: "MK17, MK43-MK45" },
];

/* ── What a planning application can be, once it has been read ────────────── */

export type PlanningKind = "hmo" | "flats" | "to_residential" | "new_homes" | "none" | "unread";

export const PLANNING_KIND: Record<Exclude<PlanningKind, "none" | "unread">, { label: string; why: string }> = {
  hmo: {
    label: "HMO",
    why: "Becoming, or growing into, a house in multiple occupation. A landlord building rental stock, with a licence and a council to deal with either way.",
  },
  flats: {
    label: "Into flats",
    why: "One building becoming several self-contained homes. Every one of them is a tenancy somebody has to let and manage.",
  },
  to_residential: {
    label: "Into homes",
    why: "Something that was not a home becoming one - a barn, an office, a shop. Almost always an investment, rarely somewhere the owner will live.",
  },
  new_homes: {
    label: "New homes",
    why: "New homes on the plot. A small site is usually a builder or an investor who will hold some of them.",
  },
};

/* ── Pass one: recall ─────────────────────────────────────────────────────── */

/** Follow-ups to a permission somebody already has. No new intent in them. */
const ADMIN = /^\s*(discharge|variation|removal|non[- ]material|approval of (details|reserved)|submission of details|confirmation of compliance)/i;

/** PlanIt's own application types that are never a change of stock. */
const ADMIN_TYPE = /^(Conditions|Amendment|Heritage|Trees|Advertising|Telecoms)$/i;

/**
 * Loose on purpose. Anything that might be about homes gets through and is
 * read properly in pass two. PlanIt's own search has already done most of
 * this work, so what this mainly catches is the rows that matched on the
 * status or type fields rather than the description.
 */
const MENTIONS_HOMES =
  /\b(house in multiple occupation|houses in multiple occupation|hmo|c4|sui generis|flat|flats|apartment|apartments|maisonette|dwelling|dwellings|dwellinghouse|dwellinghouses|residential|change of use|conversion|convert|subdivi|sub-divi|class q|prior approval|annexe|bedsit|studio)\b/i;

export function looksRelevant(description: string | null, appType: string | null): boolean {
  const d = (description ?? "").replace(/\s+/g, " ").trim();
  if (!d) return false;
  if (ADMIN_TYPE.test(appType ?? "")) return false;
  if (ADMIN.test(d)) return false;
  return MENTIONS_HOMES.test(d);
}

/* ── Reading the feed ─────────────────────────────────────────────────────── */

const PLANIT = "https://www.planit.org.uk/api/applics/json";
/**
 * The recall query, asked of PlanIt rather than of every row we download.
 *
 * Without it an authority returns everything it has - West Northamptonshire
 * alone runs to thousands of applications in eighteen months - and with a
 * page cap in place the run would quietly stop part way through and nobody
 * would know what was missed. With it, and with the administrative
 * application types excluded, the same eighteen months is two to four pages
 * an authority. `looksRelevant` below is still applied to what comes back:
 * this search also matches the type and status fields, so it is looser than
 * it reads.
 */
const RECALL =
  '"house in multiple occupation" or hmo or "sui generis" or "into flats" or "self contained flats" or "change of use" or "new dwelling" or dwellings or dwellinghouse or apartments or annexe or conversion';
/** Full applications, outlines and the odd ones. Not conditions, amendments, trees or signs. */
const REAL_TYPES = "Full,Outline,Other";
const FIELDS =
  "name,uid,address,postcode,description,app_type,app_state,app_size,start_date,decided_date,last_changed,url,link,location_x,location_y,area_name";
/* Politeness, and PlanIt returns 403 to a request with no User-Agent. */
const AGENT = "TLE-OS Bond (thelettingexperts.co.uk)";
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

interface PlanitRecord {
  name: string;
  uid: string | null;
  address: string | null;
  postcode: string | null;
  description: string | null;
  app_type: string | null;
  app_state: string | null;
  app_size: string | null;
  start_date: string | null;
  decided_date: string | null;
  last_changed: string | null;
  url: string | null;
  link: string | null;
  location_x: number | null;
  location_y: number | null;
  area_name: string | null;
}

class RateLimited extends Error {
  constructor(public retryAfter: number) {
    super(`PlanIt is rate limiting us; it asked for ${retryAfter} seconds.`);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The longest 429 we will sit out, well inside the route's maxDuration. */
const WAIT_OUT = 150;

async function planitPage(params: Record<string, string>): Promise<{ records: PlanitRecord[]; total: number; to: number }> {
  const url = `${PLANIT}?${new URLSearchParams({ ...params, pg_sz: "300", compress: "on", select: FIELDS })}`;
  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": AGENT }, signal: AbortSignal.timeout(60_000) });
  if (r.status === 429) throw new RateLimited(Number(r.headers.get("retry-after") ?? 300));
  if (!r.ok) throw new Error(`PlanIt answered ${r.status} for ${params.auth ?? "the patch"}`);
  const body = (await r.json()) as { records?: PlanitRecord[]; total?: number; to?: number; error?: string };
  if (body.error) throw new Error(`PlanIt: ${body.error}`);
  return { records: body.records ?? [], total: body.total ?? 0, to: body.to ?? -1 };
}

/**
 * The postcode PlanIt gave, or the one written into the address. About one
 * application in six carries no postcode at all - rural barns and bare land -
 * and those are skipped, because the district filter is the only thing
 * keeping the patch clean.
 */
function postcodeOf(r: PlanitRecord): string | null {
  for (const raw of [r.postcode, r.address]) {
    const m = raw ? POSTCODE.exec(raw) : null;
    if (m) return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
  }
  return null;
}

/** The first house number in the address, the way every other match here works. */
function numberIn(address: string | null): string | null {
  return (address ?? "").match(/\b(\d+[A-Z]?)\b/i)?.[1]?.toUpperCase() ?? null;
}

export interface PlanningSyncResult {
  ok: boolean;
  authority: string;
  read?: number;
  kept?: number;
  pages?: number;
  reason?: string;
  rateLimited?: boolean;
}

/**
 * Read one authority. `sinceDays` looks at applications that CHANGED recently
 * (the weekly run); `months` is the first load, by application date.
 */
export async function syncPlanningAuthority(
  authority: string,
  opts: { sinceDays?: number; months?: number; maxPages?: number } = {}
): Promise<PlanningSyncResult> {
  if (!hasDb()) return { ok: false, authority, reason: "no database" };
  if (!PLANNING_AUTHORITIES.some((a) => a.name === authority)) {
    return { ok: false, authority, reason: `Not an authority Bond reads. Known: ${PLANNING_AUTHORITIES.map((a) => a.name).join(", ")}.` };
  }
  const wanted = new Set((await q<{ district: string }>(`SELECT district FROM os_radar_districts`)).map((r) => r.district));
  if (wanted.size === 0) return { ok: false, authority, reason: "no districts are being watched" };

  const months = opts.months ?? 0;
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - (months || 18));
  const base: Record<string, string> = {
    auth: authority,
    start_date: since.toISOString().slice(0, 10),
    search: RECALL,
    app_type: REAL_TYPES,
  };
  /* The weekly run only wants what moved; the first load wants the lot. */
  if (opts.sinceDays) base.changed = String(opts.sinceDays);

  const [run] = await q<{ id: number }>(`INSERT INTO os_planning_sync (authority) VALUES ($1) RETURNING id`, [authority]);
  let read = 0;
  let kept = 0;
  let page = 1;
  const maxPages = opts.maxPages ?? 6;
  try {
    for (; page <= maxPages; page++) {
      if (page > 1) await wait(8_000);
      let res;
      try {
        res = await planitPage({ ...base, page: String(page) });
      } catch (e) {
        /* PlanIt's budget drains over about a quarter of an hour rather than
           refilling all at once: asked back to back it returned 262, then
           188, then 115 seconds. Anything we can sit out inside this route's
           five minutes is worth waiting for, because the alternative is
           re-fetching every page of this authority on the next run. */
        if (e instanceof RateLimited && e.retryAfter <= WAIT_OUT) {
          await wait((e.retryAfter + 3) * 1000);
          res = await planitPage({ ...base, page: String(page) });
        } else throw e;
      }
      read += res.records.length;
      for (const rec of res.records) {
        if (!looksRelevant(rec.description, rec.app_type)) continue;
        const postcode = postcodeOf(rec);
        if (!postcode) continue;
        const district = districtOf(postcode);
        if (!district || !wanted.has(district)) continue;
        await q(
          `INSERT INTO os_planning_applications
             (ref, authority, uid, address, postcode, district, house_number, description,
              app_type, app_state, app_size, started_on, decided_on, last_changed_on,
              council_url, planit_url, lat, lon, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
           ON CONFLICT (ref) DO UPDATE SET
             address = EXCLUDED.address, postcode = EXCLUDED.postcode, district = EXCLUDED.district,
             house_number = EXCLUDED.house_number,
             app_state = EXCLUDED.app_state, app_size = EXCLUDED.app_size,
             decided_on = EXCLUDED.decided_on, last_changed_on = EXCLUDED.last_changed_on,
             council_url = EXCLUDED.council_url, planit_url = EXCLUDED.planit_url,
             /* A reworded description is a different scheme; it goes back to be read. */
             kind = CASE WHEN os_planning_applications.description IS DISTINCT FROM EXCLUDED.description
                         THEN 'unread' ELSE os_planning_applications.kind END,
             description = EXCLUDED.description,
             updated_at = NOW()`,
          [
            rec.name,
            rec.area_name ?? authority,
            rec.uid,
            (rec.address ?? "").trim(),
            postcode,
            district,
            numberIn(rec.address),
            (rec.description ?? "").replace(/\s+/g, " ").trim().slice(0, 4000),
            rec.app_type,
            rec.app_state,
            rec.app_size,
            rec.start_date,
            rec.decided_date,
            rec.last_changed ? rec.last_changed.slice(0, 10) : null,
            rec.url,
            rec.link,
            rec.location_y,
            rec.location_x,
          ]
        );
        kept++;
      }
      if (res.to + 1 >= res.total || res.records.length === 0) break;
      if (page === maxPages) {
        /* Never finish quietly on a truncated read: the next run must know. */
        throw new Error(
          `${authority} has more than ${maxPages * 300} applications to look at and the run stopped at the page cap. Read it again, or narrow the months.`
        );
      }
    }
    await q(`UPDATE os_planning_sync SET status = 'done', rows_read = $2, rows_kept = $3, finished_at = NOW() WHERE id = $1`, [run.id, read, kept]);
    return { ok: true, authority, read, kept, pages: page };
  } catch (e) {
    const limited = e instanceof RateLimited;
    const reason = (e as Error).message;
    await q(
      `UPDATE os_planning_sync SET status = $4, rows_read = $2, rows_kept = $3, error = $5, finished_at = NOW() WHERE id = $1`,
      [run.id, read, kept, limited ? "rate_limited" : "failed", reason]
    );
    /* A rate limit is not a failure: what was read is kept and the next run
       picks up where this one stopped. */
    return { ok: limited, authority, read, kept, pages: page, reason, rateLimited: limited };
  }
}

/* ── Pass two: what is it, actually ───────────────────────────────────────── */

const READER_MODEL = "claude-opus-5";
/**
 * Output tokens a day, as a runaway guard rather than a budget.
 *
 * Measured: about 69 output tokens per application, so the weekly run over
 * the whole patch (roughly sixty applications) costs a few thousand and the
 * one-off first load of eighteen months costs around 200,000 across a couple
 * of days. Set well above the first load so it is not the thing that stops
 * it, and low enough that a loop bug cannot run all night.
 */
const READ_CAP = Number(process.env.BOND_PLANNING_DAILY_TOKEN_CAP ?? 250_000);
const BATCH = 20;

const READER_BRIEF = `You read UK planning application descriptions for a letting agent in Northamptonshire and Milton Keynes.

The agent wants one thing: does this application mean somebody will own a home they need to let or manage? Everything else is noise to them.

For each application, choose exactly one kind:

- "hmo" - the scheme creates or enlarges a house in multiple occupation: a C3 to C4 change of use, a sui generis HMO, more occupants in an existing HMO, bedsits.
- "flats" - one building becomes two or more self-contained homes: a house into flats, offices into apartments, a subdivision.
- "to_residential" - something that was not a home becomes one or more homes: a barn (including Class Q prior approval), a shop, an office, a pub, a agricultural building.
- "new_homes" - new homes are built on the plot, including replacement dwellings and demolition followed by houses.
- "none" - everything else.

"none" is the right answer most of the time. In particular these are all "none":
- Extensions, loft conversions, dormers, garage conversions, outbuildings, annexes and anything else that makes one household's own home bigger. The household is not a new tenancy.
- An HMO going back to a single family house, which is the opposite of what the agent wants.
- Care homes, children's homes, nursing homes, student halls, hotels, hostels and schools. They are not private rented homes.
- A home becoming a shop, cafe, restaurant or office.
- Anything about trees, signs, conditions, or amendments to an earlier permission.

Also give:
- "homes": how many separate homes the scheme creates or affects, as a whole number. Use the number in the description when there is one. Use 1 when it is clearly one home. Use 0 when you cannot tell.
- "summary": one short line, under 18 words, as an estate agent would say it to a colleague. No jargon, no use classes, no em dashes. For example "Three-bed house becoming a five-person HMO" or "Two offices above a shop turning into flats".
- "to_let": true when whoever ends up owning this will most likely LET it rather than live in it. An HMO is always true. Flats carved out of a building, a barn or an office turned into homes, and several houses on one plot are nearly always true. Set it FALSE when the description says the applicant is building or converting a home for themselves: a self build, a custom build, a replacement for their own house, an agricultural or rural worker's dwelling, or a single new house in the garden of the house they already own. When you cannot tell, true.
- "confident": true when the description says plainly what is happening, false when you are reading between the lines.

Return one object per application, in the order given, keyed by the id you were given.`;

const READER_SCHEMA = {
  type: "object",
  properties: {
    applications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["hmo", "flats", "to_residential", "new_homes", "none"] },
          homes: { type: "integer" },
          summary: { type: "string" },
          to_let: { type: "boolean" },
          confident: { type: "boolean" },
        },
        required: ["id", "kind", "homes", "summary", "to_let", "confident"],
        additionalProperties: false,
      },
    },
  },
  required: ["applications"],
  additionalProperties: false,
} as const;

interface ReadRow {
  id: string;
  kind: PlanningKind;
  homes: number;
  summary: string;
  to_let: boolean;
  confident: boolean;
}

async function readTokensToday(): Promise<number> {
  const [r] = await q<{ n: string }>(
    `SELECT COALESCE(SUM(out_tokens), 0)::text AS n FROM os_planning_sync WHERE started_at >= date_trunc('day', NOW())`
  );
  return Number(r?.n ?? 0);
}

/**
 * Read the applications nobody has read yet. Batched, and it stops on the
 * daily ceiling rather than running the bill up on a bad day.
 */
export async function readPlanning(limit = 200): Promise<{ read: number; skipped: string | null }> {
  if (!hasDb()) return { read: 0, skipped: "no database" };
  if (!process.env.ANTHROPIC_API_KEY) return { read: 0, skipped: "no ANTHROPIC_API_KEY, so nothing was read" };
  const pending = await q<{ ref: string; description: string; address: string; app_type: string | null; app_size: string | null }>(
    `SELECT ref, description, address, app_type, app_size FROM os_planning_applications
      WHERE kind = 'unread' ORDER BY started_on DESC NULLS LAST LIMIT $1`,
    [limit]
  );
  if (pending.length === 0) return { read: 0, skipped: null };
  if ((await readTokensToday()) >= READ_CAP) return { read: 0, skipped: "the daily reading ceiling is used up" };

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  let done = 0;
  let out = 0;

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const listing = batch
      .map((a, n) => `${n + 1}. id: ${a.ref}\n   address: ${a.address}\n   type: ${a.app_type ?? "unknown"} (${a.app_size ?? "unknown size"})\n   description: ${a.description}`)
      .join("\n\n");
    let res;
    try {
      res = await client.messages.parse({
        model: READER_MODEL,
        max_tokens: 4000,
        /* The brief never changes, so it caches; the applications ride after it. */
        system: [{ type: "text", text: READER_BRIEF, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "low", format: { type: "json_schema", schema: READER_SCHEMA } },
        messages: [{ role: "user", content: `Read these ${batch.length} planning applications.\n\n${listing}` }],
      });
    } catch (e) {
      console.error("[planning] reader", (e as Error).message);
      break;
    }
    out += res.usage?.output_tokens ?? 0;
    const rows = (res.parsed_output as { applications?: ReadRow[] } | null)?.applications ?? [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!batch.some((b) => b.ref === row.id) || seen.has(row.id)) continue;
      seen.add(row.id);
      await q(
        `UPDATE os_planning_applications
            SET kind = $2, homes = $3, summary = $4, to_let = $5, confident = $6, read_at = NOW(), updated_at = NOW()
          WHERE ref = $1`,
        [
          row.id,
          row.kind,
          Number.isFinite(row.homes) ? Math.max(0, Math.trunc(row.homes)) : 0,
          (row.summary ?? "").replace(/\s*[—–]\s*/g, " - ").slice(0, 200),
          !!row.to_let,
          !!row.confident,
        ]
      );
      done++;
    }
    if (out >= READ_CAP) break;
  }

  if (out > 0) {
    await q(`INSERT INTO os_planning_sync (authority, status, rows_read, rows_kept, out_tokens, finished_at) VALUES ('read', 'done', $1, $2, $3, NOW())`, [
      pending.length,
      done,
      out,
    ]);
  }
  return { read: done, skipped: null };
}

/* ── Onto the board ───────────────────────────────────────────────────────── */

/** Kinds that carry a signal, strongest first. */
const SIGNALLING = ["hmo", "flats", "to_residential", "new_homes"] as const;
/** A decision that is still alive. A refusal is kept, and shown, but scores nothing. */
const LIVE_STATES = ["Permitted", "Conditions", "Undecided"];
/** Eighteen months. Older than that and the work is done and the house is let. */
const WINDOW_DAYS = 548;

/**
 * Stamp the application onto every door on the same address, and add its
 * signal. Runs after every rescore, like the HMO and company matches.
 *
 * Unlike those two, this one has no "only if the door already scores"
 * guard. An HMO licence or a poor certificate is a reason to prefer a door
 * that something else already flagged; a live permission to turn a house
 * into an HMO is a reason on its own, and the door being advertised nowhere
 * is the point rather than a disqualification. So a quiet door with a
 * permission comes back onto the list.
 *
 * Matching is postcode plus leading house number, the same rule the rest of
 * Bond uses. It only ever reaches doors the sweep already knows about; the
 * applications on doors that are NOT on the market are the valuable half and
 * they live in the Planning room, where a person pins them to a front door
 * through the property register.
 */
export async function matchPlanning(): Promise<{ matched: number }> {
  if (!hasDb()) return { matched: 0 };
  const rows = await q<{ property_key: string }>(
    `WITH p AS (
       SELECT property_key, postcode,
              upper((regexp_match(coalesce(resolved_address, address), '\\d+[A-Za-z]?'))[1]) AS num
         FROM os_radar_prospects
     ),
     m AS (
       SELECT DISTINCT ON (p.property_key)
              p.property_key, a.ref, a.kind, a.app_state, a.started_on, a.summary, a.homes
         FROM p JOIN os_planning_applications a
           ON upper(a.postcode) = upper(p.postcode)
          AND p.num IS NOT NULL AND a.house_number = p.num
        WHERE a.kind = ANY($1::text[])
          AND a.app_state = ANY($2::text[])
          AND a.started_on >= CURRENT_DATE - $3::int
          AND a.to_let IS NOT FALSE
        ORDER BY p.property_key, (a.kind = 'hmo') DESC, a.started_on DESC
     )
     UPDATE os_radar_prospects r
        SET planning_ref = m.ref, planning_kind = m.kind, planning_state = m.app_state,
            planning_on = m.started_on, planning_summary = m.summary, planning_homes = m.homes,
            updated_at = NOW()
       FROM m WHERE r.property_key = m.property_key
      RETURNING r.property_key`,
    [SIGNALLING as unknown as string[], LIVE_STATES, WINDOW_DAYS]
  );

  for (const [key, weight] of [["hmo", 40], ["homes", 30]] as const) {
    await q(
      `UPDATE os_radar_prospects
          SET signals = signals || jsonb_build_array(jsonb_build_object(
                'key', $1::text,
                'detail', coalesce(nullif(planning_summary, ''), 'Planning application on this address')
                          || ' (' || lower(planning_state) || ' ' || to_char(planning_on, 'Mon YYYY') || ')')),
              score = score + $2::int,
              /* It only fires once per door, so this is news, not churn. */
              last_signal_at = NOW(),
              updated_at = NOW()
        WHERE planning_ref IS NOT NULL
          AND planning_on >= CURRENT_DATE - $3::int
          AND ($1 = 'planning_hmo') = (planning_kind = 'hmo')
          AND NOT (signals @> jsonb_build_array(jsonb_build_object('key', $1::text)))`,
      [key === "hmo" ? "planning_hmo" : "planning_homes", weight, WINDOW_DAYS]
    );
  }
  return { matched: rows.length };
}

/* ── The Planning room ────────────────────────────────────────────────────── */

export interface PlanningApplication {
  ref: string;
  authority: string;
  address: string;
  postcode: string;
  district: string | null;
  description: string;
  kind: PlanningKind;
  homes: number | null;
  summary: string | null;
  to_let: boolean | null;
  confident: boolean | null;
  app_state: string | null;
  app_size: string | null;
  started_on: string | null;
  decided_on: string | null;
  council_url: string | null;
  planit_url: string | null;
  lat: number | null;
  lon: number | null;
  /** The flagged door this sits on, when the sweep already knows it. */
  property_key: string | null;
}

export interface PlanningStatus {
  authorities: PlanningAuthority[];
  held: number;
  unread: number;
  live: number;
  onTheBoard: number;
  /** Live, and on no door the sweep knows. Counted here rather than from the
   *  list, which is capped and would under-report it. */
  notOnTheBoard: number;
  /** Homes the applicant will plainly live in. Counted, kept, never listed. */
  ownerOccupier: number;
  byKind: Record<string, number>;
  lastRun: { authority: string; status: string; rows_read: number; rows_kept: number; error: string | null; started_at: string } | null;
  reader: "ready" | "no key";
}

export async function planningStatus(districts?: string[]): Promise<PlanningStatus> {
  const authorities = PLANNING_AUTHORITIES;
  const reader: PlanningStatus["reader"] = process.env.ANTHROPIC_API_KEY ? "ready" : "no key";
  if (!hasDb()) return { authorities, held: 0, unread: 0, live: 0, onTheBoard: 0, notOnTheBoard: 0, ownerOccupier: 0, byKind: {}, lastRun: null, reader };
  const scope = districts && districts.length > 0 ? districts : null;
  const [t] = await q<{ held: string; unread: string; live: string; board: string; fresh: string; own: string }>(
    `SELECT count(*) AS held,
            count(*) FILTER (WHERE kind = 'unread') AS unread,
            count(*) FILTER (WHERE kind = ANY($2::text[]) AND app_state = ANY($3::text[])
                             AND started_on >= CURRENT_DATE - $4::int AND to_let IS NOT FALSE) AS live,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM os_radar_prospects r WHERE r.planning_ref = os_planning_applications.ref)) AS board,
            count(*) FILTER (WHERE kind = ANY($2::text[]) AND app_state = ANY($3::text[])
                             AND started_on >= CURRENT_DATE - $4::int AND to_let IS NOT FALSE
                             AND NOT EXISTS (
                               SELECT 1 FROM os_radar_prospects r WHERE r.planning_ref = os_planning_applications.ref)) AS fresh,
            count(*) FILTER (WHERE kind = ANY($2::text[]) AND to_let IS FALSE) AS own
       FROM os_planning_applications
      WHERE ($1::text[] IS NULL OR district = ANY($1::text[]))`,
    [scope, SIGNALLING as unknown as string[], LIVE_STATES, WINDOW_DAYS]
  );
  const kinds = await q<{ kind: string; n: string }>(
    `SELECT kind, count(*) AS n FROM os_planning_applications
      WHERE ($1::text[] IS NULL OR district = ANY($1::text[]))
        AND to_let IS NOT FALSE
        AND app_state = ANY($2::text[])
        AND started_on >= CURRENT_DATE - $3::int
      GROUP BY kind`,
    [scope, LIVE_STATES, WINDOW_DAYS]
  );
  const runs = await q<NonNullable<PlanningStatus["lastRun"]> & Record<string, unknown>>(
    `SELECT authority, status, rows_read, rows_kept, error, started_at FROM os_planning_sync
      WHERE authority <> 'read' ORDER BY started_at DESC LIMIT 1`
  );
  return {
    authorities,
    held: Number(t?.held ?? 0),
    unread: Number(t?.unread ?? 0),
    live: Number(t?.live ?? 0),
    onTheBoard: Number(t?.board ?? 0),
    notOnTheBoard: Number(t?.fresh ?? 0),
    ownerOccupier: Number(t?.own ?? 0),
    byKind: Object.fromEntries(kinds.map((k) => [k.kind, Number(k.n)])),
    lastRun: runs[0] ? { ...runs[0], started_at: new Date(runs[0].started_at).toISOString() } : null,
    reader,
  };
}

/**
 * The room's list: live applications, strongest kind first, newest first,
 * inside the person's patch. `onlyNew` hides the ones already on the board,
 * which is the default because those already have a line and a signal.
 */
export async function listPlanning(opts: {
  districts?: string[];
  kind?: string;
  onlyNew?: boolean;
  includeDecided?: boolean;
  limit?: number;
} = {}): Promise<PlanningApplication[]> {
  if (!hasDb()) return [];
  const scope = opts.districts && opts.districts.length > 0 ? opts.districts : null;
  const kinds = opts.kind && (SIGNALLING as readonly string[]).includes(opts.kind) ? [opts.kind] : (SIGNALLING as unknown as string[]);
  return q<PlanningApplication & Record<string, unknown>>(
    `SELECT a.ref, a.authority, a.address, a.postcode, a.district, a.description, a.kind,
            a.homes, a.summary, a.to_let, a.confident, a.app_state, a.app_size,
            a.started_on::text AS started_on, a.decided_on::text AS decided_on,
            a.council_url, a.planit_url, a.lat, a.lon,
            r.property_key
       FROM os_planning_applications a
       LEFT JOIN os_radar_prospects r ON r.planning_ref = a.ref
      WHERE a.kind = ANY($1::text[])
        AND ($2::text[] IS NULL OR a.district = ANY($2::text[]))
        AND ($3::bool OR a.app_state = ANY($4::text[]))
        AND a.started_on >= CURRENT_DATE - $5::int
        AND ($6::bool = false OR r.property_key IS NULL)
        AND a.to_let IS NOT FALSE
      ORDER BY (a.kind = 'hmo') DESC, a.started_on DESC NULLS LAST
      LIMIT $7`,
    [kinds, scope, !!opts.includeDecided, LIVE_STATES, WINDOW_DAYS, !!opts.onlyNew, Math.min(opts.limit ?? 300, 500)]
  );
}
