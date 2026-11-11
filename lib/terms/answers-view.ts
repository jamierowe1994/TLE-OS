import "server-only";
import { openAccount } from "@/lib/bank-vault";
import { readHome } from "@/lib/home-answers";
import { edition } from "@/lib/terms/catalogue";
import { askedOf, detailText } from "@/lib/terms/detail-text";
import { PROPERTY_QUESTIONS, SECRET_KEYS, asked, cardAsked, cardKey } from "@/lib/property-questions";
import type { LandlordDetails } from "@/lib/terms/types";
import type { TermsRow } from "@/lib/terms/store";

/**
 * WHAT THE LANDLORD GAVE WITH THEIR TERMS, FOR THE AGENT (James, 11 Nov 2026).
 *
 * "She can see the signed contract, but she can't seem to see any bank details
 * on there... We need to be able to see all of the questions that they've
 * answered as well." (Rhiannon Dodge, Flat 6 Grand Banks.) The signed banner
 * gets a Questionnaire tab beside Terms of Business, and this is what it shows:
 *
 *   each landlord's own details and declarations, as the contract prints them
 *   the bank account: name of bank, account name, sort code, the last four
 *     (the whole number is only ever on the signed contract, lib/landlord-bank)
 *   every answer about the home, by subject, with who gave it and when
 *
 * And, said plainly, what this wording never asked: a contract on the October
 * 2026 terms has no bank details and no questions behind it, so the tab says
 * that rather than showing an empty panel that reads as something lost.
 */

const BANK: Array<keyof LandlordDetails> = ["bankName", "bankAccountName", "sortCode", "accountNumber"];

export interface ViewRow {
  label: string;
  value: string;
  /** "landlord" or "agent", and when, for an answer about the home. */
  by?: "landlord" | "agent";
  at?: string;
}

export interface AnswersView {
  id: string;
  address: string;
  /** "England, October 2026" */
  wording: string;
  /** This wording asks the questions about the home before the contract. */
  asksQuestions: boolean;
  /** This wording takes the bank account. */
  asksBank: boolean;
  completedAt: string | null;
  people: Array<{ key: string; name: string; signedAt: string | null; details: ViewRow[]; bank: ViewRow[] }>;
  home: Array<{ title: string; rows: ViewRow[] }>;
}

export async function answersView(t: TermsRow): Promise<AnswersView> {
  const doc = edition(t.version);
  const home = await readHome({ appraisalId: t.appraisalId, propertyId: t.propertyId, listingId: t.listingId }).catch(() => ({ answers: {}, who: {} }) as Awaited<ReturnType<typeof readHome>>);

  const people = t.parties.map((p, i) => {
    const fields = doc ? [...askedOf(doc, i), ...(i === 0 ? doc.details.filter((f) => f.fromAnswer) : [])] : [];
    const details: ViewRow[] = [];
    const bank: ViewRow[] = [];
    for (const f of fields) {
      const raw = String(p.details?.[f.key] ?? "");
      if (f.key === "accountNumber") {
        const last4 = openAccount(raw).replace(/\s/g, "").slice(-4);
        bank.push({ label: f.label, value: last4 ? `Ending ${last4}` : "Not given" });
        continue;
      }
      (BANK.includes(f.key) ? bank : details).push({ label: f.label, value: detailText(f, raw) || "Not given" });
    }
    return { key: p.key, name: p.name, signedAt: p.signedAt, details, bank };
  });

  const sections: AnswersView["home"] = [];
  for (const st of PROPERTY_QUESTIONS) {
    const rows: ViewRow[] = [];
    for (const q of st.questions) {
      const v = home.answers[q.id];
      if (!asked(q, home.answers) || !String(v ?? "").trim()) continue;
      let value = SECRET_KEYS.has(q.id)
        ? "Given, kept locked away"
        : q.kind === "choice"
          ? q.options?.find((o) => o.id === v)?.label ?? String(v)
          : Array.isArray(v)
            ? v.join(", ")
            : String(v);
      if (cardAsked(q, home.answers) && home.answers[cardKey(q.id)]) value += home.answers[cardKey(q.id)] === "yes" ? " (card or key meter)" : " (not a card meter)";
      const who = home.who[q.id];
      rows.push({ label: q.label, value, ...(who ? { by: who.by.startsWith("landlord:") ? ("landlord" as const) : ("agent" as const), at: who.at } : {}) });
    }
    if (rows.length) sections.push({ title: st.title, rows });
  }

  return {
    id: t.id,
    address: t.propertyAddress,
    wording: doc ? `${doc.subtitle}, ${doc.edition}` : "",
    asksQuestions: Boolean(doc?.asksFirst),
    asksBank: Boolean(doc?.details.some((f) => f.key === "accountNumber")),
    completedAt: t.completedAt,
    people,
    home: sections,
  };
}
