import "server-only";
import { demoWorld, rexTime, type DemoWorld } from "./world";

/**
 * REX, AS THE DEMO HEARS IT (lib/demo/mode).
 *
 * In the demo the two REX clients (lib/rex, lib/business/rex) never reach the
 * network. They hand `Service/method` and the body here, and this answers in
 * REX's own envelope from the invented world (lib/demo/world).
 *
 * ── How a question is answered ────────────────────────────────────────────
 *
 * Most of REX is the same four verbs over a list of records, so most of this
 * is one small engine rather than a handler a call:
 *
 *   search        the rows that pass the criteria, in order, a page of them
 *   read          one row by id
 *   update        the fields sent, laid over the row (a press in the demo
 *                 changes what the next screen shows)
 *   create        a new row with the next id
 *
 * Criteria are read the way REX reads them: `name` is a field, with or
 * without its record's prefix ("lead.assignee_id") and with `_id` meaning the
 * id of the thing it points at ("listing_agent_1_id" is listing_agent_1.id).
 * A filter this does not recognise FAILS the search rather than being
 * ignored: showing an agent everybody's leads because a filter was skipped is
 * the one mistake a demo must not teach.
 *
 * ── What it does not know ─────────────────────────────────────────────────
 *
 * An unknown call answers 400 with a sentence, never 500 (three of those and
 * the OS decides REX is down) and never an empty 200 (which reads as "there
 * is nothing", and a cache would keep it). Each unknown call is logged once,
 * so the gap is visible in the demo service's log: see docs/DEMO-COPY.md for
 * how to close one.
 */

type Row = Record<string, unknown>;
export type DemoRexAnswer = { status: number; ok: boolean; result: unknown; error: string | null };

const ok = (result: unknown): DemoRexAnswer => ({ status: 200, ok: true, result, error: null });
const refuse = (message: string, status = 400): DemoRexAnswer => ({ status, ok: false, result: undefined, error: `${message} (DemoWorld)` });

/** Which list of the world a REX service reads. */
const COLLECTION: Record<string, string> = {
  Listings: "listings", Properties: "properties", Contacts: "contacts", Leads: "leads", AccountUsers: "users",
  ComplianceEntries: "compliance", CalendarEvents: "events", TenancyApplications: "applications", Appraisals: "appraisals",
  KeyRegister: "keys", Feedback: "feedback", Documents: "documents", EsignRequests: "esign", EsignTemplates: "esignTemplates",
  ListingPortalUploads: "portalUploads", Calendars: "calendars", Notes: "notes", Reminders: "reminders", Tenancies: "tenancies",
  MailMergeEventLogs: "mailLogs", AdminPortalDefinitions: "portals", Holds: "holds", Offers: "offers",
};
/** The record's own prefix on a criterion ("lead.assignee_id"), dropped before the field is looked up. */
const PREFIXES = ["listing", "property", "contact", "lead", "application", "event", "calendar_event", "appraisal", "entry", "user", "document", "note", "tenancy"];

const seenUnknown = new Set<string>();
function unknown(what: string): DemoRexAnswer {
  if (!seenUnknown.has(what)) {
    seenUnknown.add(what);
    console.warn(`[demo-rex] no answer for ${what}`);
  }
  return refuse(`The demo has no answer for ${what}`);
}

/* ── Reading a field the way REX names it ────────────────────────────────── */

const MISSING = Symbol("missing");

function dig(row: Row, path: string): unknown {
  let at: unknown = row;
  for (const part of path.split(".")) {
    if (at == null || typeof at !== "object" || !(part in (at as Row))) return MISSING;
    at = (at as Row)[part];
  }
  return at;
}

/** The value a criterion is about: a plain field, "<thing>_id" as thing.id, or a dotted path. */
function field(row: Row, name: string): unknown {
  let n = name;
  const dot = n.indexOf(".");
  if (dot > 0 && PREFIXES.includes(n.slice(0, dot))) n = n.slice(dot + 1);
  const direct = dig(row, n);
  if (direct !== MISSING) return idOf(direct);
  if (n.endsWith("_id")) {
    const viaObject = dig(row, n.slice(0, -3));
    if (viaObject !== MISSING) return idOf(viaObject);
    /* "property_id" on a listing is property.id; "system_owner_user_id" likewise. */
    const hidden = dig(row, `_${n.slice(0, -3).replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())}Id`);
    if (hidden !== MISSING) return hidden;
  }
  return MISSING;
}

/** A REX "thing" is { id, text }; a criterion compares the id. Times are { time, tzid }. */
function idOf(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Row;
    if ("id" in o) return o.id;
    if ("time" in o) return o.time;
  }
  return v;
}

const same = (a: unknown, b: unknown) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase();

function compare(a: unknown, b: unknown): number {
  const na = Number(a), nb = Number(b);
  if (a !== "" && b !== "" && a != null && b != null && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  /* Dates: REX stores seconds, criteria arrive as "2026-11-17 18:25:26" or a day. */
  const asMs = (v: unknown) => {
    if (typeof v === "number") return v * 1000;
    const t = String(v);
    if (/[zZ]$|[+-]\d\d:?\d\d$/.test(t)) return Date.parse(t);
    return Date.parse(t.length <= 10 ? `${t}T00:00:00Z` : `${t.replace(" ", "T")}Z`);
  };
  const da = asMs(a), db = asMs(b);
  if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

type Criterion = { name?: string; type?: string; value?: unknown };

/** true / false, or null when the filter names a field this row does not have at all. */
function passes(row: Row, c: Criterion): boolean | null {
  const name = String(c.name ?? "");
  const type = String(c.type ?? "=").toLowerCase();
  const got = field(row, name);
  if (got === MISSING) return null;
  const want = c.value;
  switch (type) {
    case "=": case "eq": case "is": return want == null ? got == null : same(got, want);
    case "!=": case "<>": case "not": return !same(got, want);
    case "in": return Array.isArray(want) && want.some((w) => same(got, w));
    case "notin": case "not in": case "not_in": return !(Array.isArray(want) && want.some((w) => same(got, w)));
    case ">": return got != null && compare(got, want) > 0;
    case ">=": return got != null && compare(got, want) >= 0;
    case "<": return got != null && compare(got, want) < 0;
    case "<=": return got != null && compare(got, want) <= 0;
    case "like": {
      const w = String(want ?? "").toLowerCase();
      const g = String(got ?? "").toLowerCase().replace(/\s+/g, w.includes(" ") ? " " : "");
      const core = w.replace(/%/g, "");
      if (w.startsWith("%") && w.endsWith("%")) return g.includes(core);
      if (w.endsWith("%")) return g.startsWith(core);
      if (w.startsWith("%")) return g.endsWith(core);
      return g === core;
    }
    case "isnull": case "is null": return got == null;
    case "notnull": case "is not null": case "isnotnull": return got != null;
    default: return null;
  }
}

function search(rows: Row[], body: Row, what: string): DemoRexAnswer {
  const criteria = (Array.isArray(body.criteria) ? body.criteria : []) as Criterion[];
  let hit = rows.filter((r) => r.system_record_state !== "archived" || criteria.some((c) => c.name === "system_record_state"));
  for (const c of criteria) {
    const kept: Row[] = [];
    let unknownField = hit.length > 0;
    for (const r of hit) {
      const p = passes(r, c);
      if (p !== null) unknownField = false;
      if (p) kept.push(r);
    }
    if (unknownField) return unknown(`${what} filtered by "${c.name}" (${c.type ?? "="})`);
    hit = kept;
  }
  const order = body.order_by;
  const orders: [string, string][] = Array.isArray(order)
    ? (order as Row[]).map((o) => [String(o.name ?? Object.keys(o)[0] ?? ""), String(o.direction ?? Object.values(o)[0] ?? "asc")])
    : order && typeof order === "object" ? Object.entries(order as Record<string, string>) : [];
  for (const [name, dir] of orders.reverse()) {
    const sign = String(dir).toLowerCase() === "desc" ? -1 : 1;
    hit = [...hit].sort((a, b) => {
      const x = field(a, name), y = field(b, name);
      return sign * compare(x === MISSING ? null : x, y === MISSING ? null : y);
    });
  }
  const total = hit.length;
  const offset = Number(body.offset ?? 0) || 0;
  const limit = Math.min(Number(body.limit ?? 100) || 100, 1000);
  const page = hit.slice(offset, offset + limit);
  const out = body.result_format === "ids" ? page.map((r) => r.id) : page.map(clean);
  return ok({ rows: out, total, criteria, order_by: order ?? [], viewstate_id: null });
}

/** A row as it leaves: the world's own working fields (starting "_") stay behind. */
function clean(row: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(row)) if (!k.startsWith("_")) out[k] = row[k];
  return out;
}

const byId = (rows: Row[], id: unknown) => rows.find((r) => same(r.id, id));

/** REX's text search over a few fields, for the autocomplete boxes. */
function autocomplete(rows: Row[], body: Row, text: (r: Row) => string, label: (r: Row) => Row): DemoRexAnswer {
  const q = String(body.search_string ?? "").trim().toLowerCase();
  const limit = Number(body.limit ?? 10) || 10;
  const hits = q ? rows.filter((r) => text(r).toLowerCase().includes(q)) : [];
  return ok(hits.slice(0, limit).map(label));
}

/* ── The calls that are not one of the four verbs ────────────────────────── */

type Handler = (body: Row, w: DemoWorld) => DemoRexAnswer;

const SPECIAL: Record<string, Handler> = {
  "Authentication/login": () => ok({ token: "demo-world-token" }),
  "UserProfile/getAccessibleAccounts": () => ok([{ id: 1, name: "TLE OS Demo" }]),
  "EmailDropbox/getEmailDropboxAddressForUser": () => ok("dropbox@sandbox.invalid"),
  "CustomFields/getValuesKeyedByFieldName": () => ok({}),
  "CustomFields/getDefinition": () => ok({ tabs: [] }),
  "SystemValues/getCategoryValues": (b) =>
    ok(
      String(b.list_name ?? "").includes("subcat")
        ? ["Flat", "Terraced House", "Semi-Detached House", "Detached House", "Bungalow", "Maisonette"].map((t) => ({ id: t.toLowerCase().replace(/[^a-z]+/g, "_"), text: t }))
        : []
    ),
  /* A listing that is published is published everywhere, and nothing stands in its way. */
  "ListingPublication/getPublicationStatus": (b, w) => {
    const l = byId(w.rows.listings, b.listing_id ?? b.id);
    return ok({ status: l?.system_publication_status === "published" ? "published" : "draft", active_targets: l?.system_publication_status === "published" ? ["portals", "general", "external"] : [] });
  },
  "ListingPublication/getPublicationIssues": () => ok([]),
  "ListingPublication/getErrorsPreventingPublication": () => ok([]),
  "ListingPortalUploads/getErrorsPreventingUpload": () => ok([]),
  "ListingPortalUploads/getStatuses": (b, w) => {
    const l = byId(w.rows.listings, b.listing_id);
    const live = l?.system_publication_status === "published" && l?.system_listing_state === "current";
    const when = rexTime(w.at - 3 * 3_600_000);
    return ok({
      portals: live ? ["Rightmove", "Zoopla", "OnTheMarket"].map((name, i) => ({ portal: { id: i + 1, name }, feed_status: "feeding", remote_id_on_portal: `demo-${b.listing_id}-${i}`, last_sent: when })) : [],
      most_recent_queue: live ? { listing_status_to_send: "current", job_status: "complete", completion_time: when, targets: [{ dispatch_status: "succeeded" }] } : null,
    });
  },
  "PortalStats/getListingStats": (b) => {
    const n = Number(b.listing_id ?? 0) % 37;
    return ok({ views: 240 + n * 23, enquiries: 3 + (n % 9), search_appearances: 4200 + n * 310, portals: [] });
  },
  "Listings/autocomplete": (b, w) =>
    autocomplete(
      w.rows.listings.filter((l) => !Array.isArray(b.listing_states) || (b.listing_states as unknown[]).includes(l.system_listing_state)),
      b,
      (l) => String((l.property as Row).system_search_key),
      (l) => ({ id: l.id, text: (l.property as Row).system_search_key, listing_state: l.system_listing_state, property: l.property })
    ),
  "Properties/autocomplete": (b, w) => autocomplete(w.rows.properties, b, (p) => String(p.system_search_key), (p) => ({ id: p.id, text: p.system_search_key, property: clean(p) })),
  "Contacts/autocomplete": (b, w) =>
    autocomplete(w.rows.contacts, b, (c) => `${c.name} ${c.email_address} ${c.phone_number}`, (c) => ({ id: c.id, text: c.name, name: c.name, email_address: c.email_address, phone_number: c.phone_number })),
};

/* ── The door ────────────────────────────────────────────────────────────── */

export function demoRex(path: string, body: unknown): DemoRexAnswer {
  const w = demoWorld();
  const b = (body && typeof body === "object" ? body : {}) as Row;
  const special = SPECIAL[path];
  if (special) return special(b, w);

  const [service, method] = path.split("/");
  const name = COLLECTION[service];
  if (!name) return unknown(path);
  const rows = (w.rows[name] ??= []);

  if (method === "search") return search(rows, b, path);
  if (method === "read") {
    const row = byId(rows, b.id);
    return row ? ok(clean(row)) : refuse(`No ${service} record ${String(b.id)}`, 404);
  }
  if (method === "update") {
    const data = (b.data && typeof b.data === "object" ? b.data : b) as Row;
    const row = byId(rows, data.id ?? b.id);
    if (!row) return refuse(`No ${service} record ${String(data.id ?? b.id)}`, 404);
    for (const k of Object.keys(data)) if (k !== "id" && k !== "related") row[k] = data[k];
    row.system_modtime = typeof row.system_modtime === "string" ? rexTime(Date.now()) : Math.floor(Date.now() / 1000);
    return ok(clean(row));
  }
  if (method === "create") {
    const data = (b.data && typeof b.data === "object" ? b.data : b) as Row;
    const row: Row = { ...data, id: w.nextId++, system_ctime: Math.floor(Date.now() / 1000), system_modtime: Math.floor(Date.now() / 1000), system_record_state: "active" };
    rows.unshift(row);
    return ok(clean(row));
  }
  if (method === "describe") return ok({ service, methods: {} });
  return unknown(path);
}
