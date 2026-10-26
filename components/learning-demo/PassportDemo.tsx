"use client";

import { useCallback, useState } from "react";
import PassportBookForm from "@/components/passport-book/PassportBookForm";
import { EMPTY_PASSPORT, type PassportData } from "@/lib/passport-shape";
import DemoFrame, { type DemoAnswer } from "./DemoFrame";

/**
 * The tenant passport, the real new one (components/passport-book), on the
 * invented story: Sophie Turner, enquiring about 8 Recreation Terrace with
 * Sam Whitaker. For the Systems tour (lib/learning/pages), so an agent can
 * click through it as a tenant would.
 *
 * It starts at the beginning. Most answers are already in, so it moves
 * quickly, but each step leaves one thing to do - a tap, or a word typed - so
 * every stamp is earned by pressing Continue, the way a tenant earns it. The
 * address step is left open so the lookup can be tried (it offers a few
 * invented addresses). Nothing is saved or sent: DemoFrame answers every call.
 */

const HOME = "8 Recreation Terrace, Nottingham NG2 3AB";

/* Invented addresses for the lookup. The last has no door, so the passport asks for the number. */
const ADDRESSES = [
  { id: "demo-a1", label: "22 Arboretum Street, Nottingham NG1 4JA" },
  { id: "demo-a2", label: "Flat 3, 22 Arboretum Street, Nottingham NG1 4JA" },
  { id: "demo-a3", label: "Arboretum Street, Nottingham NG1 4JA" },
];

/** "YYYY-MM" for n months before now: rolls with the calendar, never a fixed month. */
function monthsAgo(n: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sophie(): PassportData {
  return {
    ...EMPTY_PASSPORT,
    /* Who you are: nationality left to type. */
    legalName: "Sophie Turner",
    knownAs: "Soph",
    dob: "1996-04-14",
    nationality: "",
    /* Getting in touch: the address left for the lookup. */
    email: "sophie.sample@example.com",
    mobile: "07700 900123",
    currentAddress: "",
    movedIn: monthsAgo(20),
    livedThreeYears: false,
    previousAddress: "5 Castle Boulevard, Nottingham NG7 1FB",
    /* Your move: when, left to pick. */
    moveWhen: "",
    budget: "1,250",
    numAdults: "1",
    numChildren: "0",
    pets: true,
    petsNote: "A dog",
    smoker: false,
    smoking: "No",
    /* Work and income: the guarantor question left to answer. */
    applicantType: "Employed",
    workHours: "Full-time",
    zeroHours: false,
    onProbation: false,
    annualIncome: "34,000",
    savings: "5,200",
    guarantor: null,
    /* Right to rent: left to pick. */
    hasBritishPassport: null,
    /* Where you live now: how, left to pick. */
    livingNow: "",
    rentedLast12Months: true,
    rentOnTime: true,
    landlordRef: true,
    adverseCredit: false,
    issues: "No",
    /* Check and sign: both ticks and the signature are theirs to do. */
    declaredTrue: false,
    consentChecks: false,
    signature: "",
  };
}

export default function PassportDemo() {
  const [run, setRun] = useState(0);
  const [initial, setInitial] = useState<PassportData>(sophie);

  const answer = useCallback<DemoAnswer>((method, url) => {
    const p = url.pathname;
    if (p === "/api/tenant/passport/opened") return { json: { ok: true } };
    if (p === "/api/tenant/passport/address" && method === "GET") {
      const id = url.searchParams.get("resolve");
      if (id) return { json: { address: ADDRESSES.find((a) => a.id === id)?.label ?? "" } };
      return { json: { suggestions: (url.searchParams.get("q") ?? "").trim().length >= 3 ? ADDRESSES : [] } };
    }
    if (p === "/api/tenant/passport/account" && method === "POST") {
      return {
        json: {
          ok: false,
          error: "This is the demo, so no account is made. In the real passport Sophie's tenant area opens here, with everything already filled in.",
        },
      };
    }
    /* The autosave (PUT) and Sign (POST ?submit=1): kept on the page only. */
    if (p === "/api/tenant/passport" && (method === "PUT" || method === "POST")) return { json: { ok: true } };
    return { status: 404, json: { ok: false, error: "That isn't part of the demo." } };
  }, []);

  const restart = () => {
    setInitial(sophie());
    setRun((n) => n + 1);
    window.scrollTo({ top: 0 });
  };

  return (
    <DemoFrame answer={answer} label="Demo" onRestart={restart}>
      <PassportBookForm
        key={run}
        token=""
        initial={initial}
        submittedAt={null}
        agentName="Sam"
        accountExists={false}
        home={HOME}
      />
    </DemoFrame>
  );
}
