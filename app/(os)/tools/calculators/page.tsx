"use client";

import { useState } from "react";
import { Guide, MoneyField, Seg, ToolShell, num, pounds } from "@/components/new-look/tools/ToolBits";
import { CHECKED, INCOME_TIMES, depositCaps, incomeNeeded, rentCovered, rentalYield, stampDuty, type Buyer, type TaxNation } from "@/lib/agent-sums";

/**
 * TOOLS > CALCULATORS (James, 10 Nov 2026: "Build top three"). The desktop had
 * none; the phone had the deposit sum and the rent converter. Four sums an
 * agent does on a call: yield, affordability, stamp duty, deposit. The
 * arithmetic is lib/agent-sums; nothing is read or saved.
 */

type Tab = "yield" | "afford" | "duty" | "deposit";
const TABS = [{ id: "yield", label: "Yield" }, { id: "afford", label: "Affordability" }, { id: "duty", label: "Stamp Duty" }, { id: "deposit", label: "Deposit" }] as const;
const NATIONS = [{ id: "england", label: "England" }, { id: "scotland", label: "Scotland" }, { id: "wales", label: "Wales" }] as const;
const BUYERS = [{ id: "additional", label: "Additional Property" }, { id: "moving", label: "Moving Home" }, { id: "first", label: "First-Time Buyer" }] as const;

const pct = (n: number) => `${n.toFixed(n >= 10 ? 1 : 2)}%`;
const Fig = ({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "olive" | "clay" | "brown" }) => (
  <div className="nl-fc-fig" data-tone={tone}>
    <p className="nl-fc-k">{k}</p>
    <p className="nl-fc-v">{v}</p>
    {sub && <p className="nl-fc-sub">{sub}</p>}
  </div>
);
const Empty = ({ children }: { children: React.ReactNode }) => <div className="nl-fc-card nl-at-empty">{children}</div>;

function YieldTab() {
  const [price, setPrice] = useState("");
  const [rent, setRent] = useState("");
  const [costs, setCosts] = useState("");
  const y = rentalYield(num(price), num(rent), costs.trim() ? num(costs) : null);
  return (
    <div className="nl-at-split">
      <section className="nl-fc-card nl-at-form" aria-label="The property">
        <MoneyField label="Purchase Price or Value" value={price} onChange={setPrice} placeholder="200,000" />
        <MoneyField label="Monthly Rent" value={rent} onChange={setRent} placeholder="1,000" />
        <MoneyField label="Yearly Costs" hint="Optional. Fees, insurance, repairs, service charge. Leave out the mortgage." value={costs} onChange={setCosts} />
      </section>
      <section className="nl-at-result" aria-live="polite">
        {!y ? <Empty>Enter a price and a monthly rent.</Empty> : (
          <div className="nl-at-figs">
            <Fig k="Gross Yield" v={pct(y.gross)} sub={`${pounds(y.yearlyRent)} a year in rent`} />
            {y.net !== null && <Fig k="Net Yield" v={pct(y.net)} sub={`${pounds(y.left ?? 0)} a year after costs`} tone="olive" />}
          </div>
        )}
        <Guide>Gross yield is a year&apos;s rent as a share of the price. Net yield takes the yearly costs off first. Neither allows for tax or empty months.</Guide>
      </section>
    </div>
  );
}

function AffordTab() {
  const [rent, setRent] = useState("");
  const [income, setIncome] = useState("");
  const need = num(rent) > 0 ? incomeNeeded(num(rent)) : null;
  const cover = num(income) > 0 ? rentCovered(num(income)) : null;
  return (
    <div className="nl-at-split">
      <section className="nl-fc-card nl-at-form" aria-label="Rent and income">
        <MoneyField label="Monthly Rent" hint="The whole rent, not one tenant's share." value={rent} onChange={setRent} placeholder="1,000" />
        <MoneyField label="Yearly Income" hint="Optional. Before tax. Add joint tenants together." value={income} onChange={setIncome} placeholder="30,000" />
      </section>
      <section className="nl-at-result" aria-live="polite">
        {!need && !cover && <Empty>Enter a rent, an income, or both.</Empty>}
        {need && (
          <div className="nl-at-figs">
            <Fig k="Tenants Need to Earn" v={pounds(need.tenant)} sub={`${INCOME_TIMES.tenant} times the yearly rent of ${pounds(need.yearlyRent)}`} />
            <Fig k="A Guarantor Needs to Earn" v={pounds(need.guarantor)} sub={`${INCOME_TIMES.guarantor} times the yearly rent`} tone="olive" />
          </div>
        )}
        {cover && (
          <div className="nl-at-figs">
            <Fig k="Rent This Income Covers" v={`${pounds(cover.tenant)} a month`} sub="As the tenant" tone="clay" />
            <Fig k="As a Guarantor" v={`${pounds(cover.guarantor)} a month`} sub="The most rent they can stand behind" tone="brown" />
          </div>
        )}
        {need && num(income) > 0 && (
          <p className={`nl-at-verdict ${num(income) >= need.tenant ? "is-yes" : "is-no"}`}>
            {num(income) >= need.tenant
              ? `${pounds(num(income))} covers this rent.`
              : num(income) >= need.guarantor ? `${pounds(num(income))} is ${pounds(need.tenant - num(income))} short as a tenant.` : `${pounds(num(income))} is ${pounds(need.tenant - num(income))} short of the tenant figure. A guarantor earning ${pounds(need.guarantor)} would cover it.`}
          </p>
        )}
        <Guide>The same income rule the pre-tenancy check uses. A guide before referencing, not a pass.</Guide>
      </section>
    </div>
  );
}

function DutyTab() {
  const [nation, setNation] = useState<TaxNation>("england");
  const [buyer, setBuyer] = useState<Buyer>("additional");
  const [price, setPrice] = useState("");
  const d = stampDuty(nation, buyer, num(price));
  return (
    <div className="nl-at-split">
      <section className="nl-fc-card nl-at-form" aria-label="The purchase">
        <div>
          <p className="nl-fc-k">Where Is the Property</p>
          <Seg label="Where is the property" value={nation} options={NATIONS} onChange={setNation} />
        </div>
        <div>
          <p className="nl-fc-k">Who Is Buying</p>
          <Seg label="Who is buying" value={buyer} options={BUYERS} onChange={setBuyer} />
        </div>
        <MoneyField label="Purchase Price" value={price} onChange={setPrice} placeholder="250,000" />
      </section>
      <section className="nl-at-result" aria-live="polite">
        {!d ? <Empty>Enter a purchase price.</Empty> : (
          <>
            <div className="nl-at-hero">
              <p className="nl-fc-k">{d.name}</p>
              <p className="nl-at-date">{pounds(d.total)}</p>
              <p className="nl-at-away">{pct(d.effective)} of the price</p>
            </div>
            <div className="nl-fc-card nl-fc-table nl-at-duty">
              <table>
                <thead><tr><th>Band</th><th>Rate</th><th className="nl-at-taxed">Taxed</th><th>Tax</th></tr></thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.from}>
                      <td>{l.to === null ? `Over ${pounds(l.from)}` : l.from === 0 ? `Up to ${pounds(l.to)}` : `${pounds(l.from)} to ${pounds(l.to)}`}</td>
                      <td>{l.rate}%</td>
                      <td className="nl-at-taxed">{pounds(l.taxed)}</td>
                      <td>{pounds(l.tax)}</td>
                    </tr>
                  ))}
                  {d.extra && <tr><td colSpan={2} className="nl-at-wrap">{d.extra.says}</td><td className="nl-at-taxed" /><td>{pounds(d.extra.tax)}</td></tr>}
                  <tr><td className="is-total" colSpan={2}>Total</td><td className="nl-at-taxed" /><td className="is-total">{pounds(d.total)}</td></tr>
                </tbody>
              </table>
            </div>
            {d.notes.length > 0 && <ul className="nl-at-notes">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </>
        )}
        <Guide>Rates checked on {CHECKED}. They change at a Budget. A guide for a conversation: the buyer&apos;s solicitor gives the figure.</Guide>
      </section>
    </div>
  );
}

function DepositTab() {
  const [rent, setRent] = useState("");
  const d = num(rent) > 0 ? depositCaps(num(rent)) : null;
  return (
    <div className="nl-at-split">
      <section className="nl-fc-card nl-at-form" aria-label="The rent">
        <MoneyField label="Monthly Rent" value={rent} onChange={setRent} placeholder="1,000" />
      </section>
      <section className="nl-at-result" aria-live="polite">
        {!d ? <Empty>Enter a monthly rent.</Empty> : (
          <div className="nl-at-figs">
            <Fig k="Most Holding Deposit" v={pounds(d.holding)} sub="One week's rent" />
            <Fig k="Most Tenancy Deposit" v={pounds(d.deposit)} sub={`${d.weeks} weeks' rent${d.weeks === 6 ? ", as the yearly rent is £50,000 or more" : ""}`} tone="olive" />
          </div>
        )}
        <Guide>England, under the Tenant Fees Act 2019. Wales and Scotland have their own rules. A guide, not legal advice.</Guide>
      </section>
    </div>
  );
}

export default function Calculators() {
  const [tab, setTab] = useState<Tab>("yield");
  return (
    <ToolShell eyebrow="Day to day" title="Calculators" blurb="The sums that come up on a call: yield, what a tenant needs to earn, stamp duty and the deposit cap.">
      <div className="nl-at-tabs">
        <Seg label="Which calculator" value={tab} options={TABS} onChange={setTab} />
      </div>
      {tab === "yield" && <YieldTab />}
      {tab === "afford" && <AffordTab />}
      {tab === "duty" && <DutyTab />}
      {tab === "deposit" && <DepositTab />}
    </ToolShell>
  );
}
