"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, Guide, Seg, ToolShell } from "@/components/new-look/tools/ToolBits";
import {
  ENGLAND_GROUNDS, SCOTLAND_GROUNDS, daysBetween, landlordNotice, longDate, periodLabel, rentIncrease, shortDate, tenantNotice,
  type Answer, type Delivery, type Nation, type NoticeKind,
} from "@/lib/notice-dates";

/**
 * TOOLS > NOTICE DATES (James, 10 Nov 2026: "Build top three"). The notice
 * screens ask for a date and do no arithmetic; this does the arithmetic. The
 * rules live in lib/notice-dates as data for compliance to check. Nothing is
 * read or saved: it is a calculator, and it says it is a guide.
 */

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const NATIONS = [{ id: "england", label: "England" }, { id: "scotland", label: "Scotland" }, { id: "wales", label: "Wales" }] as const;
const KINDS = [{ id: "rent", label: "Rent Increase" }, { id: "landlord", label: "Landlord's Notice" }, { id: "tenant", label: "Tenant's Notice" }] as const;
const HOW = [{ id: "hand", label: "By Hand" }, { id: "post", label: "Post or Email" }] as const;

export default function NoticeDates() {
  const [nation, setNation] = useState<Nation>("england");
  const [kind, setKind] = useState<NoticeKind>("rent");
  const [today, setToday] = useState("");
  const [served, setServed] = useState("");
  const [start, setStart] = useState("");
  const [last, setLast] = useState("");
  const [rentDay, setRentDay] = useState("");
  const [delivery, setDelivery] = useState<Delivery>("post");
  const [grounds, setGrounds] = useState<string[]>([]);

  useEffect(() => { const t = todayIso(); setToday(t); setServed(t); }, []);
  useEffect(() => { setGrounds([]); }, [nation]);

  const scot = nation === "scotland";
  const day = Number(rentDay) || null;
  const answer: Answer | null = useMemo(() => {
    if (nation === "wales") return { ok: false, says: "Wales runs on occupation contracts with their own notice rules. Ask compliance for the date." };
    if (!served) return null;
    if (kind === "rent") return rentIncrease({ nation, served, start, last: last || null, rentDay: day, delivery });
    if (kind === "landlord") return landlordNotice({ nation, served, start, grounds, delivery });
    return tenantNotice({ nation, served, rentDay: day, delivery });
  }, [nation, kind, served, start, last, day, delivery, grounds]);

  const servedLabel = kind === "tenant"
    ? scot ? "Date the Tenant Sends It" : "Date the Landlord Receives It"
    : scot ? "Date the Notice Is Sent" : "Date the Tenant Receives It";
  const list = scot ? SCOTLAND_GROUNDS.map((g) => ({ id: g.id, name: g.name, tag: g.conduct ? "28 days" : "28 or 84 days" }))
    : ENGLAND_GROUNDS.map((g) => ({ id: g.id, name: g.name, tag: periodLabel(g.wait) }));
  const toggle = (id: string) => setGrounds((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const away = answer?.ok && today ? daysBetween(today, answer.date) : null;

  return (
    <ToolShell eyebrow="Day to day" title="Notice Dates" blurb="The earliest date a rent increase, a landlord's notice or a tenant's notice can take effect, with the working shown.">
      <div className="nl-at-split">
        <section className="nl-fc-card nl-at-form" aria-label="The tenancy">
          <div>
            <p className="nl-fc-k">Where Is the Home</p>
            <Seg label="Where is the home" value={nation} options={NATIONS} onChange={setNation} />
          </div>
          <div>
            <p className="nl-fc-k">What Is Being Served</p>
            <Seg label="What is being served" value={kind} options={KINDS} onChange={setKind} />
          </div>
          {nation !== "wales" && (
            <>
              <div className="nl-at-row">
                <Field label={servedLabel} hint={scot ? undefined : "Count from the day it arrives, not the day it is posted."}>
                  <input type="date" value={served} onChange={(e) => setServed(e.target.value)} />
                </Field>
                {kind !== "tenant" && (
                  <Field label="Tenancy Start Date">
                    <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                  </Field>
                )}
                {kind === "rent" && (
                  <Field label="Last Increase Took Effect" hint="Leave blank if the rent has never gone up.">
                    <input type="date" value={last} onChange={(e) => setLast(e.target.value)} />
                  </Field>
                )}
                {!scot && kind !== "landlord" && (
                  <Field label="Rent Day of the Month" hint="1 to 31. Rent paid weekly or fortnightly: ask compliance.">
                    <input inputMode="numeric" value={rentDay} placeholder="1" onChange={(e) => setRentDay(e.target.value.replace(/\D/g, "").slice(0, 2))} />
                  </Field>
                )}
              </div>
              {scot && (
                <div>
                  <p className="nl-fc-k">How Is It Sent</p>
                  <Seg label="How is it sent" value={delivery} options={HOW} onChange={setDelivery} />
                </div>
              )}
              {kind === "landlord" && (
                <fieldset className="nl-at-grounds">
                  <legend className="nl-fc-k">{scot ? "Reason for the Notice" : "Grounds on the Notice"}</legend>
                  <ul>
                    {list.map((g) => (
                      <li key={g.id}>
                        <label className={grounds.includes(g.id) ? "is-on" : ""}>
                          <input type="checkbox" checked={grounds.includes(g.id)} onChange={() => toggle(g.id)} />
                          <b>{g.id}</b>
                          <span>{g.name}</span>
                          <em>{g.tag}</em>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}
            </>
          )}
        </section>

        <section className="nl-at-result" aria-live="polite">
          {!answer ? (
            <div className="nl-fc-card nl-fc-wait"><span className="nl-fc-spin" aria-hidden /> Getting today&apos;s date…</div>
          ) : !answer.ok ? (
            <div className="nl-fc-card nl-at-ask"><p>{answer.says}</p></div>
          ) : (
            <>
              <div className="nl-at-hero">
                <p className="nl-fc-k">{answer.title}</p>
                <p className="nl-at-date">{longDate(answer.date)}</p>
                {away !== null && <p className="nl-at-away">{away > 0 ? `${away} days from today` : away === 0 ? "Today" : `${-away} days ago`}</p>}
              </div>
              <div className="nl-fc-card">
                <p className="nl-fc-k">How We Got There</p>
                <ol className="nl-at-steps">
                  {answer.steps.map((s) => (
                    <li key={s.label} className={s.decides ? "is-top" : ""}>
                      <span className="nl-at-when">{shortDate(s.date)}</span>
                      <span>
                        <b>{s.label}</b>
                        {s.decides && <i>Decides the date</i>}
                        <small>{s.why}</small>
                      </span>
                    </li>
                  ))}
                </ol>
                {answer.lapses && (
                  <p className="nl-at-lapse"><b>{shortDate(answer.lapses.date)}</b> {answer.lapses.says}</p>
                )}
                {answer.notes.length > 0 && (
                  <ul className="nl-at-notes">{answer.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                )}
              </div>
            </>
          )}
          <Guide>A guide, not legal advice. Compliance approves every notice before it is served.</Guide>
        </section>
      </div>
    </ToolShell>
  );
}
