/**
 * What the money and paperwork systems actually say about a stage.
 *
 * James, 29 Aug: "all of these should have a separate thing to check if the
 * thing is doing what we need it to do... we need to go to PayProp, for
 * example, to check if a holding fee is being paid."
 *
 * The pipeline records what somebody CLAIMS happened. This says what an
 * independent system can show. Where they disagree is the whole value: a deal
 * sitting past Deposit with nothing registered in PayProp is the one Kirstie
 * needs to look at, and finding it by hand is the work this is meant to remove.
 *
 * ── Three tones, and the third is not a failure ───────────────────────────
 *
 *   ok    an outside system confirms it
 *   warn  the pipeline has passed this stage and the outside system disagrees
 *   none  nothing can check this, or nothing has been checked yet
 *
 * `none` is doing the most important job here. Referencing has no source in any
 * system we hold; the holding fee's arrival is genuinely untraceable, and a
 * 405-line probe already established why. Rendering those as failures would
 * train her to ignore the amber, and then the real ones go unseen too. They say
 * plainly that nobody can answer, which is a true statement and an honest one.
 *
 * ── warn only when the stage has been PASSED ──────────────────────────────
 *
 * A deal at Holding fee has no deposit registered and should not: it has not
 * got there. Flagging every future stage would put eight warnings on every new
 * deal. So absence is only evidence once the pipeline claims the work is done.
 *
 * ── Never advances anything ───────────────────────────────────────────────
 *
 * Read-only, and it must stay that way. The join underneath is an address key
 * that is deliberately loose (see propertyKey), so a wrong match is possible
 * and its cost has to stay at "a confusing line on a panel" rather than "a deal
 * moved itself on the strength of another property's rent".
 */

export type EvidenceTone = "ok" | "warn" | "none";

export interface StageEvidence {
  tone: EvidenceTone;
  text: string;
}

/** Only the fields the check needs — deliberately not the whole deal. */
export interface EvidenceDeal {
  rlp?: { status: "protected" | "without"; evidence: string } | null;
  tenancy?: { startDate: string | null; depositId: string | null } | null;
  tobStatus?: { status: string; sentAt: string | null; completedAt: string | null } | null;
  compliance?: { outstanding: number; expired: number; problems: string[]; checked: boolean } | null;
  schemeSuggestion?: { scheme: string; evidence: string } | null;
  holdingInvoice?: { amount: number; fromDate: string | null } | null;
  rentReceived?: { amount: number; on: string; paidOut: boolean } | null;
  rentSchedule?: { from: string; rent: number } | null;
  depositReplacement?: string | null;
  /** Claimed move-in. Used to give a lagging system time before accusing it. */
  startDate?: string | null;
  /** Rent owed on a tenancy that has ALREADY STARTED. The route gates this;
   *  an unstarted tenancy's balance is an invoice, not a debt. */
  arrears?: { owed: number; lastPayment: string | null } | null;
}

/** Whole days since a date, or null when there is no date to count from. */
function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** How long PayProp gets to catch up before a missing deposit is a finding. */
const DEPOSIT_GRACE_DAYS = 14;

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/**
 * @param reached  the pipeline claims this stage is done or in progress
 * @param moneyLoaded  PayProp's money reports have actually loaded. Without
 *   this, "no rent found" and "we have not looked yet" are the same sentence,
 *   and only one of them is worth showing anybody.
 */
export function stageEvidence(
  stageKey: string,
  d: EvidenceDeal,
  opts: { reached: boolean; moneyLoaded: boolean; now?: Date }
): StageEvidence {
  const { reached, moneyLoaded } = opts;
  /* Injected rather than read, so the grace period below can be tested at a
     chosen date instead of only ever on the day somebody runs it. */
  const now = opts.now ?? new Date();

  switch (stageKey) {
    /* Propoly having a deal row IS the deal starting. There is no second
       system to ask, and pretending otherwise would be theatre. */
    case "deal_started":
      return { tone: "none", text: "Propoly's record is the only source for this." };

    case "holding_fee": {
      if (d.holdingInvoice) {
        return {
          tone: "ok",
          text: `${gbp(d.holdingInvoice.amount)} invoiced${
            d.holdingInvoice.fromDate ? ` ${when(d.holdingInvoice.fromDate)}` : ""
          } — the invoice, not the receipt.`,
        };
      }
      /* Deliberately not a warning even when passed. The fee lands in
         unreconciled funds with a freehand note, so it carries no category and
         no payment row — established by probe, not assumed. Absence here says
         nothing about whether the money came. */
      return {
        tone: "none",
        text: "No holding invoice in PayProp. The payment itself is not traceable there.",
      };
    }

    case "referencing":
      return {
        tone: "none",
        text: "No system records referencing. Ticked by hand until one does.",
      };

    case "plc": {
      if (d.rlp?.status === "protected") {
        return { tone: "ok", text: `PayProp: protected with RLP.` };
      }
      if (d.rlp?.status === "without") {
        return {
          tone: reached ? "warn" : "none",
          text: reached
            ? "PayProp says this is WITHOUT RLP, but the deal has passed PLC."
            : "PayProp says without RLP.",
        };
      }
      /* Silence is not "no cover" — 255 of 478 UK properties say nothing
         either way, so an absence here is a gap in the record, not a verdict. */
      return { tone: "none", text: "PayProp records nothing either way on RLP." };
    }

    case "deposit": {
      if (d.depositReplacement) {
        return { tone: "ok", text: `No cash deposit — ${d.depositReplacement}.` };
      }
      if (d.tenancy?.depositId) {
        return {
          tone: "ok",
          text: d.schemeSuggestion
            ? `Registered in PayProp — looks like ${d.schemeSuggestion.scheme}.`
            : "Registered in PayProp.",
        };
      }
      /* A grace period, because deposit registration LAGS. The server's own
         verification flag has always waited 14 days past move-in before
         accusing anybody, and a check that nags the morning after completion
         is one she learns to scroll past — which costs the real ones too.

         No move-in date means no clock to run, so it stays quiet rather than
         guessing. */
      const since = daysSince(d.startDate, now);
      const overdue = since != null && since >= DEPOSIT_GRACE_DAYS;
      return {
        tone: reached && overdue ? "warn" : "none",
        text:
          reached && overdue
            ? `Nothing registered in PayProp, ${since} days after move-in.`
            : "Nothing registered in PayProp yet.",
      };
    }

    /* The honest one. Every e-sign envelope in REX is landlord-facing — 942
       probed, not one tenant agreement — so this can speak to the landlord's
       terms and must not be read as the tenant having signed. */
    case "tenancy_agreement": {
      const s = d.tobStatus?.status;
      if (s === "completed") {
        return {
          tone: "ok",
          text: "Landlord terms signed. Nothing records the tenant's AST.",
        };
      }
      if (s === "sent" || s === "partially_signed") {
        return {
          tone: reached ? "warn" : "none",
          text: `Landlord terms ${s === "sent" ? "sent, unsigned" : "part-signed"}. The tenant's AST has no source.`,
        };
      }
      return { tone: "none", text: "No landlord envelope found, and the AST has no source." };
    }

    case "rent_payment": {
      /* Owing money OUTRANKS having paid some. A tenant who paid the first
         month and then stopped shows both a receipt and a balance, and the
         balance is the thing worth her morning. Reported before the good news
         rather than after it, because a stage that says "£1,250 received" with
         a debt hidden underneath is worse than saying nothing. */
      if (d.arrears && d.arrears.owed > 0) {
        return {
          tone: "warn",
          text: `${gbp(d.arrears.owed)} owed — ${
            d.arrears.lastPayment
              ? `last payment ${when(d.arrears.lastPayment)}`
              : "no payment ever received"
          }.`,
        };
      }
      if (d.rentReceived) {
        return {
          tone: "ok",
          text: `${gbp(d.rentReceived.amount)} received ${when(d.rentReceived.on)}${
            d.rentReceived.paidOut ? "" : " — in, not yet paid out"
          }.`,
        };
      }
      if (!moneyLoaded) {
        return { tone: "none", text: "PayProp's money reports have not loaded yet." };
      }
      return {
        tone: reached ? "warn" : "none",
        text: reached
          ? "No rent received in PayProp this month or last."
          : "No rent received yet.",
      };
    }

    case "move_day": {
      if (d.rentSchedule) {
        return { tone: "ok", text: `Rent schedule starts ${when(d.rentSchedule.from)}.` };
      }
      if (!moneyLoaded) {
        return { tone: "none", text: "PayProp's move-in report has not loaded yet." };
      }
      return {
        tone: reached ? "warn" : "none",
        text: reached
          ? "Propoly says moved in, but PayProp has no rent schedule for it."
          : "No rent schedule in PayProp yet.",
      };
    }

    default:
      return { tone: "none", text: "Nothing checks this stage yet." };
  }
}
