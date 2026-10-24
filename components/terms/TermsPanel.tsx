"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isScottish } from "@/lib/property-flags";
import { guessService, servicesFor } from "@/lib/terms/services";
import type { Country } from "@/lib/terms/types";
import TermsSignSheet from "@/components/terms/TermsSignSheet";
import { Badge, Ico } from "@/components/new-look/Parts";

/**
 * TERMS OF BUSINESS ON A HOME (James, 23 Oct 2026).
 *
 * "We'll have a nice little orange button that we can send it with... they
 * should just be able to send out the terms." With or without an appraisal:
 * the agent sends from the home's Compliance tab, signs their part there and
 * then, and every landlord gets their own link from the agent's mailbox.
 *
 * The banner says where it is: nothing sent, your part to sign, who has and
 * hasn't signed (with Send again and their link to copy), or signed with the
 * copy. Drawn in the new look; it carries its own [data-look] so it reads the
 * same wherever it is placed.
 */

type Person = { name: string; email: string; phone: string };

type StaffParty = {
  key: string;
  name: string;
  email: string;
  phone: string;
  status: "waiting" | "emailed" | "opened" | "signed";
  emailedAt: string | null;
  emailError: string | null;
  openedAt: string | null;
  signedAt: string | null;
  link: string;
};

type StaffTerms = {
  id: string;
  version: string;
  country: Country;
  status: "agent" | "sent" | "signed" | "cancelled";
  propertyAddress: string;
  agentName: string;
  agentEmail: string;
  agentEmbedSrc: string | null;
  agentSignedAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  signedR2Key: string | null;
  values: { serviceLevel: string; setUpFee: string; managementFee: string; additionalFees: string; agentLarn: string };
  replaces: string | null;
  parties: StaffParty[];
};

/** Which wording each country sends now ("October 2026"), or null where there is none yet. */
type Editions = { scotland: string | null; england: string | null };

/** One tick sent, two ticks read (James, 24 Oct 2026: "one tick next to it for Sent and two ticks for Read, just so the guys know"). */
function Ticks({ read, when }: { read: boolean; when?: string }) {
  return (
    <span className={`nl-tob-ticks${read ? " is-read" : ""}`} title={read ? "Opened" : "Sent, not opened yet"}>
      <svg viewBox="0 0 28 16" width="22" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 8.5l4 4 8.5-9" />
        {read ? <path d="M12 12.5l8.5-9" /> : null}
      </svg>
      {read ? "Read" : "Sent"}
      {when ? ` ${when}` : ""}
    </span>
  );
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const names = (ps: { name: string }[]) => (ps.length < 2 ? ps[0]?.name ?? "" : `${ps.slice(0, -1).map((p) => p.name).join(", ")} and ${ps[ps.length - 1].name}`);

export default function TermsPanel({
  listingId = null,
  propertyId = null,
  appraisalId = null,
  propertyAddress,
  landlords = [],
  agentLarn = null,
  serviceOnRecord = null,
  scottish = null,
  feesOnRecord = null,
  onChanged,
  more,
}: {
  listingId?: string | null;
  propertyId?: string | null;
  appraisalId?: string | null;
  propertyAddress: string;
  /** Who we already know owns it, to start the list of who signs. */
  landlords?: Array<{ name?: string | null; email?: string | null; phone?: string | null }>;
  agentLarn?: string | null;
  serviceOnRecord?: string | null;
  /** What the home's own record says (its Scotland flag); null to go by the address alone. */
  scottish?: boolean | null;
  /** Fees already agreed (the appraisal's), in the contract's words, to start the drawer from instead of the standard ones. */
  feesOnRecord?: { setUpFee?: string | null; managementFee?: string | null } | null;
  onChanged?: () => void;
  /** Beside the button while nothing has gone (the listing's "Upload a signed copy"). */
  more?: React.ReactNode;
}) {
  const [all, setAll] = useState<StaffTerms[] | null>(null);
  const [preview, setPreview] = useState(false);
  const [editions, setEditions] = useState<Editions>({ scotland: null, england: null });
  const [sending, setSending] = useState(false);
  /* Adjust contract (James, 23 Oct 2026): the drawer again, filled in from the set out now. */
  const [adjusting, setAdjusting] = useState<StaffTerms | null>(null);
  const [remindAsk, setRemindAsk] = useState(false);
  const [signing, setSigning] = useState<StaffTerms | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [withdrawAsk, setWithdrawAsk] = useState(false);
  const [justSent, setJustSent] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (listingId) qs.set("listingId", listingId);
    if (propertyId) qs.set("propertyId", propertyId);
    if (appraisalId) qs.set("appraisalId", appraisalId);
    const j = await fetch(`/api/terms?${qs}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) {
      setAll(j.terms);
      setPreview(Boolean(j.preview));
      if (j.editions) setEditions(j.editions);
    } else setAll([]);
  }, [listingId, propertyId, appraisalId]);
  useEffect(() => {
    void load();
  }, [load]);

  const live = (all ?? []).find((t) => t.status !== "cancelled") ?? null;
  /* While an adjusted set waits for the agent's signature, the one it replaces is still out. */
  const replacing = live?.replaces ? (all ?? []).find((t) => t.id === live.replaces && t.status === "sent") ?? null : null;

  async function act(t: StaffTerms, body: Record<string, string>, key: string): Promise<string | null> {
    setBusy(key);
    setSaid(null);
    const j = await fetch(`/api/terms/${t.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(null);
    if (!j?.ok) return j?.error ?? "That didn't work. Try again in a moment.";
    await load();
    onChanged?.();
    return null;
  }

  async function agentDone(t: StaffTerms): Promise<string | null> {
    const problem = await act(t, { action: "agent-signed" }, "agent");
    if (!problem) {
      setSigning(null);
      setSaid(null);
      setJustSent(true);
    }
    return problem;
  }

  const copy = (p: StaffParty) => {
    navigator.clipboard?.writeText(p.link).then(() => {
      setCopied(p.key);
      window.setTimeout(() => setCopied(null), 1600);
    }).catch(() => window.prompt("Their link", p.link));
  };

  if (all === null) {
    return (
      <section data-look="new" className="nl-cmp-tob">
        <p className="nl-meta">Reading the terms…</p>
      </section>
    );
  }

  const signedCount = live ? live.parties.filter((p) => p.signedAt).length : 0;
  /* Said after the agent signs, from what actually went: never "in their inbox" over an email that didn't. */
  const unsent = live ? live.parties.filter((p) => p.emailError && !p.emailedAt) : [];
  const sentLine =
    justSent && live?.status === "sent"
      ? !unsent.length
        ? "Signed and sent. Each person has their own link in their inbox."
        : unsent.length === live.parties.length
          ? "Signed, but the emails didn't go. Copy each person's link below and send it to them yourself."
          : `Signed and sent, but the email to ${names(unsent)} didn't go. Copy their link below.`
      : null;
  const tone = live?.status === "signed" ? " is-signed" : "";

  return (
    <div data-look="new" className="nl-terms-wrap">
      <section className={`nl-terms${tone}`}>
        <span className="nl-terms-ic" aria-hidden>
          {live?.status === "signed" ? <Ico name="check" size={18} /> : <Ico name="pen" size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="nl-block-title">Terms of Business</h3>
          <p className="nl-meta mt-1">
            {!live
              ? `Nothing has gone yet. Send them and everyone who owns ${propertyAddress.split(",")[0] || "the home"} gets their own link to read and sign.`
              : live.status === "agent"
                ? replacing
                  ? `Adjusted, but nothing has gone: sign your part and it goes out. The contract sent ${day(replacing.sentAt)} stays live until you do.`
                  : "Made, but nothing has gone: sign your part and they go out."
                : live.status === "sent"
                  ? `Sent ${day(live.sentAt)} to ${names(live.parties)}. ${signedCount} of ${live.parties.length} signed.`
                  : `Signed by ${names(live.parties)} on ${day(live.completedAt)}.${live.signedR2Key ? " Copy on file." : ""}`}
          </p>
        </div>
        {!live ? (
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" className="nl-btn nl-btn--primary" onClick={() => setSending(true)}>
              <Ico name="arrow" size={15} /> Send Terms of Business
            </button>
            {more}
          </span>
        ) : live.status === "agent" ? (
          <button type="button" className="nl-btn nl-btn--primary" onClick={() => setSigning(live)}>
            <Ico name="pen" size={15} /> Sign your part
          </button>
        ) : live.status === "sent" ? (
          <span className="nl-terms-acts">
            <Ticks read={live.parties.every((p) => p.openedAt || p.signedAt)} />
            {remindAsk ? (
              <>
                <button
                  type="button"
                  className="nl-btn nl-btn--secondary nl-btn--sm"
                  disabled={busy === "remind"}
                  onClick={async () => {
                    const waitingOn = live.parties.filter((p) => !p.signedAt);
                    const problem = await act(live, { action: "remind" }, "remind");
                    setRemindAsk(false);
                    setSaid(problem ?? `Reminder sent to ${names(waitingOn)}.`);
                  }}
                >
                  {busy === "remind" ? "Sending…" : `Email ${names(live.parties.filter((p) => !p.signedAt))}`}
                </button>
                <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setRemindAsk(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => setRemindAsk(true)}>Send a reminder</button>
            )}
            <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setAdjusting(live)}>Adjust contract</button>
          </span>
        ) : live.status === "signed" ? (
          live.signedR2Key ? (
            <a className="nl-btn nl-btn--secondary nl-btn--sm" href={`/api/terms/${live.id}/document`} target="_blank" rel="noreferrer">
              View the signed copy
            </a>
          ) : (
            <span className="nl-terms-done"><Ico name="check" size={14} /> Signed</span>
          )
        ) : null}
      </section>

      {(said ?? sentLine) && <p className={`nl-meta ${unsent.length && !said ? "text-[var(--accent-dark)]" : "text-[var(--sage-ink)]"}`}>{said ?? sentLine}</p>}

      {live && live.status !== "signed" && live.status !== "agent" && (
        <ul className="nl-terms-people">
          {live.parties.map((p) => (
            <li key={p.key}>
              <span className="nl-strong">{p.name}</span>
              <span className="nl-meta">{p.email}{p.emailError ? ` · ${p.emailError}` : ""}</span>
              {p.signedAt ? (
                <Badge tone="good">Signed {day(p.signedAt)}</Badge>
              ) : p.emailError && !p.emailedAt ? (
                <Badge tone="warning">Email didn&apos;t go</Badge>
              ) : p.openedAt ? (
                <Ticks read when={day(p.openedAt)} />
              ) : (
                <Ticks read={false} when={day(p.emailedAt)} />
              )}
              {!p.signedAt && <button type="button" className="nl-link" onClick={() => copy(p)}>{copied === p.key ? "Copied" : "Copy their link"}</button>}
            </li>
          ))}
        </ul>
      )}

      {live && live.status === "agent" && (
        <div className="flex flex-wrap items-center gap-3">
          {!withdrawAsk ? (
            <button type="button" className="nl-link" onClick={() => setWithdrawAsk(true)}>{replacing ? "Drop the adjusted one" : "Withdraw and start again"}</button>
          ) : (
            <span className="nl-confirm m-0 w-full">
              <p>{replacing ? `Drop the adjusted contract? The one sent ${day(replacing.sentAt)} carries on as it was.` : "Withdraw these terms? Their links stop working, and you can send a fresh set straight away."}</p>
              <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setWithdrawAsk(false)}>Keep them</button>
              <button
                type="button"
                className="nl-btn nl-btn--danger nl-btn--sm"
                disabled={busy === "cancel"}
                onClick={async () => {
                  const p = await act(live, { action: "cancel" }, "cancel");
                  setWithdrawAsk(false);
                  setSaid(p ?? (replacing ? "Dropped. The contract that was out carries on." : "Withdrawn. Send a fresh set whenever you're ready."));
                }}
              >
                {busy === "cancel" ? "Withdrawing…" : "Withdraw"}
              </button>
            </span>
          )}
        </div>
      )}

      {(sending || adjusting) && (
        <SendDrawer
          from={adjusting}
          onWithdraw={adjusting ? async () => {
            const p = await act(adjusting, { action: "cancel" }, "cancel");
            if (!p) {
              setAdjusting(null);
              setSaid("Withdrawn. Their links have stopped working. Send a fresh set whenever you're ready.");
            }
            return p;
          } : undefined}
          propertyAddress={propertyAddress}
          listingId={listingId}
          propertyId={propertyId}
          appraisalId={appraisalId}
          landlords={landlords}
          agentLarn={agentLarn}
          serviceOnRecord={serviceOnRecord}
          feesOnRecord={feesOnRecord}
          scottish={scottish}
          editions={editions}
          preview={preview}
          onClose={() => {
            setSending(false);
            setAdjusting(null);
          }}
          onMade={async (t) => {
            setSending(false);
            setAdjusting(null);
            await load();
            setSigning(t);
          }}
        />
      )}

      {signing?.agentEmbedSrc && (
        <TermsSignSheet src={signing.agentEmbedSrc} email={signing.agentEmail} who="Sign your part" onSigned={() => agentDone(signing)} onClose={() => setSigning(null)} />
      )}
    </div>
  );
}

function SendDrawer({
  from = null,
  onWithdraw,
  propertyAddress,
  listingId,
  propertyId,
  appraisalId,
  landlords,
  agentLarn,
  serviceOnRecord,
  feesOnRecord,
  scottish,
  editions,
  preview,
  onClose,
  onMade,
}: {
  /** Adjust contract: the set out now, whose answers the drawer starts from. */
  from?: StaffTerms | null;
  /** Adjust contract: withdraw the set out now without sending another. */
  onWithdraw?: () => Promise<string | null>;
  propertyAddress: string;
  listingId: string | null;
  propertyId: string | null;
  appraisalId: string | null;
  landlords: Array<{ name?: string | null; email?: string | null; phone?: string | null }>;
  agentLarn: string | null;
  serviceOnRecord: string | null;
  feesOnRecord?: { setUpFee?: string | null; managementFee?: string | null } | null;
  scottish: boolean | null;
  editions: Editions;
  preview: boolean;
  onClose: () => void;
  onMade: (t: StaffTerms) => void;
}) {
  /* WHICH TERMS FOLLOWS THE ADDRESS (James, 23 Oct 2026): "If it is in
     Scotland, we'll offer them Scottish terms, and if they're anywhere else in
     the UK, we'll offer the English terms." Scottish by the home's own record,
     or by the postcode in the address as it's typed here; everything else is
     England. The agent can still pick the other one (a border postcode), and
     from then on it stays where they put it. */
  const homeAddress = from?.propertyAddress ?? propertyAddress;
  const [address, setAddress] = useState(homeAddress);
  const byAddress: Country = (address.trim() === propertyAddress.trim() && scottish != null ? scottish : isScottish(address)) ? "scotland" : "england";
  /* Adjusting keeps the country it went on only where the agent had picked against the address. */
  const [chosen, setChosen] = useState<Country | null>(from && from.country !== byAddress ? from.country : null);
  const country: Country = chosen ?? (editions[byAddress] ? byAddress : byAddress === "scotland" ? "england" : "scotland");
  const setCountry = (c: Country) => setChosen(c);
  const known = landlords.filter((l) => l.name || l.email).map((l) => ({ name: l.name ?? "", email: l.email ?? "", phone: l.phone ?? "" }));
  const [people, setPeople] = useState<Person[]>(
    from ? from.parties.map((p) => ({ name: p.name, email: p.email, phone: p.phone ?? "" })) : known.length ? known : [{ name: "", email: "", phone: "" }]
  );
  const start = (from && servicesFor(country).find((o) => o.label === from.values.serviceLevel)) || guessService(country, from?.values.serviceLevel ?? serviceOnRecord);
  const [service, setService] = useState(start.id);
  const [setUpFee, setSetUpFee] = useState(from?.values.setUpFee ?? feesOnRecord?.setUpFee ?? start.setUpFee);
  const [managementFee, setManagementFee] = useState(from?.values.managementFee ?? feesOnRecord?.managementFee ?? start.managementFee);
  const [additional, setAdditional] = useState(from && from.values.additionalFees !== "None" ? from.values.additionalFees : "");
  const [larn, setLarn] = useState(from && from.values.agentLarn !== "Not recorded" ? from.values.agentLarn : agentLarn ?? "");
  const [withdrawAsk, setWithdrawAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  const pickService = (id: string) => {
    const o = servicesFor(country).find((x) => x.id === id);
    setService(id);
    if (o) {
      setSetUpFee(o.setUpFee);
      setManagementFee(o.managementFee);
    }
  };
  const setPerson = (i: number, k: keyof Person, v: string) => setPeople((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const ready = address.trim() && people.length > 0 && people.every((p) => p.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) && setUpFee.trim() && managementFee.trim();

  async function make() {
    setBusy(true);
    setProblem(null);
    const o = servicesFor(country).find((x) => x.id === service);
    const j = await fetch("/api/terms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country, listingId, propertyId, appraisalId, propertyAddress: address, agentLarn: larn, serviceLevel: o?.label ?? service, setUpFee, managementFee, additionalFees: additional, people, replaces: from?.id ?? null }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    if (!j?.ok) return setProblem(j?.error ?? "The terms couldn't be made. Try again in a moment.");
    onMade({ ...j.terms, agentEmbedSrc: j.agentEmbedSrc });
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-look="new" className="nl-drawer-wrap" role="dialog" aria-modal="true" aria-label={from ? "Adjust Contract" : "Send Terms of Business"}>
      <button type="button" className="nl-drawer-scrim" aria-label="Close" onClick={() => !busy && onClose()} />
      <div className="nl-drawer">
        <div className="nl-drawer-head">
          <div className="min-w-0 flex-1">
            <h2 className="nl-drawer-title">{from ? "Adjust Contract" : "Send Terms of Business"}</h2>
            <p className="nl-meta mt-1">
              {from
                ? `Change what you need, then sign the new one. It goes to everyone with a fresh link, and the contract sent ${day(from.sentAt)} is withdrawn at the same moment.`
                : "You sign first, then each person gets their own link from your mailbox. Anything we don't have about them, they fill in before they sign."}
            </p>
          </div>
          <button type="button" className="nl-iconbtn nl-iconbtn--sm" aria-label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="nl-drawer-body">
          <div className="nl-field">
            <span>Which terms</span>
            <small>{chosen ? "You picked these." : byAddress === "scotland" ? "Scotland, from the property's address." : "England, from the property's address. Anywhere outside Scotland gets the England terms."}</small>
            <div className="nl-choice-row">
              <button type="button" className={`nl-choice${country === "scotland" ? " is-on" : ""}`} onClick={() => setCountry("scotland")} disabled={!editions.scotland}>
                <span className="font-medium">Scotland</span>
                <small>{editions.scotland ? `${editions.scotland} wording` : "Not in the OS yet"}</small>
              </button>
              <button type="button" className={`nl-choice${country === "england" ? " is-on" : ""}${editions.england ? "" : " opacity-60"}`} onClick={() => editions.england && setCountry("england")} aria-disabled={!editions.england}>
                <span className="font-medium">England</span>
                <small>{editions.england ? `${editions.england} wording` : "Not in the OS yet"}</small>
              </button>
            </div>
          </div>

          <label className="nl-field">
            <span>The property</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>

          <div className="nl-field">
            <span>Who signs</span>
            <div className="flex flex-col gap-3">
              {people.map((p, i) => (
                <div key={i} className="nl-person-row">
                  <label className="nl-field"><small>Name</small><input value={p.name} onChange={(e) => setPerson(i, "name", e.target.value)} placeholder="Full name" /></label>
                  <label className="nl-field"><small>Email</small><input type="email" value={p.email} onChange={(e) => setPerson(i, "email", e.target.value)} placeholder="name@example.com" /></label>
                  <label className="nl-field"><small>Mobile</small><input type="tel" value={p.phone} onChange={(e) => setPerson(i, "phone", e.target.value)} placeholder="Optional" /></label>
                  {people.length > 1 ? (
                    <button type="button" className="nl-link mb-3" onClick={() => setPeople((ps) => ps.filter((_, j) => j !== i))}>Remove</button>
                  ) : <span />}
                </div>
              ))}
            </div>
            <button type="button" className="nl-link mt-1 self-start" onClick={() => setPeople((ps) => [...ps, { name: "", email: "", phone: "" }])}>
              <Ico name="plus" size={14} /> Add another person
            </button>
            <small>Everyone who owns the home signs, each from their own link.</small>
          </div>

          <div className="nl-field">
            <span>Service and fees</span>
            <span className="nl-fsel is-set self-start">
              <select value={service} onChange={(e) => pickService(e.target.value)} aria-label="Service">
                {servicesFor(country).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </span>
          </div>
          <div className="nl-form-row">
            <label className="nl-field"><span>Set-up / tenant find fee</span><input value={setUpFee} onChange={(e) => setSetUpFee(e.target.value)} /></label>
            <label className="nl-field"><span>Management / rent collection fee</span><input value={managementFee} onChange={(e) => setManagementFee(e.target.value)} placeholder="e.g. 10% + VAT of the rent each month" /></label>
          </div>
          <label className="nl-field">
            <span>Additional fees agreed</span>
            <input value={additional} onChange={(e) => setAdditional(e.target.value)} placeholder="None" />
          </label>
          {country === "scotland" && (
            <label className="nl-field">
              <span>Your letting agent registration number (LARN)</span>
              <input value={larn} onChange={(e) => setLarn(e.target.value)} placeholder="LARN1234567" />
              <small>Printed in clause 1 beside The Letting Experts&apos; own.</small>
            </label>
          )}
          {preview && <p className="nl-meta">This machine isn&apos;t connected to DocuSeal, so signing here is a preview: a typed name, and nothing is filed.</p>}
          {problem && <p className="nl-meta text-[var(--accent-dark)]">{problem}</p>}
        </div>
        <div className="nl-drawer-foot">
          {from && onWithdraw && (
            withdrawAsk ? (
              <span className="nl-confirm m-0 mr-auto">
                <p>Withdraw it without sending a new one? Their links stop working.</p>
                <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setWithdrawAsk(false)} disabled={busy}>Keep it</button>
                <button
                  type="button"
                  className="nl-btn nl-btn--danger nl-btn--sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const p = await onWithdraw();
                    setBusy(false);
                    if (p) setProblem(p);
                  }}
                >
                  {busy ? "Withdrawing…" : "Withdraw"}
                </button>
              </span>
            ) : (
              <button type="button" className="nl-link mr-auto" onClick={() => setWithdrawAsk(true)} disabled={busy}>Withdraw without a new one</button>
            )
          )}
          <button type="button" className="nl-btn nl-btn--quiet" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="nl-btn nl-btn--primary" disabled={!ready || busy} onClick={() => void make()}>
            {busy ? "Making the contract…" : from ? "Sign and reissue" : "Sign and send"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
