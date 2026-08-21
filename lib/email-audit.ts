import "server-only";
import { rexCall, rexRows } from "@/lib/rex";

/**
 * What goes out under the company's name, and whether it lands.
 *
 * Nobody could answer that before. "Turn the auto-responders off" was an
 * instruction with no list attached — five Power Automate flows, REX's own
 * mail-merge, and 151 merge templates on an account six businesses share.
 * This reads REX's send log and turns it into the list.
 *
 * ── WHAT THE FIRST PASS FOUND (10 days to 21 Aug 2026, 2,500 sends) ────────
 *
 * Six businesses on one account. By sender domain: thepropertyexperts 1,184 ·
 * rexsoftware.com.au 516 (REX's own system user) · theexpertsgroup 342 ·
 * newman 213 · thelettingexperts 214 · petticrew 25 · commercialproperty 6.
 * TLE is under a tenth of the traffic, which is why an unscoped view of this
 * account tells you nothing about TLE.
 *
 * TWO POPULATIONS, AND THEY BEHAVE COMPLETELY DIFFERENTLY.
 *
 * The AUTOMATION — every flow-sent email, created by the "Automated System"
 * user — sent 342 in ten days, ALL of them `custom_template`, all against a
 * named template. TLE's share is 83: the post-viewing email (43), and the
 * four application notifications to landlord and tenant (15/14/6/5).
 *
 * The AGENTS sent 214 for TLE in the same window, and **100% of those were
 * `custom` with no template attached at all**. Thirteen TLE templates exist in
 * AdminMergeTemplates; the agents use none of them. Every enquiry reply is
 * written fresh, which is why the same question gets four different answers.
 *
 * ENGAGEMENT IS TRACKED AND NOBODY LOOKS AT IT. REX records open, click,
 * delivered and bounce per recipient, and no report anywhere reads it.
 *
 * Be careful with the number. Across ALL SIX businesses' automation over those
 * ten days: 195 open, 61 click, 71 delivered, 15 bounce — 4.4%, roughly double
 * what an email programme should tolerate. That is the shared robot's figure,
 * not TLE's; TLE's own share of those sends bounced once or twice. The page
 * scopes to us precisely so this distinction survives, because "our bounce
 * rate is 4.4%" is the kind of sentence that gets repeated for a year.
 *
 * TEMPLATES DRIFT AND NOTHING PRUNES THEM. "TLE Post Viewing Email",
 * "TLE Post Viewing Email (new)" and "TLE Post Viewing Email (2)" all exist.
 * Only "(2)" is ever sent. The same pattern repeats for TPE, PPE and TCPE —
 * so anyone editing the wording has a two-in-three chance of editing a
 * template nobody sends.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** REX's page cap. Asking for more returns an EMPTY array, not an error. */
const PAGE = 100;

export interface SendGroup {
  /** The template's name, or the opening words when there isn't one. */
  name: string;
  /** True when this went out against a named template rather than ad-hoc. */
  templated: boolean;
  channel: string;
  count: number;
  opened: number;
  clicked: number;
  bounced: number;
  /** Nobody has heard back either way. Not a failure — just unknown. */
  pending: number;
}

export interface EmailAudit {
  from: string;
  to: string;
  /** Sends by every business on the shared account, for context. */
  byBusiness: { domain: string; count: number }[];
  /** The flows: created by REX's "Automated System" user. */
  automated: SendGroup[];
  /** Agents typing. Grouped by opening words, since they carry no template. */
  byHand: SendGroup[];
  totals: {
    account: number;
    tle: number;
    automated: number;
    byHand: number;
    bounced: number;
    /** Of TLE's own sends, how many carried a template. */
    templated: number;
  };
  pulledAt: string;
}

/** The account is shared. Everything here is scoped by the SENDER's domain —
 *  the only reliable divider on this account, same as the diary. */
const TLE = /thelettingexperts\.co\.uk$/i;
const AUTOMATION = "Automated System";

function domainOf(r: Row): string {
  const user = (r.system_created_user ?? {}) as Row;
  return (str(user.email_address) ?? "").split("@")[1]?.toLowerCase() ?? "unknown";
}

function group(rows: Row[]): SendGroup[] {
  const out = new Map<string, SendGroup>();
  for (const r of rows) {
    const tpl = str((r.template as Row | null)?.template_name);
    // No template means an agent typed it. Group those by their opening words
    // so near-identical rewrites of the same message collapse together —
    // which is exactly what makes the drift visible.
    const name = tpl ?? (str(r.custom_content_preview) ?? "(no content recorded)").slice(0, 60);
    const key = `${tpl ? "T" : "C"}:${name}`;
    const g =
      out.get(key) ??
      {
        name,
        templated: Boolean(tpl),
        channel: str(r.merge_type) ?? "email",
        count: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        pending: 0,
      };
    g.count++;
    switch (str(r.engagement_status)) {
      case "open": g.opened++; break;
      case "click": g.clicked++; break;
      case "bounce": g.bounced++; break;
      case "pending": g.pending++; break;
    }
    out.set(key, g);
  }
  return [...out.values()].sort((a, b) => b.count - a.count);
}

/**
 * Read the log.
 *
 * `pages` is deliberate rather than a date range: the log has no searchable
 * date criterion that behaves, so this walks back from newest and reports the
 * span it actually covered. Ten pages is about ten days across the whole
 * account, which is enough to see the shape without a two-minute wait.
 */
export async function auditEmails(pages = 10): Promise<EmailAudit> {
  // Offsets are independent, so these go out together — serially, ten pages
  // took about fifty seconds.
  //
  // THREE, not six. This log is slow (~5s a page on its own) and rexPost
  // aborts any single call at ten seconds. At six in flight every call
  // exceeded that ceiling and the whole request came back "This operation was
  // aborted" — which reads like a browser giving up and is actually our own
  // timeout firing. Three keeps each call inside it.
  const CONCURRENCY = 3;
  const rows: Row[] = [];
  for (let start = 0; start < pages; start += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, pages - start) },
      (_, i) => start + i
    );
    const results = await Promise.all(
      batch.map(async (i) => {
        const res = await rexCall("MailMergeEventLogs", "search", {
          limit: PAGE,
          offset: i * PAGE,
          order_by: { system_ctime: "desc" },
        });
        if (!res.ok) throw new Error(res.error ?? "REX wouldn't answer.");
        return rexRows(res.result);
      })
    );
    for (const page of results) rows.push(...page);
    // A short page means we've reached the end of the log.
    if (results.some((p) => p.length < PAGE)) break;
  }

  const times = rows
    .map((r) => Number(r.system_ctime))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const day = (t: number | undefined) =>
    t ? new Date(t * 1000).toISOString().slice(0, 10) : "—";

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(domainOf(r), (counts.get(domainOf(r)) ?? 0) + 1);

  const tle = rows.filter((r) => TLE.test(domainOf(r)));
  const automatedRows = rows.filter(
    (r) => str((r.system_created_user as Row | null)?.name) === AUTOMATION
  );
  // The automation sends for every business on the account, so its TLE share
  // is found by the template's own prefix rather than the sender — the sender
  // is the same robot either way.
  const automatedTle = automatedRows.filter((r) =>
    /^TLE\b/i.test(str((r.template as Row | null)?.template_name) ?? "")
  );

  const automated = group(automatedTle);
  const byHand = group(tle);

  return {
    from: day(times[0]),
    to: day(times[times.length - 1]),
    byBusiness: [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count),
    automated,
    byHand,
    totals: {
      account: rows.length,
      tle: tle.length + automatedTle.length,
      automated: automatedTle.length,
      byHand: tle.length,
      bounced:
        automated.reduce((n, g) => n + g.bounced, 0) + byHand.reduce((n, g) => n + g.bounced, 0),
      templated: tle.filter((r) => (r.template as Row | null)?.template_name).length + automatedTle.length,
    },
    pulledAt: new Date().toISOString(),
  };
}
