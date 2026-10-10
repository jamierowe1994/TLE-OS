import { after, NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { fetchLeadBook, type LeadBook } from "@/lib/rex-leads";
import { leadScope } from "@/lib/scope";
import { ledgerBoard, ledgerSourceMonths, ledgerStats, readNewValuations, recordLeads, salesAmong, type SourceMonthRow } from "@/lib/lead-ledger";
import { hiddenLeadIds } from "@/lib/hidden-leads";
import { ago } from "@/lib/rex-leads";
import { hasDb, q } from "@/lib/db";
import { rexConfigured } from "@/lib/rex";
import { contactsAsLeads } from "@/lib/contact-leads";
import { whoIs } from "@/lib/admin";

/**
 * The lead book, cached.
 *
 * Reading it costs five REX calls, so doing that on every page view would be
 * both slow and rude to an API the whole business depends on. Two layers:
 *
 *   • memory — instant, dies with the process
 *   • os_cache — survives deploys, so the first person in after a release
 *     doesn't pay for everyone
 *
 * Stale data is served while a refresh runs rather than making someone wait
 * on a spinner: a two-minute-old lead list is worth far more than a blank
 * screen, and the age is sent along so the screen can say which it has.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* v2, and the bump is load-bearing: the book is SCOPED now, so a cached v1
   object holds one agent's leads under a key that says "everyone". Serving
   that to the next person is a cross-tenant leak, not a stale figure. */
const CACHE_KEY_BASE = "leads:v2";
const cacheKeyFor = (rexUserId: string | null) =>
  rexUserId ? `${CACHE_KEY_BASE}:agent:${rexUserId}` : `${CACHE_KEY_BASE}:all`;
const FRESH_MS = 2 * 60 * 1000; // serve without thinking
const STALE_MS = 30 * 60 * 1000; // serve, but refresh behind the scenes

interface Cached {
  book: LeadBook;
  at: number;
}

/* Keyed by scope, not a single slot. One shared `memory` would hand the first
   agent's leads to the second — the exact bug this change exists to prevent,
   reintroduced one layer up. The listings route had the same trap. */
/* On globalThis (2 Oct 2026), like the Propoly token: dev HMR and a second
   route module importing this file must see the same copy, not each their
   own empty Map and their own walk through REX. */
const G = globalThis as unknown as {
  __leadsBoard?: {
    memory: Map<string, Cached>;
    refreshing: Map<string, Promise<Cached>>;
    valuationsAt: number;
    readingValuations: Promise<unknown> | null;
    onFile: { n: number; at: number } | null;
  };
};
const state = (G.__leadsBoard ??= {
  memory: new Map(),
  refreshing: new Map(),
  valuationsAt: 0,
  readingValuations: null,
  onFile: null,
});
const { memory, refreshing } = state;

async function readStored(key: string): Promise<Cached | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: Cached; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [key]
    );
    if (!rows[0]) return null;
    return { book: rows[0].payload.book, at: new Date(rows[0].computed_at).getTime() };
  } catch {
    return null;
  }
}

async function store(key: string, entry: Cached): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [key, JSON.stringify({ book: entry.book })]
    );
  } catch {
    /* a cache that won't write is a slow page, not a broken one */
  }
}

/** The scan's book, widened to everything on file for this scope. "received"
    is relative, so it is re-said from receivedAt at read time. */
async function fromLedger(book: LeadBook, rexUserId: string | null): Promise<LeadBook> {
  /* A row with no lead in it (a test row, a half-written one) is skipped
     rather than drawn: one empty object took the whole Groups view down. */
  const stored = (await ledgerBoard(rexUserId, 500).catch(() => [])).filter((l) => l && typeof l.id === "string" && l.id);
  if (stored.length < book.leads.length) return book;
  const leads = stored.map((l) => (l.receivedAt ? { ...l, received: ago(Math.floor(new Date(l.receivedAt).getTime() / 1000)) } : l));
  return { ...book, leads };
}

function refresh(key: string, rexUserId: string | null): Promise<Cached> {
  // Collapse concurrent callers onto one walk — five people opening the page
  // at nine o'clock shouldn't be five trips through REX. Per SCOPE, though:
  // collapsing two different agents onto one walk would serve one of them the
  // other's leads.
  const live = refreshing.get(key);
  if (live) return live;
  const p = fetchLeadBook(rexUserId)
      .then(async (book) => {
        /* Kept for good, then the board is read back from the ledger so it
           holds every lead on file, not just what one scan of REX returns. */
        await recordLeads(book.leads).catch(() => 0);
        const entry = { book: await fromLedger(book, rexUserId), at: Date.now() };
        memory.set(key, entry);
        await store(key, entry);
        return entry;
      })
      .finally(() => {
        refreshing.delete(key);
      });
  refreshing.set(key, p);
  return p;
}

/**
 * New valuation requests read in full, BEHIND the response (2 Oct 2026).
 *
 * This used to be awaited on every open, up to four seconds, one REX call
 * per enquiry - a large share of the board's p90. It still runs on open
 * (Howard, 1 Oct 2026: Danielle Jacques, "Enquiry type: sales", sat on the
 * board as a landlord lead; the board must not depend on the scan alone,
 * which had been silently failing for days), but after the answer has gone,
 * at most once a minute per process, one run at a time. A sale read here is
 * off the board on the next open, and the five-minute scan reads them too.
 */
function valuationsBehind(): void {
  if (!hasDb() || state.readingValuations || Date.now() - state.valuationsAt < 60_000) return;
  state.valuationsAt = Date.now();
  const run = readNewValuations(3)
    .catch(() => 0)
    .finally(() => {
      state.readingValuations = null;
    });
  state.readingValuations = run;
  after(() => run);
}

/** Leads on file, counted at most once a minute: a COUNT(*) over the whole
    ledger on every open, for a number in a footnote, was not worth it. */
async function onFileCount(): Promise<number> {
  if (state.onFile && Date.now() - state.onFile.at < 60_000) return state.onFile.n;
  const n = (await ledgerStats().catch(() => null))?.onFile;
  if (n == null) return state.onFile?.n ?? 0;
  state.onFile = { n, at: Date.now() };
  return n;
}

/**
 * The board straight from the ledger, for a scope with no cached book yet.
 * The ledger IS a real read - every lead the scans and the board have taken
 * from REX, kept - and the five-minute scan keeps it current, so there is no
 * reason to make somebody wait on five pages of REX for what is already on
 * file. Null when the ledger holds nothing for them: only then do they wait.
 */
async function ledgerBook(rexUserId: string | null): Promise<LeadBook | null> {
  const stored = (await ledgerBoard(rexUserId, 500).catch(() => [])).filter((l) => l && typeof l.id === "string" && l.id);
  if (!stored.length) return null;
  const leads = stored.map((l) => (l.receivedAt ? { ...l, received: ago(Math.floor(new Date(l.receivedAt).getTime() / 1000)) } : l));
  /* No walk happened, so nothing was scanned or set aside: the page says
     nothing rather than a made-up count. */
  return { leads, scanned: 0, setAside: { sales: 0, unclear: 0, blank: 0 }, total: null, newestAt: leads[0]?.receivedAt ?? null };
}

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    /* Live: never a stand-in (Rig run 2, P-018). The sample is for a laptop
       with no REX; on the real site a missing connection is an error. */
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, live: false, error: "REX isn't connected here, so there are no leads to show.", reason: "REX isn't connected here, so there are no leads to show." }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      live: false,
      /* The ONLY answer that lets the page show the demo book. */
      demo: true,
      reason: "REX isn't connected on this environment - the demo book is standing in.",
    });
  }

  /* WHOSE LEADS. Resolved before anything is fetched or read from cache.
     whoIs is asked alongside rather than after: the contacts below need the
     actor, and leadScope does not hand it back (lib/scope is not ours). */
  const [scope, { actor }] = await Promise.all([
    leadScope(req),
    whoIs(req).catch(() => ({ actor: null })),
  ]);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: true,
      live: false,
      unlinked: true,
      reason:
        "We can't tell which REX user you are, so we can't show you your leads — and we won't show you everybody's. Ask James to link your account.",
    });
  }
  const key = cacheKeyFor(scope.rexUserId);

  /* Everything else at once (2 Oct 2026) - these were nine awaits in a row.
     Leads removed from the OS by hand never leave the server, cached copy or
     not; contacts added by hand are merged here rather than inside the cache,
     so one typed in ten seconds ago is on the board now. An owner sees them
     all; anybody else sees the ones they typed. */
  const [hidden, mine, held, onFile] = await Promise.all([
    hiddenLeadIds().catch(() => new Set<string>()),
    contactsAsLeads(scope.everything ? null : (actor?.email ?? null)).catch(() => []),
    memory.get(key) ?? readStored(key),
    onFileCount(),
  ]);
  valuationsBehind();

  const out = async <B extends { leads: { id: string }[] }>(b: B) => {
    /* A contact pushed to REX can come back as a REX lead later. When it
       does, REX's row is the one with the enquiry on it, so ours steps
       aside rather than showing the same person twice. */
    const rexContacts = new Set(
      (b.leads as { contactId?: string }[]).map((l) => l.contactId).filter(Boolean) as string[]
    );
    /* Every lead the ledger knows is a sale: the cached book is REX's own
       list, whose snippets never say "sales" (lib/lead-ledger salesAmong).
       Asked of these ids only, and kept off hiddenIds: the page only needs
       the hand-removed ones (its search and contacts never carry a sale). */
    const [sales, filed] = await Promise.all([
      salesAmong(b.leads.map((l) => l.id)).catch(() => new Set<string>()),
      ledgerSourceMonths(scope.rexUserId, [...hidden]),
    ]);
    const ours = mine.filter((l) => !l.contactId || !rexContacts.has(l.contactId));
    const leads = [...ours, ...(b.leads as typeof ours)].filter((l) => l && l.id && !hidden.has(l.id) && !sales.has(l.id));
    /* This month and last, counted from everything on file rather than the
       500 the board carries (Rig P-010), plus contacts typed in by hand,
       which the board shows but the ledger never holds. */
    let sourceMonths: SourceMonthRow[] | null = filed;
    if (filed) {
      const london = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }).slice(0, 7);
      const now = london(new Date());
      const [y, m] = now.split("-").map(Number);
      const last = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
      sourceMonths = [...filed];
      for (const l of ours) {
        if (hidden.has(l.id) || !l.receivedAt) continue;
        const month = london(new Date(l.receivedAt));
        if (month !== now && month !== last) continue;
        sourceMonths.push({ month, side: l.enquiry === "Letting" ? "tenant" : "landlord", source: l.source ?? "", n: 1 });
      }
    }
    return { ...b, leads, hiddenIds: [...hidden], sourceMonths };
  };

  const age = held ? Date.now() - held.at : Infinity;

  if (held && age < FRESH_MS) {
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...(await out(held.book)), onFile, ageMs: age });
  }

  /* ALWAYS AN ANSWER NOW (2 Oct 2026). Past two minutes the caller gets what
     is on file and the walk through REX runs behind the response. Past half
     an hour the cached book is swapped for the ledger, which the five-minute
     scan keeps current; with no cached book at all, the ledger is the book.
     Only somebody with nothing on file anywhere waits on REX. */
  const behind = () =>
    after(() =>
      refresh(key, scope.rexUserId).catch(() => {
        /* the next open tries again; this one already has its answer */
      })
    );
  if (held && age < STALE_MS) {
    behind();
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...(await out(held.book)), onFile, ageMs: age, stale: true });
  }
  const filed = held ? await fromLedger(held.book, scope.rexUserId) : await ledgerBook(scope.rexUserId);
  if (filed) {
    behind();
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...(await out(filed)), onFile, ageMs: held ? age : null, stale: true });
  }

  try {
    const fresh = await refresh(key, scope.rexUserId);
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...(await out(fresh.book)), onFile, ageMs: 0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: publicError(e, "Couldn't reach REX.") },
      { status: 502 }
    );
  }
}
