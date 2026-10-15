import "server-only";
import { hasDb, q } from "@/lib/db";
import { TEST_STREET } from "@/lib/test-guard";
import { METRICS, type MetricDef } from "@/lib/tracking/metrics";
import { SECTIONS, SECTION_BY_KEY, normalisePage, pageLabel, sectionForApi, sectionForPage, type SectionKey } from "@/lib/tracking/sections";
import { londonDate } from "@/lib/tracking/period";
import { dropsOf, funnelOf, passportLine, type PassportLine, type PassportRow } from "@/lib/tracking/passport";

/**
 * Admin > Tracking's figures (15 Oct 2026): who uses what, how much, and what
 * it produced, for any period.
 *
 * Three kinds of record, all already kept:
 *   - page views (os_page_views): every screen opened, per person per day,
 *     since 28 Aug 2026; time on the page from 15 Oct 2026;
 *   - the read log (os_read_log): every call made while signed in, since
 *     10 Oct 2026 - any call that is not a read is "something done";
 *   - each part's own tables (lib/tracking/metrics).
 *
 * Live every time: nothing is stored or seeded. The raw rows for a period are
 * held for a minute so moving between the sections does not ask the database
 * the same question again; the live screens are never touched by any of it.
 *
 * Left out of every figure:
 *   - test files: anything Create a test made (os_test_kits, test contacts,
 *     negative listing and application ids, 14 Test Street, rehearsals), and
 *     anything whose customer is one of our own staff addresses;
 *   - an owner wearing somebody else's face (view as);
 *   - unless asked for, the owners' own use (James, Susan, Howard, Sean):
 *     James tests constantly, and his clicks would drown out the agents'.
 */

export interface Person {
  key: string;
  name: string;
  role: string | null;
  team: string;
  owner: boolean;
}

export interface Rec {
  at: string;
  person: string;
  personName: string;
  title: string;
  href: string | null;
}

type Raw = {
  at: Date | string | null;
  who: string | null;
  title: string | null;
  href: string | null;
  email: string | null;
  address: string | null;
  ids: (string | null)[] | null;
  test: boolean | null;
};

const TEAM_OF: Record<string, string> = {
  agent: "Agents",
  pretenancy: "Office",
  compliance: "Office",
  marketing: "Office",
  support: "Office",
  developer: "Office",
  owner: "Owners",
  super_admin: "Owners",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

/* ── people ─────────────────────────────────────────────────────────────── */

interface People {
  all: Person[];
  resolve(raw: string | null | undefined, nobody?: string): Person;
}

async function loadPeople(): Promise<People> {
  const rows = await q<{ id: string; email: string; name: string; role: string | null }>(`SELECT id, email, name, role FROM os_users`);
  const all: Person[] = rows.map((r) => ({
    key: r.id,
    name: (r.name || r.email).trim(),
    role: r.role,
    team: TEAM_OF[r.role ?? "agent"] ?? "Agents",
    owner: r.role === "owner" || r.role === "super_admin",
  }));
  const byId = new Map(all.map((p) => [p.key, p]));
  const byEmail = new Map(rows.map((r) => [r.email.toLowerCase(), byId.get(r.id)!]));
  const byName = new Map(all.map((p) => [norm(p.name), p]));
  /* "Lianna Jane Denholm" on the account, "Lianna Denholm" in REX: first and
     last word. Only when it is unambiguous. */
  const firstLast = new Map<string, Person | null>();
  for (const p of all) {
    const w = norm(p.name).split(" ");
    const k = `${w[0]} ${w[w.length - 1]}`;
    firstLast.set(k, firstLast.has(k) ? null : p);
  }
  const resolve = (raw: string | null | undefined, nobody?: string): Person => {
    const v = (raw ?? "").trim();
    if (!v) return { key: "nobody", name: nobody ?? "Nobody named", role: null, team: "Automatic or customer", owner: false };
    const hit = byId.get(v) ?? byEmail.get(v.toLowerCase()) ?? byName.get(norm(v));
    if (hit) return hit;
    const w = norm(v).split(" ");
    const fl = w.length > 1 ? firstLast.get(`${w[0]} ${w[w.length - 1]}`) : null;
    if (fl) return fl;
    if (/^[0-9a-f]{24}$/.test(v)) return { key: `id:${v}`, name: "An account no longer on the OS", role: null, team: "Not on the OS", owner: false };
    return { key: `n:${v.toLowerCase()}`, name: v, role: null, team: "Not on the OS", owner: false };
  };
  return { all, resolve };
}

/* ── test files ─────────────────────────────────────────────────────────── */

interface Tests {
  ids: Set<string>;
  emails: Set<string>;
}

function collect(v: unknown, into: Set<string>) {
  if (typeof v === "string" || typeof v === "number") into.add(String(v).trim().toLowerCase());
  else if (Array.isArray(v)) v.forEach((x) => collect(x, into));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, into));
}

async function loadTests(): Promise<Tests> {
  const [kits, records, contacts, staff] = await Promise.all([
    q<{ id: string; refs: unknown; links: unknown }>(`SELECT id, refs, links FROM os_test_kits`),
    q<{ id: string; kit_id: string; owner_email: string }>(`SELECT id, kit_id, owner_email FROM os_test_records`),
    q<{ id: string; rex_id: string | null; email: string | null }>(`SELECT id::text AS id, rex_id, email FROM os_contacts WHERE is_test`),
    q<{ email: string }>(`SELECT lower(email) AS email FROM os_users UNION SELECT lower(email) FROM os_teg_people WHERE email IS NOT NULL`),
  ]);
  const ids = new Set<string>();
  for (const k of kits) {
    ids.add(k.id.toLowerCase());
    collect(k.refs, ids);
  }
  for (const r of records) ids.add(r.id.toLowerCase());
  for (const c of contacts) {
    ids.add(c.id.toLowerCase());
    ids.add(`os-${c.id.toLowerCase()}`);
    if (c.rex_id) ids.add(String(c.rex_id).toLowerCase());
  }
  const emails = new Set<string>(staff.map((s) => s.email));
  for (const c of contacts) if (c.email) emails.add(c.email.toLowerCase());
  for (const v of ids) if (v.includes("@")) emails.add(v);
  return { ids, emails };
}

function isTestRow(r: Raw, t: Tests): boolean {
  if (r.test) return true;
  if (r.email && t.emails.has(r.email.trim().toLowerCase())) return true;
  if (r.address && (TEST_STREET.test(r.address) || /\b30\s+Test\s+Road\b/i.test(r.address))) return true;
  for (const raw of r.ids ?? []) {
    if (!raw) continue;
    const id = String(raw).trim().toLowerCase();
    if (t.ids.has(id)) return true;
    if (/^-\d+$/.test(id) || /^test-/.test(id)) return true;
  }
  return false;
}

/* ── raw rows, held for a minute ───────────────────────────────────────── */

/**
 * Calls that are not a read but are not somebody doing something either: the
 * screens make them by themselves. Left out of "done" so it means a person
 * saved, sent or changed something.
 */
const AUTOMATIC_WRITES = [
  "/api/launch/ready", // the phone app saying it was opened (components/app/AppSeen)
  "/api/push/subscribe", // phone alerts re-registering on each visit
  "/api/bugs/auto", // an error the OS caught and logged itself
  "/api/contacts/match", // looking up a contact while a form is typed in
  "/api/assistant/brief", // Steve's morning briefing, given on the first visit of the day
  "/api/tenant/passport/status", // reading where passports stand, sent as a POST
  "/api/compliance/certificates/read", // reading an uploaded certificate, after the upload itself
];

type ViewRow = { user_id: string; path: string; day: string; views: number; seconds: number; timed: number };
type CallRow = { user_id: string; seg: string; day: string; calls: number; writes: number };

interface RawPeriod {
  since: { time: string | null; passportOpens: string | null; phone: string | null };
  views: ViewRow[] | Error;
  calls: CallRow[] | Error;
  metrics: Map<string, Raw[] | Error>;
  passports: PassportRow[] | Error;
  people: People;
  tests: Tests;
}

const G = globalThis as { __osTrackingCache?: Map<string, { at: number; p: Promise<RawPeriod> }> };
const cache = (G.__osTrackingCache ??= new Map());
const HOLD_MS = 60_000;

const safe = <T>(p: Promise<T>): Promise<T | Error> => p.catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));

async function readPeriod(from: Date, to: Date): Promise<RawPeriod> {
  /* Days are London's: the page-view table keeps a day, not a time. */
  const fromDay = londonDate(from);
  const toDay = londonDate(new Date(to.getTime() - 1));
  const [people, tests, since, views, calls, passports, ...metricRows] = await Promise.all([
    loadPeople(),
    loadTests(),
    /* When the records that only started on 15 Oct 2026 first hold anything,
       so the screen can say "since" with a real date. */
    q<{ time: string | null; opens: string | null; phone: string | null }>(
      `SELECT (SELECT min(day)::text FROM os_page_views WHERE timed > 0) AS time,
              (SELECT min(opened_at)::text FROM os_tenant_passports) AS opens,
              (SELECT min(day)::text FROM os_page_views WHERE path = '/agent' OR path LIKE '/agent/%' OR path = '/m' OR path LIKE '/m/%') AS phone`
    ).then((r) => ({ time: r[0]?.time ?? null, passportOpens: r[0]?.opens ?? null, phone: r[0]?.phone ?? null })),
    safe(
      q<ViewRow>(
        `SELECT user_id, path, day::text AS day, sum(views)::int AS views, sum(seconds)::int AS seconds, sum(timed)::int AS timed
           FROM os_page_views WHERE day >= $1::date AND day <= $2::date GROUP BY 1, 2, 3`,
        [fromDay, toDay]
      )
    ),
    /* Grouped in the database: a month of the read log is hundreds of
       thousands of rows, and only these totals leave it. */
    safe(
      q<CallRow>(
        `SELECT user_id, split_part(path, '/', 3) AS seg, (at AT TIME ZONE 'Europe/London')::date::text AS day,
                count(*)::int AS calls,
                /* Saves to the same place in the same minute count once: the
                   profile and other forms save as somebody types, which is one
                   thing done, not forty. */
                (count(DISTINCT method || path || date_trunc('minute', at)::text) FILTER (WHERE method <> 'GET' AND NOT (path = ANY($3))))::int AS writes
           FROM os_read_log WHERE at >= $1 AND at < $2 AND viewing_as IS NULL GROUP BY 1, 2, 3`,
        [from, to, AUTOMATIC_WRITES]
      )
    ),
    safe(
      q<PassportRow>(
        `SELECT token, name, email, agent_id, invited_by, invited_at, opened_at, opens, submitted_at, updated_at, scottish_home, data, contact_id
           FROM os_tenant_passports
          WHERE invited_at >= $1 AND invited_at < $2 AND contact_id IS DISTINCT FROM 'demo'`,
        [from, to]
      )
    ),
    ...METRICS.map((m) => safe(q<Raw>(m.sql, [from, to]))),
  ]);
  const metrics = new Map<string, Raw[] | Error>();
  METRICS.forEach((m, i) => metrics.set(m.key, metricRows[i]));
  return { people, tests, since, views, calls, passports, metrics };
}

function period(from: Date, to: Date): Promise<RawPeriod> {
  const key = `${from.toISOString()}|${to.toISOString()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < HOLD_MS) return hit.p;
  for (const [k, v] of cache) if (Date.now() - v.at >= HOLD_MS) cache.delete(k);
  const p = readPeriod(from, to);
  cache.set(key, { at: Date.now(), p });
  p.catch(() => cache.delete(key));
  return p;
}

/* ── shaping ────────────────────────────────────────────────────────────── */

export interface Options {
  from: Date;
  to: Date;
  /** Count the owners' own use too. */
  owners: boolean;
  /** Only this person (a Person key). */
  person?: string | null;
}

interface Usage {
  person: Person;
  section: SectionKey | null;
  page: string;
  day: string;
  views: number;
  seconds: number;
  timed: number;
  calls: number;
  writes: number;
}

/** Page views and calls, one row each, resolved to a person and a part of the OS. */
function usageRows(raw: RawPeriod, o: Options): Usage[] {
  const out: Usage[] = [];
  const keep = (p: Person) => (o.owners || !p.owner) && (!o.person || p.key === o.person);
  if (!(raw.views instanceof Error)) {
    for (const v of raw.views) {
      const person = raw.people.resolve(v.user_id);
      if (!keep(person)) continue;
      const page = normalisePage(v.path);
      out.push({ person, section: sectionForPage(page), page, day: v.day, views: v.views, seconds: v.seconds, timed: v.timed, calls: 0, writes: 0 });
    }
  }
  if (!(raw.calls instanceof Error)) {
    for (const c of raw.calls) {
      const person = raw.people.resolve(c.user_id);
      if (!keep(person)) continue;
      out.push({ person, section: sectionForApi(c.seg), page: "", day: c.day, views: 0, seconds: 0, timed: 0, calls: c.calls, writes: c.writes });
    }
  }
  return out;
}

interface MetricResult {
  def: MetricDef;
  error: string | null;
  recs: Rec[];
  /** Person key per record, for counting by person. */
  people: Person[];
}

function metricResults(raw: RawPeriod, o: Options, only?: SectionKey): MetricResult[] {
  return METRICS.filter((m) => !only || m.section === only).map((def) => {
    const rows = raw.metrics.get(def.key);
    if (!rows || rows instanceof Error) {
      return { def, error: rows instanceof Error ? "This figure couldn't be read just now." : "Not read.", recs: [], people: [] };
    }
    const recs: Rec[] = [];
    const people: Person[] = [];
    for (const r of rows) {
      if (!r.at || isTestRow(r, raw.tests)) continue;
      const person = raw.people.resolve(r.who, def.nobody);
      if (person.owner && !o.owners) continue;
      if (o.person && person.key !== o.person) continue;
      people.push(person);
      recs.push({ at: new Date(r.at).toISOString(), person: person.key, personName: person.name, title: (r.title ?? "").trim() || "A record", href: r.href });
    }
    const order = recs.map((_, i) => i).sort((a, b) => recs[b].at.localeCompare(recs[a].at));
    return { def, error: null, recs: order.map((i) => recs[i]), people: order.map((i) => people[i]) };
  });
}

function passportLines(raw: RawPeriod, o: Options): PassportLine[] | Error {
  if (raw.passports instanceof Error) return raw.passports;
  const out: PassportLine[] = [];
  for (const r of raw.passports) {
    const row = r as PassportRow & { contact_id?: string | null };
    if (isTestRow({ at: r.invited_at, who: null, title: null, href: null, email: r.email, address: null, ids: [r.token, row.contact_id ?? null], test: false }, raw.tests)) continue;
    const person = raw.people.resolve(r.agent_id ?? r.invited_by);
    if (person.owner && !o.owners) continue;
    if (o.person && person.key !== o.person) continue;
    out.push(passportLine(r));
  }
  return out;
}

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);

function inScope(people: People, o: Options): Person[] {
  return people.all.filter((p) => (o.owners || !p.owner) && (!o.person || p.key === o.person));
}

/* ── the overview ───────────────────────────────────────────────────────── */

export async function overview(o: Options) {
  if (!hasDb()) throw new Error("No database on this environment.");
  const raw = await period(o.from, o.to);
  const usage = usageRows(raw, o);
  const metrics = metricResults(raw, o);
  const lines = passportLines(raw, o);

  const sections = SECTIONS.map((s) => {
    const u = usage.filter((x) => x.section === s.key);
    const ms = metrics.filter((m) => m.def.section === s.key);
    /* Somebody used a part if they opened its screens or did something in
       it. A read alone is not enough: the dashboard reads leads, listings and
       the diary for its own tiles, which is not somebody using Leads. */
    const who = new Set(u.filter((x) => x.views || x.writes).map((x) => x.person.key));
    for (const m of ms) if (!m.def.automatic) for (const p of m.people) if (p.key !== "nobody" && !p.key.startsWith("n:")) who.add(p.key);
    return {
      key: s.key,
      label: s.label,
      icon: s.icon,
      blurb: s.blurb,
      people: who.size,
      opens: sum(u, (x) => x.views),
      actions: sum(u, (x) => x.writes),
      seconds: sum(u, (x) => x.seconds),
      timed: sum(u, (x) => x.timed),
      hasPages: s.pages.length > 0,
      metrics: ms.map((m) => ({ key: m.def.key, label: m.def.label, count: m.recs.length, error: m.error })),
    };
  });

  /* People: what each did in the period, everyone in scope listed - a zero is a finding. */
  const people = inScope(raw.people, o).map((p) => {
    const u = usage.filter((x) => x.person.key === p.key);
    const outcomes = sum(metrics.filter((m) => !m.def.automatic), (m) => m.people.filter((x) => x.key === p.key).length);
    const bySection = new Map<string, number>();
    for (const x of u) if (x.section) bySection.set(x.section, (bySection.get(x.section) ?? 0) + x.views + x.writes);
    const top = [...bySection.entries()].sort((a, b) => b[1] - a[1])[0];
    const days = new Set(u.filter((x) => x.views || x.calls).map((x) => x.day));
    return {
      key: p.key,
      name: p.name,
      team: p.team,
      opens: sum(u, (x) => x.views),
      actions: sum(u, (x) => x.writes),
      outcomes,
      days: days.size,
      seconds: sum(u, (x) => x.seconds),
      topSection: top ? SECTION_BY_KEY.get(top[0] as SectionKey)?.label ?? null : null,
    };
  });
  people.sort((a, b) => b.opens + b.actions - (a.opens + a.actions) || a.name.localeCompare(b.name));

  /* Pages, for the longest stay. Three timed visits before a page can top it. */
  const pages = pagesOf(usage);
  const timedPages = pages.filter((p) => p.timed >= 3).sort((a, b) => b.seconds / b.timed - a.seconds / a.timed);

  const withPages = sections.filter((s) => s.hasPages);
  const byOpens = [...withPages].sort((a, b) => b.opens - a.opens);
  const opened = byOpens.filter((s) => s.opens > 0);
  const headline = (k: string) => {
    const m = metrics.find((x) => x.def.key === k)!;
    return { key: k, label: m.def.label, section: m.def.section, count: m.recs.length, people: new Set(m.people.map((p) => p.key)).size, error: m.error };
  };
  const funnel = lines instanceof Error ? null : funnelOf(lines);
  const active = people.filter((p) => p.opens + p.actions > 0);

  return {
    sources: {
      pageViews: raw.views instanceof Error ? "Page views couldn't be read just now." : null,
      readLog: raw.calls instanceof Error ? "The read log couldn't be read just now." : null,
      passports: lines instanceof Error ? "Passports couldn't be read just now." : null,
    },
    highlights: {
      active: active.length,
      accounts: people.length,
      mostUsed: opened[0] ? { key: opened[0].key, label: opened[0].label, opens: opened[0].opens, people: opened[0].people } : null,
      leastUsed: opened.length > 1 ? { key: opened[opened.length - 1].key, label: opened[opened.length - 1].label, opens: opened[opened.length - 1].opens, people: opened[opened.length - 1].people } : null,
      neverOpened: withPages.filter((s) => s.opens === 0).map((s) => s.label),
      busiest: active[0] ? { key: active[0].key, name: active[0].name, opens: active[0].opens, actions: active[0].actions } : null,
      passport: funnel ? { sent: funnel.sent, finished: funnel.finished } : null,
      longestStay: timedPages[0] ? { page: timedPages[0].page, label: timedPages[0].label, avgSeconds: Math.round(timedPages[0].seconds / timedPages[0].timed) } : null,
      timedAny: pages.some((p) => p.timed > 0),
      outcomes: METRICS.filter((m) => m.headline).map((m) => headline(m.key)),
    },
    sections,
    people,
    since: raw.since,
  };
}

/* ── pages ──────────────────────────────────────────────────────────────── */

function pagesOf(usage: Usage[]) {
  const by = new Map<string, { page: string; views: number; seconds: number; timed: number; people: Map<string, { name: string; views: number; seconds: number; timed: number }> }>();
  for (const u of usage) {
    if (!u.page) continue;
    const p = by.get(u.page) ?? { page: u.page, views: 0, seconds: 0, timed: 0, people: new Map() };
    p.views += u.views;
    p.seconds += u.seconds;
    p.timed += u.timed;
    const who = p.people.get(u.person.key) ?? { name: u.person.name, views: 0, seconds: 0, timed: 0 };
    who.views += u.views;
    who.seconds += u.seconds;
    who.timed += u.timed;
    p.people.set(u.person.key, who);
    by.set(u.page, p);
  }
  return [...by.values()]
    .map((p) => ({
      page: p.page,
      label: pageLabel(p.page),
      section: sectionForPage(p.page),
      views: p.views,
      seconds: p.seconds,
      timed: p.timed,
      people: p.people.size,
      byPerson: [...p.people.entries()]
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.views - a.views),
    }))
    .sort((a, b) => b.views - a.views);
}

export async function pages(o: Options) {
  if (!hasDb()) throw new Error("No database on this environment.");
  const raw = await period(o.from, o.to);
  if (raw.views instanceof Error) return { error: "Page views couldn't be read just now.", pages: [] as ReturnType<typeof pagesOf>, since: raw.since };
  return { error: null, pages: pagesOf(usageRows(raw, o)), since: raw.since };
}

/* ── one part of the OS ─────────────────────────────────────────────────── */

const RECORDS_SHOWN = 400;

export async function section(key: SectionKey, o: Options) {
  if (!hasDb()) throw new Error("No database on this environment.");
  const def = SECTION_BY_KEY.get(key);
  if (!def) return null;
  const raw = await period(o.from, o.to);
  const usage = usageRows(raw, o).filter((x) => x.section === key);
  const metrics = metricResults(raw, o, key);

  const scope = inScope(raw.people, o);
  const keys = new Map<string, Person>(scope.map((p) => [p.key, p]));
  for (const u of usage) keys.set(u.person.key, u.person);
  for (const m of metrics) for (const p of m.people) keys.set(p.key, p);

  const people = [...keys.values()]
    .map((p) => {
      const u = usage.filter((x) => x.person.key === p.key);
      const counts: Record<string, number> = {};
      for (const m of metrics) counts[m.def.key] = m.people.filter((x) => x.key === p.key).length;
      return {
        key: p.key,
        name: p.name,
        team: p.team,
        opens: sum(u, (x) => x.views),
        actions: sum(u, (x) => x.writes),
        seconds: sum(u, (x) => x.seconds),
        timed: sum(u, (x) => x.timed),
        days: new Set(u.filter((x) => x.views || x.writes).map((x) => x.day)).size,
        counts,
      };
    })
    .sort((a, b) => {
      const ta = a.opens + a.actions + Object.values(a.counts).reduce((n, v) => n + v, 0);
      const tb = b.opens + b.actions + Object.values(b.counts).reduce((n, v) => n + v, 0);
      return tb - ta || a.name.localeCompare(b.name);
    });

  /* Every day of the period, zeroes included, so a quiet day shows as one. */
  const days: Array<{ day: string; opens: number; actions: number; outcomes: number }> = [];
  for (let t = new Date(`${londonDate(o.from)}T12:00:00Z`); londonDate(t) <= londonDate(new Date(o.to.getTime() - 1)); t = new Date(t.getTime() + 86400000)) {
    const day = londonDate(t);
    days.push({
      day,
      opens: sum(usage.filter((x) => x.day === day), (x) => x.views),
      actions: sum(usage.filter((x) => x.day === day), (x) => x.writes),
      outcomes: sum(metrics, (m) => m.recs.filter((r) => londonDate(r.at) === day).length),
    });
  }

  const deliberate = metrics.filter((m) => !m.def.automatic).map((m) => m.def.key);
  const results = (p: { counts: Record<string, number> }) => sum(deliberate, (k) => p.counts[k] ?? 0);
  const teams = ["Agents", "Office", "Owners", "Not on the OS", "Automatic or customer"]
    .map((team) => {
      const rows = people.filter((p) => p.team === team);
      return {
        team,
        people: rows.filter((p) => p.opens + p.actions + results(p) > 0).length,
        opens: sum(rows, (p) => p.opens),
        actions: sum(rows, (p) => p.actions),
        outcomes: sum(rows, results),
      };
    })
    .filter((t) => t.opens + t.actions + t.outcomes > 0);

  const passport = key === "passport" ? passportDetail(raw, o) : null;

  return {
    section: { key: def.key, label: def.label, blurb: def.blurb, hasPages: def.pages.length > 0 },
    sources: {
      pageViews: raw.views instanceof Error ? "Page views couldn't be read just now." : null,
      readLog: raw.calls instanceof Error ? "The read log couldn't be read just now." : null,
    },
    people,
    teams,
    days,
    metrics: metrics.map((m) => ({
      key: m.def.key,
      label: m.def.label,
      source: m.def.source,
      since: m.def.since ?? null,
      error: m.error,
      count: m.recs.length,
      people: new Set(m.people.map((p) => p.key)).size,
      records: m.recs.slice(0, RECORDS_SHOWN),
    })),
    pages: pagesOf(usage),
    passport,
    since: raw.since,
  };
}

function passportDetail(raw: RawPeriod, o: Options) {
  const lines = passportLines(raw, o);
  if (lines instanceof Error) return { error: "Passports couldn't be read just now.", funnel: null, drops: [], list: [] };
  const list = lines
    .map((l) => {
      const agent = raw.people.resolve(l.agentRaw);
      return { ...l, agent: agent.name, agentKey: agent.key };
    })
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  /* By agent: how each one's passports are doing. */
  const byAgent = new Map<string, { key: string; name: string; lines: PassportLine[] }>();
  for (const l of list) {
    const a = byAgent.get(l.agentKey) ?? { key: l.agentKey, name: l.agent, lines: [] };
    a.lines.push(l);
    byAgent.set(l.agentKey, a);
  }
  return {
    error: null,
    funnel: funnelOf(lines),
    drops: dropsOf(lines),
    agents: [...byAgent.values()].map((a) => ({ key: a.key, name: a.name, ...funnelOf(a.lines) })).sort((a, b) => b.sent - a.sent),
    list,
  };
}
