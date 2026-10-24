"use client";

import {
  APPLICANT_TYPES,
  ISSUES,
  LIVING_NOW,
  MOVE_WHEN,
  SMOKING,
  TRADING_FOR,
  WORK_HOURS,
  householdIncome,
  isEmployed,
  isTrading,
  money,
  otherAdultCount,
  otherCredit,
  withOtherCredit,
  workFlags,
  type PassportData,
  type PassportRules,
} from "@/lib/passport-shape";
import type { PassportQuestion } from "@/components/PassportForm";
import { AddressLookup, Check, Choice, Money, PhotoPick, Q, Stepper, YesNo, type Opt } from "./fields";
import { Ic } from "./icons";
import { HOW_LONG, stepOk, summary, type Ctx, type StepDef, type StepId, type Ui } from "./model";

/**
 * What each step asks, drawn in the design's style. Every question today's
 * passport asks is here, in the step it belongs to, saved under the same key
 * in the same format. The rules for who is asked what are today's rules:
 * the work questions only for the employed or trading, a previous address
 * under three years, every other adult by name with their own credit
 * question, a note behind every yes that needs one.
 */

/** The nationalities people actually type, so most get it in three letters. Free text all the same. */
const NATIONALITIES = [
  "British", "Irish", "Polish", "Romanian", "Indian", "Pakistani", "Nigerian", "Italian",
  "Portuguese", "Spanish", "French", "German", "Lithuanian", "Bulgarian", "South African",
  "Australian", "American", "Chinese", "Filipino", "Bangladeshi", "Ghanaian", "Zimbabwean",
  "Ukrainian", "Turkish", "Greek", "Dutch", "Brazilian", "Hong Konger", "Sri Lankan", "Nepalese",
];

const APPLICANT_SUBS: Record<string, string> = {
  Employed: "Full or part time",
  "Self-employed": "Working for yourself",
  "Company director": "Of your own company",
  Student: "Full time",
  Retired: "Pension or savings",
  "On benefits": "",
  "Not working": "At the moment",
};

export type Boxes = { dd: string; mm: string; yyyy: string };

export type StepProps = {
  id: StepId;
  d: PassportData;
  set: <K extends keyof PassportData>(k: K, v: PassportData[K]) => void;
  patch: (p: Partial<PassportData>) => void;
  rules: PassportRules;
  err: string[];
  token: string;
  ui: Ui;
  setUi: (p: Partial<Ui>) => void;
  dob: Boxes;
  onDob: (part: keyof Boxes, v: string) => void;
  moved: Omit<Boxes, "dd">;
  onMoved: (part: "mm" | "yyyy", v: string) => void;
  onHowLong: (v: string) => void;
  questions: PassportQuestion[];
  answers: Record<string, string>;
  setAnswer: (id: string, v: string) => void;
  agentName: string;
  steps: StepDef[];
  ctx: Ctx;
  goto: (k: number) => void;
  next: () => void;
};

/** Two or three boxes for a date, the next box taking the cursor once one is full. */
function DateBoxes({ id, parts, onPart, labels }: { id: string; parts: { key: string; value: string; len: number; ph: string; ac?: string }[]; onPart: (key: string, v: string) => void; labels: string[] }) {
  return (
    <div className={`dob${parts.length === 2 ? " two" : ""}`}>
      {parts.map((p, i) => (
        <div key={p.key}>
          <input
            className="in"
            id={i === 0 ? id : `${id}-${p.key}`}
            aria-label={labels[i]}
            inputMode="numeric"
            maxLength={p.len}
            placeholder={p.ph}
            autoComplete={p.ac}
            value={p.value}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, p.len);
              onPart(p.key, v);
              if (v.length === p.len) {
                const nx = e.target.closest("div")?.nextElementSibling?.querySelector("input");
                if (nx) (nx as HTMLInputElement).focus();
              }
            }}
          />
          <small>{labels[i]}</small>
        </div>
      ))}
    </div>
  );
}

export default function StepBody(p: StepProps) {
  const { d, set, patch, err } = p;

  if (p.id === "you") {
    return (
      <>
        <Q k="legalName" label="Full legal name" htmlFor="f-legalName" help="As it appears on your passport or driving licence." err={err}>
          <input className="in" id="f-legalName" autoComplete="name" placeholder="e.g. Samantha Jones" value={d.legalName} onChange={(e) => set("legalName", e.target.value)} />
        </Q>
        <Q k="knownAs" label="Known as" htmlFor="f-knownAs" help="If you go by something else." opt err={err}>
          <input className="in" id="f-knownAs" autoComplete="nickname" placeholder="e.g. Sam" value={d.knownAs} onChange={(e) => set("knownAs", e.target.value)} />
        </Q>
        <Q k="dob" label="Date of birth" htmlFor="f-dob" err={err}>
          <DateBoxes
            id="f-dob"
            labels={["Day", "Month", "Year"]}
            parts={[
              { key: "dd", value: p.dob.dd, len: 2, ph: "DD", ac: "bday-day" },
              { key: "mm", value: p.dob.mm, len: 2, ph: "MM", ac: "bday-month" },
              { key: "yyyy", value: p.dob.yyyy, len: 4, ph: "YYYY", ac: "bday-year" },
            ]}
            onPart={(k, v) => p.onDob(k as keyof Boxes, v)}
          />
        </Q>
        {/* Never asked in Scotland (lib/passport-scotland). */}
        {!p.rules.noNationality && (
          <Q k="nationality" label="Nationality" htmlFor="f-nationality" err={err}>
            <input className="in" id="f-nationality" list="tpx-nationalities" autoComplete="off" placeholder="Start typing" value={d.nationality} onChange={(e) => set("nationality", e.target.value)} />
            <datalist id="tpx-nationalities">
              {NATIONALITIES.map((n) => <option key={n} value={n} />)}
            </datalist>
          </Q>
        )}
        <div className="q">
          <div className="ql">A photo of you <span className="opt">(optional)</span></div>
          <PhotoPick value={d.photo} focus={d.photoFocus} onChange={(v) => set("photo", v)} onFocus={(f) => set("photoFocus", f)} />
        </div>
      </>
    );
  }

  if (p.id === "reach") {
    const howlong = p.ui.howlong;
    return (
      <>
        <div className="pair">
          <Q k="mobile" label="Mobile" htmlFor="f-mobile" err={err}>
            <input className="in" id="f-mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="07700 900123" value={d.mobile} onChange={(e) => set("mobile", e.target.value)} />
          </Q>
          <Q k="email" label="Email" htmlFor="f-email" err={err}>
            <input className="in" id="f-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={d.email} onChange={(e) => set("email", e.target.value)} />
          </Q>
        </div>
        <Q k="currentAddress" label="Your address now" htmlFor="f-currentAddress" help="Type your postcode and pick your address from the list." err={err}>
          <AddressLookup id="f-currentAddress" token={p.token} value={d.currentAddress} onChange={(v) => set("currentAddress", v)} onEnter={p.next} />
        </Q>
        <Choice k="howlong" label="How long have you lived there?" opts={HOW_LONG} value={howlong} onPick={p.onHowLong} err={err} />
        {(howlong || d.movedIn) && (
          <Q k="movedIn" label="Roughly when did you move in?" htmlFor="f-movedIn" help="The month and year. Referencing looks back three years." err={err}>
            <DateBoxes
              id="f-movedIn"
              labels={["Month", "Year"]}
              parts={[
                { key: "mm", value: p.moved.mm, len: 2, ph: "MM" },
                { key: "yyyy", value: p.moved.yyyy, len: 4, ph: "YYYY" },
              ]}
              onPart={(k, v) => p.onMoved(k as "mm" | "yyyy", v)}
            />
          </Q>
        )}
        {d.livedThreeYears === false && (
          <Q k="previousAddress" label="Where did you live before?" htmlFor="f-previousAddress" help="Under three years there, so referencing needs one more." err={err}>
            <AddressLookup id="f-previousAddress" token={p.token} value={d.previousAddress} onChange={(v) => set("previousAddress", v)} onEnter={p.next} />
          </Q>
        )}
      </>
    );
  }

  if (p.id === "move") {
    const adults = Math.min(9, Math.max(1, parseInt(d.numAdults, 10) || 1));
    const children = Math.min(12, Math.max(0, parseInt(d.numChildren, 10) || 0));
    const others = otherAdultCount(d);
    const rows = d.coOccupantIncomes.split("\n");
    const row = (k: number) => {
      const line = rows[k] ?? "";
      const at = line.indexOf(" - ");
      return at === -1 ? { name: line.trim(), income: "" } : { name: line.slice(0, at).trim(), income: line.slice(at + 3).trim() };
    };
    /* "Name - income", a line each, exactly as today's passport writes them. */
    const write = (k: number, part: Partial<{ name: string; income: string }>) => {
      const next = Array.from({ length: Math.max(rows.length, k + 1) }, (_, j) => (j === k ? { ...row(j), ...part } : row(j)));
      set("coOccupantIncomes", next.map((r) => (r.name || r.income ? `${r.name} - ${r.income}` : "")).join("\n"));
    };
    const household = householdIncome(d);
    const WHEN: Opt[] = [
      { v: MOVE_WHEN[0], sub: "In the next 2 weeks", icon: "bolt" },
      { v: MOVE_WHEN[1], icon: "cal" },
      { v: MOVE_WHEN[2], icon: "cal" },
      { v: MOVE_WHEN[3], sub: "No date yet", icon: "clock" },
    ];
    return (
      <>
        <Choice k="moveWhen" label="When would you like to move?" opts={WHEN} value={d.moveWhen} onPick={(v) => set("moveWhen", v)} big err={err} />
        <Q k="budget" label="Your budget each month" htmlFor="f-budget" help="Including bills is fine, just tell us roughly." err={err}>
          <Money id="f-budget" value={d.budget} onChange={(v) => set("budget", v)} per="per month" placeholder="1,000" />
        </Q>
        <div className="pair">
          <Stepper label="Adults moving in, including you" value={adults} min={1} max={9} onChange={(n) => set("numAdults", String(n))} />
          <Stepper label="Children" value={children} min={0} max={12} onChange={(n) => set("numChildren", String(n))} />
        </div>
        {Array.from({ length: others }, (_, k) => {
          const r = row(k);
          const cr = otherCredit(d, k);
          const first = r.name.split(/\s+/)[0] || "them";
          return (
            <div className="who" key={k}>
              <p>{others === 1 ? "Who else is moving in" : `Adult ${k + 2} of ${adults}`}</p>
              <Q k={`other-${k}`} label="Their name" htmlFor={`f-other-${k}`} err={err}>
                <input className="in" id={`f-other-${k}`} autoComplete="off" placeholder="Their full name" value={r.name} onChange={(e) => write(k, { name: e.target.value.replace(/ - /g, " ") })} />
              </Q>
              <Q k={`otherincome-${k}`} label="Their income towards the total" htmlFor={`f-otherincome-${k}`} help="A year, before tax. It counts towards the household total." opt err={err}>
                <Money id={`f-otherincome-${k}`} value={r.income} onChange={(v) => write(k, { income: v })} per="a year" placeholder="24,000" />
              </Q>
              <YesNo
                k={`othercredit-${k}`}
                label={`Any CCJs, defaults or bankruptcy for ${first}?`}
                help="The same question we ask you. Referencing checks everyone moving in."
                value={cr.credit}
                onPick={(v) => set("coOccupantCredit", withOtherCredit(d, k, v, v ? cr.note : ""))}
                err={err}
              />
              {cr.credit === true && (
                <Q k={`othernote-${k}`} label="A line about it" htmlFor={`f-othernote-${k}`} help="Context helps, and it’s rarely a no on its own." err={err}>
                  <textarea className="in" id={`f-othernote-${k}`} rows={3} value={cr.note} onChange={(e) => set("coOccupantCredit", withOtherCredit(d, k, true, e.target.value))} />
                </Q>
              )}
            </div>
          );
        })}
        {others > 0 && household.total !== null && household.from > 1 && (
          <p className="total">Household income <b className="num">£{household.total.toLocaleString("en-GB")}</b> a year, between {household.from} of you.</p>
        )}
        <Choice
          k="pets"
          label="Any pets?"
          opts={["No pets", { v: "A cat", icon: "paw" }, { v: "A dog", icon: "paw" }, "Something else"]}
          value={p.ui.petPick}
          onPick={(v) => {
            p.setUi({ petPick: v });
            if (v === "No pets") patch({ pets: false, petsNote: "" });
            else if (v === "A cat" || v === "A dog") patch({ pets: true, petsNote: v });
            else patch({ pets: true, petsNote: d.petsNote === "A cat" || d.petsNote === "A dog" ? "" : d.petsNote });
          }}
          err={err}
        />
        {d.pets === true && p.ui.petPick === "Something else" && (
          <Q k="petsNote" label="What kind?" htmlFor="f-petsNote" err={err}>
            <input className="in" id="f-petsNote" placeholder="e.g. two cats, or a rabbit" value={d.petsNote} onChange={(e) => set("petsNote", e.target.value)} />
          </Q>
        )}
        <Choice
          k="smoking"
          label="Does anyone smoke or vape?"
          opts={SMOKING}
          value={d.smoking || (d.smoker === false ? "No" : "")}
          onPick={(v) => patch({ smoking: v, smoker: v !== "No" })}
          err={err}
        />
      </>
    );
  }

  if (p.id === "work") {
    const inc = money(d.annualIncome) ?? 0;
    const max = inc > 0 ? Math.floor(inc / 30 / 25) * 25 : 0;
    const flags = workFlags(d);
    const noPay = ["Student", "Not working", "On benefits"].includes(d.applicantType);
    return (
      <>
        <Choice
          k="applicantType"
          label="What do you do?"
          opts={APPLICANT_TYPES.map((v) => ({ v, sub: APPLICANT_SUBS[v] || undefined }))}
          value={d.applicantType}
          onPick={(v) => set("applicantType", v)}
          big
          err={err}
        />
        {/* The work questions referencing turns on (Rhiannon, 1 Oct 2026), only of the people they apply to. */}
        {isEmployed(d) && (
          <>
            <Choice k="workHours" label="Full-time or part-time?" opts={WORK_HOURS} value={d.workHours} onPick={(v) => set("workHours", v)} err={err} />
            <YesNo k="zeroHours" label="Are you on a zero-hours contract?" help="Referencing can’t accept zero-hours income on its own, so it’s worth knowing now. A guarantor gets round it." value={d.zeroHours} onPick={(v) => set("zeroHours", v)} err={err} />
            <YesNo k="onProbation" label="Are you still on probation?" help="If you are, a landlord may ask for a guarantor as well." value={d.onProbation} onPick={(v) => set("onProbation", v)} err={err} />
          </>
        )}
        {isTrading(d) && (
          <Choice k="tradingFor" label="How long have you been trading?" help="Under a year, a landlord may ask for a guarantor as well." opts={TRADING_FOR} value={d.tradingFor} onPick={(v) => set("tradingFor", v)} err={err} />
        )}
        {flags.map((f) => (
          <div className="hint warn" key={f}><Ic k="info" /><span>{f}</span></div>
        ))}
        {d.applicantType && (
          <Q
            k="annualIncome"
            label="Yearly income before tax"
            htmlFor="f-annualIncome"
            help={d.applicantType === "Retired" ? "Your pension and any other regular income." : noPay ? "Any regular income, including grants or benefits. Put 0 if you have none." : "Your share, if you’re moving in with someone. Your monthly pay times twelve is close enough."}
            err={err}
          >
            <Money id="f-annualIncome" value={d.annualIncome} onChange={(v) => set("annualIncome", v)} per="a year" placeholder="32,000" />
          </Q>
        )}
        {max > 0 && (
          <p className="afford">Homes up to about <b className="num">£{max.toLocaleString("en-GB")} a month</b> should pass referencing on your income alone.</p>
        )}
        {d.applicantType && (
          <Q k="savings" label="Savings" htmlFor="f-savings" help="It’s what rescues a borderline application, so it’s worth putting in." opt err={err}>
            <Money id="f-savings" value={d.savings} onChange={(v) => set("savings", v)} per="saved" placeholder="4,000" />
          </Q>
        )}
        {d.applicantType && (
          <YesNo k="guarantor" label="Could someone be your guarantor if needed?" help="A UK homeowner who’d cover the rent if you couldn’t. Often needed for students." value={d.guarantor} onPick={(v) => set("guarantor", v)} err={err} />
        )}
      </>
    );
  }

  if (p.id === "rtr") {
    return (
      <>
        <Choice
          k="rtr"
          label="Which of these do you have?"
          opts={[
            { v: "British or Irish passport", sub: "In date, or expired is fine" },
            { v: "A share code", sub: "From your UK eVisa" },
            { v: "Something else", sub: "We’ll help you work it out" },
          ]}
          value={p.ui.rtrPick}
          onPick={(v) => {
            p.setUi({ rtrPick: v });
            set("hasBritishPassport", v === "British or Irish passport");
          }}
          big
          err={err}
        />
        {d.hasBritishPassport === false && p.ui.rtrPick === "Something else" && (
          <div className="hint"><Ic k="info" /><span>Without a British or Irish passport, you prove your right to rent online with a <b>share code</b>. Get yours free at gov.uk/prove-right-to-rent. It takes about two minutes and lasts 90 days.</span></div>
        )}
        {d.hasBritishPassport === false && (
          <Q k="shareCode" label="Your share code" htmlFor="f-shareCode" help="Nine characters, starting with R. You get it from the gov.uk right to rent page." err={err}>
            <input className="in" id="f-shareCode" autoCapitalize="characters" autoComplete="off" placeholder="R12 345 678" style={{ textTransform: "uppercase", letterSpacing: ".12em" }} value={d.shareCode} onChange={(e) => set("shareCode", e.target.value)} />
          </Q>
        )}
        <div className="hint"><Ic k="shield" /><span><b>We check the documents in person or by video</b> before you move in. You don’t need to upload anything today.</span></div>
      </>
    );
  }

  if (p.id === "history") {
    return (
      <>
        <Choice
          k="livingNow"
          label="Where are you living now?"
          opts={LIVING_NOW.map((v) => (v === "Renting" ? { v, sub: "From a landlord or agent" } : v))}
          value={d.livingNow}
          onPick={(v) => patch(v === "Renting" ? { livingNow: v, rentedLast12Months: true } : { livingNow: v })}
          big
          err={err}
        />
        {d.livingNow && d.livingNow !== "Renting" && (
          <YesNo k="rentedLast12Months" label="Have you rented in the last 12 months?" value={d.rentedLast12Months} onPick={(v) => set("rentedLast12Months", v)} err={err} />
        )}
        {d.rentedLast12Months === true && (
          <>
            <YesNo k="rentOnTime" label="Has the rent always been paid on time?" help="If not, say so. It’s far better coming from you than from a reference." value={d.rentOnTime} onPick={(v) => set("rentOnTime", v)} err={err} />
            <YesNo k="landlordRef" label="Could your landlord give you a reference?" value={d.landlordRef} onPick={(v) => set("landlordRef", v)} err={err} />
          </>
        )}
        <Choice
          k="issues"
          label="Any county court judgments (CCJs), defaults or bankruptcy?"
          help="It doesn’t rule you out. Telling us now means no surprises in referencing."
          opts={ISSUES}
          value={d.issues || (d.adverseCredit === false ? "No" : "")}
          onPick={(v) => patch({ issues: v, adverseCredit: v !== "No" })}
          err={err}
        />
        {d.adverseCredit === true && (
          <Q k="adverseCreditNote" label="A line about it" htmlFor="f-adverseCreditNote" help="Context helps, and it’s rarely a no on its own. We’ll talk it through with you." err={err}>
            <textarea className="in" id="f-adverseCreditNote" rows={3} value={d.adverseCreditNote} onChange={(e) => set("adverseCreditNote", e.target.value)} />
          </Q>
        )}
        {p.questions.length > 0 && (
          <div className="who">
            <p>{p.agentName ? `A few more from ${p.agentName}` : "A few more questions"}</p>
            <div className="hint"><Ic k="info" /><span>Your agent asks these as well. They aren’t part of the standard passport, so nobody else sees them.</span></div>
            {p.questions.map((qn) => {
              const k = `q-${qn.id}`;
              const v = p.answers[qn.id] ?? "";
              const label = qn.required ? qn.label : <>{qn.label} <span className="opt">(optional)</span></>;
              if (qn.kind === "yesno") {
                return <YesNo key={qn.id} k={k} label={label} value={v === "" ? null : v === "yes"} onPick={(b) => p.setAnswer(qn.id, b ? "yes" : "no")} err={err} />;
              }
              if (qn.kind === "select") {
                return <Choice key={qn.id} k={k} label={label} opts={qn.options} value={v} onPick={(o) => p.setAnswer(qn.id, o)} big={qn.options.length > 4} err={err} />;
              }
              return (
                <Q key={qn.id} k={k} label={label} htmlFor={`f-${k}`} err={err}>
                  <input className="in" id={`f-${k}`} value={v} onChange={(e) => p.setAnswer(qn.id, e.target.value)} />
                </Q>
              );
            })}
          </div>
        )}
      </>
    );
  }

  /* Check and sign. */
  return (
    <>
      <div className="sum">
        {p.steps.slice(0, -1).map((s, k) => {
          const ok = stepOk(s.id, p.ctx);
          const said = summary(s.id, d);
          return (
            <div key={s.id}>
              <b>{s.name}</b>
              <span className={ok ? "" : "todo"}>{ok ? said || "Done" : said ? `${said} · Something still to answer` : "Not filled in yet"}</span>
              <button type="button" onClick={() => p.goto(k)} aria-label={`Change ${s.name}`}>{ok ? "Change" : "Finish"}</button>
            </div>
          );
        })}
      </div>
      <div>
        <Check k="declaredTrue" checked={d.declaredTrue} onChange={(v) => set("declaredTrue", v)} err={err}>Everything here is true, as far as I know.</Check>
        <Check k="consentChecks" checked={d.consentChecks} onChange={(v) => set("consentChecks", v)} err={err}>If I apply for a home, The Letting Experts can use this to start my references and credit check.</Check>
      </div>
      <Q k="signature" label="Sign by typing your full name" htmlFor="f-signature" err={err}>
        <input
          className="in"
          id="f-signature"
          autoComplete="name"
          placeholder={d.legalName.trim() || "Your full name"}
          style={{ fontFamily: "var(--f-title)", fontWeight: 300, fontSize: 24, letterSpacing: "-.02em" }}
          value={d.signature}
          onChange={(e) => set("signature", e.target.value)}
        />
      </Q>
    </>
  );
}
