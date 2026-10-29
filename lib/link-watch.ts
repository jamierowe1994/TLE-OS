import "server-only";
import { hasDb, q } from "@/lib/db";

/* ==========================================================================
   WHEN A LINK BREAKS (29 Oct 2026).

   James: "If PayProp's link is to go down, REX's link is to go down,
   Flatfair's links are to go down, or Propoly's links are to go down, I
   should get an email telling me that the link has been broken ... and why
   it's been disconnected. My concern is that something breaks and I don't
   even see it, and then everyone's shouting."

   Checked every five minutes alongside the timers (lib/cron-watch, which
   writes the stoppage down, emails James and Howard and rings their bell).

     REX        one small read (AccountUsers/search, limit 1) as the office
                login; or REX already marked down by the outage switch
     PayProp    meta/me on each account, Scotland and the rest of the UK
     Flatfair   one branch read
     Propoly    NOT asked: every call spends the shared daily quota. Judged by
                when Propoly last gave us a good answer, which every read
                already keeps (os_cache propoly:token)

   A probe has to fail twice running (about ten minutes) before it counts, so
   one slow answer is not an email. The report carries what the system said,
   when it last worked, and the last few errors the OS logged against it.
   ========================================================================== */

const MIN = 60_000;
const FAILS_TO_COUNT = 2;

export type LinkId = "link:rex" | "link:payprop-scotland" | "link:payprop-uk" | "link:propoly" | "link:flatfair";

export const LINKS: Record<LinkId, { label: string; affects: string; check: string }> = {
  "link:rex": {
    label: "REX",
    affects: "Listings, leads, the diary, compliance records and everything written to REX (writes wait in the queue while it is down)",
    check: "Try signing in to REX yourself. If REX is fine, the office login (REX_API_EMAIL on Railway) may have had its password changed or been locked.",
  },
  "link:payprop-scotland": {
    label: "PayProp (Scotland)",
    affects: "Scottish rent, the rent box, income figures and Portfolio's PayProp facts",
    check: "Admin > Connections > PayProp shows the sign-in check. Scotland uses its own API key (PAYPROP_API_KEY_SCOTLAND on Railway): if PayProp revoked or rotated it, a new key is needed from PayProp.",
  },
  "link:payprop-uk": {
    label: "PayProp (England and Wales)",
    affects: "England and Wales rent, the rent box, income figures and Portfolio's PayProp facts",
    check: "Admin > Connections > PayProp. England and Wales signs in through OAuth: if the connection was revoked or the refresh failed, press Connect PayProp there and sign in again as the PayProp admin.",
  },
  "link:propoly": {
    label: "Propoly",
    affects: "Applications, the pre-tenancy board, handover pushes and the move-in figures",
    check: "Admin > Connections > Propoly. A 429 means the shared daily call quota is used up (it resets overnight, or Propoly can raise it); a 403 means Propoly refused our API key.",
  },
  "link:flatfair": {
    label: "Flatfair",
    affects: "Deposit replacement status on lets and the Flatfair sync",
    check: "Admin > Connections > Flatfair. A 401 or 403 means the API token (FLATFAIR_API_TOKEN on Railway) was revoked; Flatfair issues a new one.",
  },
};

export interface LinkResult {
  id: LinkId;
  down: boolean;
  /** When it last worked, for the stoppage's start. */
  since: Date;
  /** The report, one "Label: text" per line. */
  report: string;
}

type Mem = { fails: number; lastOkAt: number | null; firstFailAt: number | null; lastError: string };
const G = globalThis as { __osLinkWatch?: Map<LinkId, Mem> };
const mem = (G.__osLinkWatch ??= new Map());
const startedAt = Date.now();

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** Anything shaped like a credential taken out of a message before it is emailed. */
const clean = (s: string) =>
  s
    .replace(/(bearer|token|key|password|secret)["':=\s]+[A-Za-z0-9._\-]{8,}/gi, "$1 [removed]")
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, "[removed]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);

/** The last errors the OS itself logged against this system (lib/auto-bugs), newest first. */
async function recentErrors(source: string): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ at: Date; what: string; status: string | null; message: string; n: number }>(
    `SELECT COALESCE(last_seen_at, created_at) AS at, context->>'what' AS what, context->>'status' AS status,
            COALESCE(context->>'lastMessage', context->>'message', body) AS message, occurrences AS n
       FROM os_bugs
      WHERE kind = 'auto' AND context->>'source' = $1 AND COALESCE(last_seen_at, created_at) > NOW() - INTERVAL '6 hours'
      ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 3`,
    [source]
  ).catch(() => []);
  return rows.map((r) => `${when(new Date(r.at).getTime())} - ${r.what ?? "?"}${r.status && r.status !== "null" ? ` (${r.status})` : ""}: ${clean(r.message ?? "")}${r.n > 1 ? ` [${r.n} times]` : ""}`);
}

/** One probe's outcome folded into the run of failures. */
async function fold(id: LinkId, ok: boolean, error: string, source: string | null): Promise<LinkResult> {
  const m = mem.get(id) ?? { fails: 0, lastOkAt: null, firstFailAt: null, lastError: "" };
  const now = Date.now();
  if (ok) {
    mem.set(id, { fails: 0, lastOkAt: now, firstFailAt: null, lastError: "" });
    return { id, down: false, since: new Date(now), report: "" };
  }
  const next = { fails: m.fails + 1, lastOkAt: m.lastOkAt, firstFailAt: m.firstFailAt ?? now, lastError: error };
  mem.set(id, next);
  const down = next.fails >= FAILS_TO_COUNT;
  return { id, down, since: new Date(next.lastOkAt ?? next.firstFailAt), report: down ? await report(id, next, source) : "" };
}

/** What the error usually means, in plain words. */
function meaning(error: string): string {
  const e = error.toLowerCase();
  const status = Number(/http (\d{3})/i.exec(error)?.[1] ?? /\((\d{3})\)/.exec(error)?.[1] ?? 0);
  if (status === 401 || status === 403 || /unauthori|forbidden|invalid token|login failed|not authenticated|refused the sign-in|revoked/.test(e))
    return "It answered, but turned our login away: the key, token or password the OS uses is no longer accepted.";
  if (status === 429 || /rate.?limit|too many|quota/.test(e)) return "It is refusing us for asking too often, or the daily allowance is used up.";
  if (status >= 500) return "It answered with an error on its side: usually their outage, and it clears by itself.";
  if (/fetch failed|econnrefused|enotfound|could not be reached|network|socket|timed? ?out|did not answer|abort/.test(e))
    return "Nothing answered at all: their service is down or unreachable, or the address the OS uses is wrong.";
  if (/stopped answering/.test(e)) return "Several calls in a row failed, so the OS switched to its stored copy.";
  return "See what it said above.";
}

async function report(id: LinkId, m: Mem, source: string | null, extra: string[] = []): Promise<string> {
  const link = LINKS[id];
  const said = clean(m.lastError) || "No answer.";
  const lines = [
    `What failed: ${link.label}`,
    `What it said: ${/[.!?]$/.test(said) ? said : `${said}.`}`,
    `What it means: ${meaning(m.lastError)}`,
    `Last worked: ${m.lastOkAt ? when(m.lastOkAt) : `not since the OS last restarted (${when(startedAt)})`}`,
    ...extra,
    ...(source ? (await recentErrors(source)).map((e, i) => `${i === 0 ? "Recent errors" : "Before that"}: ${e}`) : []),
    `What's affected: ${link.affects}`,
    `What to check: ${link.check}`,
  ];
  return lines.join("\n");
}

async function checkRex(): Promise<LinkResult | null> {
  const { rexConfigured, rexCall } = await import("@/lib/rex");
  if (!rexConfigured()) return null;
  const { rexDownReason } = await import("@/lib/rex-outage");
  const reason = await rexDownReason().catch(() => null);
  /* Marked down by hand or for a planned window: somebody already knows. */
  if (reason === "forced" || reason === "planned") return { id: "link:rex", down: false, since: new Date(), report: "" };
  if (reason === "detected") return fold("link:rex", false, "REX stopped answering: three calls in two minutes failed, so the OS has switched to its copy and is holding writes until REX is back.", "REX");
  try {
    const r = await rexCall("AccountUsers", "search", { limit: 1 }, null, { quiet: true });
    return fold("link:rex", r.ok, r.ok ? "" : `${r.status ? `HTTP ${r.status}: ` : ""}${r.error ?? "REX refused the call."}`, "REX");
  } catch (e) {
    return fold("link:rex", false, e instanceof Error ? e.message : "REX could not be reached.", "REX");
  }
}

async function checkPayProp(): Promise<LinkResult[]> {
  const { PAYPROP_ACCOUNTS, payPropGet, payPropKeyFor } = await import("@/lib/payprop");
  const { payPropClient } = await import("@/lib/business/payprop");
  const bridged = Boolean(process.env.PORTAL_ORIGIN && process.env.OS_BRIDGE_SECRET);
  const out: LinkResult[] = [];
  for (const a of PAYPROP_ACCOUNTS) {
    /* Not connected here at all is not a break: nothing to watch. */
    if (!payPropKeyFor(a.id) && !payPropClient(a.id) && !bridged) continue;
    const id = `link:payprop-${a.id}` as LinkId;
    const me = await payPropGet(a.id, "meta/me").catch((e) => ({ ok: false, status: 0, error: e instanceof Error ? e.message : "PayProp could not be reached." }));
    let why = "";
    if (!me.ok) {
      const { bridgeLastReason } = await import("@/lib/payprop-bridge");
      why = [me.status ? `HTTP ${me.status}` : "", (me as { error?: string | null }).error ?? "", bridgeLastReason(a.id) ?? ""].filter(Boolean).join(" - ");
    }
    out.push(await fold(id, me.ok, why || "PayProp refused the sign-in.", null));
    /* PayProp limits overlapping calls from one login. */
    await new Promise((r) => setTimeout(r, 500));
  }
  return out;
}

async function checkFlatfair(): Promise<LinkResult | null> {
  const { flatfairConfigured, flatfairGet } = await import("@/lib/flatfair");
  if (!flatfairConfigured()) return null;
  const r = await flatfairGet("/organisation/branch/?limit=1");
  return fold("link:flatfair", r.ok, r.ok ? "" : `${r.status ? `HTTP ${r.status}: ` : ""}${r.error ?? "Flatfair refused the call."}`, "Flatfair");
}

/** Propoly by its last good answer: no call of ours, so no quota spent. */
async function checkPropoly(): Promise<LinkResult | null> {
  const { propolyConfigured } = await import("@/lib/business/propoly");
  if (!propolyConfigured() || !hasDb()) return null;
  const { propolyOfficeHours } = await import("@/lib/business/propoly-deals");
  /* The deals book is read every 20 minutes in office hours, every 90 outside them. */
  const lateMs = propolyOfficeHours() ? 45 * MIN : 3 * 60 * MIN;
  const rows = await q<{ payload: { lastGoodAt?: number; backoffUntil?: number } }>(`SELECT payload FROM os_cache WHERE key = 'propoly:token'`).catch(() => []);
  const lastGoodAt = Number(rows[0]?.payload?.lastGoodAt) || 0;
  /* Nothing kept yet, straight after a deploy: no judgement. */
  if (!lastGoodAt) return null;
  const now = Date.now();
  if (now - lastGoodAt <= lateMs) {
    mem.set("link:propoly", { fails: 0, lastOkAt: lastGoodAt, firstFailAt: null, lastError: "" });
    return { id: "link:propoly", down: false, since: new Date(lastGoodAt), report: "" };
  }
  const { dayUsage } = await import("@/lib/business/propoly-meter");
  const use = await dayUsage().catch(() => null);
  const backoff = Number(rows[0]?.payload?.backoffUntil) || 0;
  const said =
    use && use.refused > 0
      ? `Propoly has refused ${use.refused} of today's ${use.calls.toLocaleString("en-GB")} calls (429).`
      : backoff > now
        ? `Propoly said we asked for a token too recently; the OS is waiting until ${when(backoff)} to ask again.`
        : "Propoly hasn't given the OS a good answer since the time below, and hasn't said why.";
  const m: Mem = { fails: FAILS_TO_COUNT, lastOkAt: lastGoodAt, firstFailAt: lastGoodAt, lastError: said };
  mem.set("link:propoly", m);
  const extra = use ? [`Calls today: ${use.calls.toLocaleString("en-GB")} of ${use.quota.toLocaleString("en-GB")}`] : [];
  return { id: "link:propoly", down: true, since: new Date(lastGoodAt), report: await report("link:propoly", m, "Propoly", extra) };
}

/** Every link, each on its own so one hanging cannot stop the rest. */
export async function checkLinks(): Promise<LinkResult[]> {
  const settled = await Promise.allSettled([checkRex(), checkPayProp(), checkFlatfair(), checkPropoly()]);
  return settled.flatMap((s) => (s.status === "fulfilled" ? (Array.isArray(s.value) ? s.value : s.value ? [s.value] : []) : []));
}

export const isLink = (id: string): id is LinkId => id in LINKS;
