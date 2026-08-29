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
  /* Server-computed checks that are NOT a disagreement with an outside system.
     stageEvidence answers "what can PayProp, REX or DocuSign show", and there
     is a whole class of gap it cannot speak to: things the portal itself is the
     register for. The deposit scheme is the example — nothing upstream records
     which scheme holds a deposit, so an empty entry is a real gap rather than a
     sync problem, and only we can know it. */
  flags?: Array<{ kind: string; label: string }>;
}

/** Flags that are genuine attention items rather than a restatement of the
 *  per-stage evidence. deposit-unverified and plc-mismatch are deliberately
 *  absent: the stage checks below already say both, in more detail. */
const REGISTER_GAP_FLAGS = new Set(["scheme-missing"]);

/**
 * A deal whose move-in is long past and which PayProp has no tenancy for.
 *
 * SUSAN NAMED THIS ONE, and she was right where I was not. The first live run
 * flagged 10 Burbage Road at 575 days, 16 Sturmer Close at 478, 8 Lower Station
 * Road at 336, and I read them as lets that completed and were never closed —
 * "the tenancy is paying". Susan: they are deals that FELL THROUGH and were
 * never closed.
 *
 * That is a different fact with a different consequence. If the deal fell
 * through, the property was let again later and the rent arriving belongs to
 * the NEXT tenant. Quoting it as this deal's was attributing a stranger's money
 * to a dead file — which is exactly the false-match failure this whole board is
 * built to avoid, arrived at from an angle I had not considered.
 *
 * So the test is no longer "rent is arriving". It is: the move-in is long past
 * and PayProp holds NO tenancy matching it. A deal that really completed has a
 * tenancy within sixty days of its move-in; one that fell through does not.
 * The rent join was tightened in deal-money to match, so the money no longer
 * attaches here at all.
 *
 * The instruction is the same either way — close the deal — but the sentence
 * has to be true, and Kirstie will read it next to a property she may know
 * something about.
 */
const STALE_AFTER_DAYS = 90;

/**
 * Checks that stop meaning anything on a deal that fell through.
 *
 * All of them ask about the RUN-UP: was a holding fee invoiced, was referencing
 * done, was the deposit registered, was the agreement signed, did the move-in
 * happen. On a let that never completed, every one is moot — there was no
 * deposit to register and no move-in to check, so reporting them as gaps is
 * describing a tenancy that does not exist.
 *
 * PLC is deliberately NOT here. Rent protection is recorded against the
 * PROPERTY in PayProp, so "without RLP" stays true whoever is living there and
 * is a live exposure regardless of this deal's fate. Rent stays for the same
 * reason: it carries arrears, and arrears belong to whoever is actually there.
 */
const RUN_UP_STAGES = new Set([
  "holding_fee",
  "referencing",
  "deposit",
  "tenancy_agreement",
  "move_day",
]);

/** Whole days since a date, or null when there is none. */
function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** Money, roughly — this file only ever prints it. */
const gbpish = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/** Same short date the stage checks print, so one line does not read as ISO
 *  while the line under it reads as English. */
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

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
  opts: { moneyLoaded: boolean; now?: Date }
): DealAlert[] {
  if (!opts.moneyLoaded) return [];
  const now = opts.now ?? new Date();

  const out: DealAlert[] = [];

  for (const d of deals) {
    /* Not being worked, so not worth anybody's morning.
       COMPLETE was missing from this list and it was the biggest fault in the
       first live run: Propoly's `complete` maps to the final stage, so a
       finished tenancy sits at move_day with every stage "reached" and every
       check firing. The first dry run duly reported a deposit missing "575
       days after move-in" — a tenancy that ended long ago, on a board that
       exists for the run-up to one.
       The route's own verification flags have always excluded complete. This
       is the same definition of live, and it belongs in one place. */
    if (d.archived || d.statusKey === "cancelled" || d.statusKey === "complete") continue;

    const currentIdx = stageIndex(d.effectiveStatusKey);
    if (currentIdx < 0) continue;

    const address = d.app.propertyName;
    const agentName = d.agentName ?? null;

    /* Move-in long past and PayProp has no tenancy for it: the deal did not
       complete, and nobody closed it. One line saying that, rather than a
       paperwork complaint about a let that never happened. */
    const openFor = daysSince(d.startDate, now);
    const stale = openFor != null && openFor >= STALE_AFTER_DAYS && d.tenancy == null;
    if (stale) {
      out.push({
        dealId: d.app.id,
        stageKey: "deal_started",
        key: `${d.app.id}:stale-deal`,
        tone: "attention",
        address,
        agentName,
        text: `Move-in was ${openFor} days ago and PayProp has no tenancy for it. Looks like it fell through and was never closed.`,
      });
    }

    /* Good news first, and only once: rent arriving is the strongest evidence
       a tenancy is real, and it is the check she would otherwise do by hand in
       PayProp. Told at the moment it lands, not every morning afterwards —
       the sent-log sees to that.

       Not on a stale deal: there the rent IS the evidence of staleness and is
       already quoted in that line, so repeating it under "started paying" put
       the same property in both halves of the digest. */
    if (d.rentReceived && !stale) {
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

    /* Gaps in our OWN register, which no outside system can answer for. Kept
       in the same alert set so the chip, the modal and the digest have exactly
       one idea of what needs a look. */
    for (const f of d.flags ?? []) {
      if (!REGISTER_GAP_FLAGS.has(f.kind)) continue;
      out.push({
        dealId: d.app.id,
        stageKey: "deposit",
        key: `${d.app.id}:${f.kind}`,
        tone: "attention",
        address,
        agentName,
        text: f.label,
      });
    }

    /* Everything the board would show amber. Reading it from the same function
       the screen uses is the point — see the note at the top. */
    for (let i = 0; i <= currentIdx; i++) {
      const s = PORTAL_STAGES[i];
      /* Run-up checks are dropped once a deal is stale — see RUN_UP_STAGES.
         PLC and rent still stand, because both describe the tenancy as it is
         today rather than how it was set up. */
      if (stale && RUN_UP_STAGES.has(s.key)) continue;
      const ev = stageEvidence(s.key, d, { reached: true, moneyLoaded: true, now });
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
