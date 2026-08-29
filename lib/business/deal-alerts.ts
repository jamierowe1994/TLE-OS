import { PORTAL_STAGES } from "@/lib/business/propoly-stages";
import { stageEvidence, type EvidenceDeal } from "@/lib/business/stage-evidence";

/**
 * What is worth telling somebody about, out of a whole board of deals.
 *
 * James: "the whole premise behind this is to reduce workload... can we inform
 * people, can we make it easier."
 *
 * Nothing in the OS has ever told anybody anything. Every check on the
 * pre-tenancy board is recomputed when somebody opens it and then forgotten, so
 * the only way a disagreement between a claim and a record gets noticed is
 * Kirstie looking. This is the part that notices instead.
 *
 * ── Built ON TOP of stageEvidence, not beside it ──────────────────────────
 *
 * The board and the alert must never disagree. If the panel says a deposit is
 * registered and the email says it is missing, both become untrustworthy and
 * she goes back to checking by hand — which is the entire problem. So there is
 * one function that decides what an outside system says, and this reads it.
 * Change the judgement in one place and the screen and the email move together.
 *
 * ── Only what a person can act on ─────────────────────────────────────────
 *
 * `none` evidence never becomes an alert. Referencing having no source is a
 * true and permanent fact; mailing it to somebody every morning would be a
 * daily apology for a thing they cannot fix. Amber only — a claim and a record
 * genuinely disagreeing — plus one piece of good news that saves a check.
 *
 * ── The key is what stops it becoming spam ────────────────────────────────
 *
 * Every alert carries a stable key of deal + kind. Sent once, recorded, never
 * sent again unless the underlying fact goes away and comes back. Without that
 * this is a machine that mails the same twelve problems every morning until
 * somebody builds a filter for it, which is the same as not having it.
 */

export type AlertTone = "attention" | "good";

export interface DealAlert {
  dealId: string;
  /** Stage key the alert came from — `rent_payment`, `deposit`, … */
  stageKey: string;
  /** Stable per deal + stage. The thing the sent-log is keyed on. */
  key: string;
  tone: AlertTone;
  address: string;
  agentName: string | null;
  text: string;
}

/** The shape an alert needs off a deal. A subset, deliberately. */
export interface AlertDeal extends EvidenceDeal {
  app: { id: string; propertyName: string };
  effectiveStatusKey: string;
  agentName?: string | null;
  archived?: boolean;
  statusKey?: string;
}

const stageIndex = (key: string) => PORTAL_STAGES.findIndex((s) => s.key === key);

/**
 * Every alert on the board right now.
 *
 * @param moneyLoaded PayProp's reports actually loaded. FALSE MEANS NO ALERTS
 *   AT ALL, and that is the single most important line in this file: the money
 *   reports return null on a cold cache and fill in behind, so a run that
 *   happened to catch them cold would mail Kirstie that every deal on the board
 *   has lost its deposit and its rent. Silence is the only safe answer to "we
 *   have not looked yet".
 */
export function dealAlerts(
  deals: AlertDeal[],
  opts: { moneyLoaded: boolean }
): DealAlert[] {
  if (!opts.moneyLoaded) return [];

  const out: DealAlert[] = [];

  for (const d of deals) {
    /* A cancelled or archived deal is not being worked. Chasing a missing
       deposit on a file nobody is progressing is noise with a person's name
       on it. */
    if (d.archived || d.statusKey === "cancelled") continue;

    const currentIdx = stageIndex(d.effectiveStatusKey);
    if (currentIdx < 0) continue;

    const address = d.app.propertyName;
    const agentName = d.agentName ?? null;

    /* Good news first, and only once: rent arriving is the strongest evidence
       a tenancy is real, and it is the check she would otherwise do by hand in
       PayProp. Told at the moment it lands, not every morning afterwards —
       the sent-log sees to that. */
    if (d.rentReceived) {
      out.push({
        dealId: d.app.id,
        stageKey: "rent_payment",
        key: `${d.app.id}:rent-arrived`,
        tone: "good",
        address,
        agentName,
        text: stageEvidence("rent_payment", d, { reached: true, moneyLoaded: true }).text,
      });
    }

    /* Everything the board would show amber. Reading it from the same function
       the screen uses is the point — see the note at the top. */
    for (let i = 0; i <= currentIdx; i++) {
      const s = PORTAL_STAGES[i];
      const ev = stageEvidence(s.key, d, { reached: true, moneyLoaded: true });
      if (ev.tone !== "warn") continue;
      out.push({
        dealId: d.app.id,
        stageKey: s.key,
        key: `${d.app.id}:${s.key}`,
        tone: "attention",
        address,
        agentName,
        text: `${s.label} — ${ev.text}`,
      });
    }
  }

  return out;
}

/**
 * The digest, as plain text.
 *
 * One email, not one per alert. The codebase's own scheduler already argues
 * this for nurture steps — firing three at once "is how a nurture sequence
 * turns into spam" — and it is truer here, because a bad afternoon in PayProp
 * could produce forty. A single list she can read in one go is the thing that
 * actually reduces work; forty emails is a new job.
 */
export function digestText(alerts: DealAlert[]): string {
  /* GROUPED BY PROPERTY, not listed by stage. A stalled deal trips several
     checks at once — no deposit, no rent, no rent schedule are three symptoms
     of one thing — and listing them flat made one property look like three
     problems. She works a property at a time, so the digest is written a
     property at a time. */
  const group = (list: DealAlert[]) => {
    const byDeal = new Map<string, DealAlert[]>();
    for (const a of list) {
      const cur = byDeal.get(a.dealId);
      if (cur) cur.push(a);
      else byDeal.set(a.dealId, [a]);
    }
    return [...byDeal.values()];
  };

  const attention = group(alerts.filter((a) => a.tone === "attention"));
  const good = group(alerts.filter((a) => a.tone === "good"));
  const lines: string[] = [];

  const block = (groups: DealAlert[][]) => {
    for (const g of groups) {
      const head = g[0];
      lines.push(`  ${head.address}${head.agentName ? ` (${head.agentName})` : ""}`);
      for (const a of g) lines.push(`    ${a.text}`);
      lines.push("");
    }
  };

  if (attention.length) {
    lines.push(
      `${attention.length} ${attention.length === 1 ? "property needs" : "properties need"} a look:`
    );
    lines.push("");
    block(attention);
  }

  if (good.length) {
    lines.push(
      `${good.length === 1 ? "One tenancy has" : `${good.length} tenancies have`} started paying:`
    );
    lines.push("");
    block(good);
  }

  lines.push("Each of these is a disagreement between what the pipeline says and");
  lines.push("what PayProp records. Nothing here has been changed for you.");
  return lines.join("\n");
}
