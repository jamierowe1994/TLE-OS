"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AddressField, { type ResolvedAddress } from "@/components/AddressField";
import DoodleIcon from "@/components/DoodleIcon";
import ViewingBooker, { type BookedResult } from "@/components/ViewingBooker";
import { LEAD_SOURCES } from "@/lib/leads-sample";
import { fetchMe } from "@/lib/me";
import { EMPTY_PROPERTY } from "@/lib/lead-facts-shape";
import { PROPERTY_TYPES } from "@/lib/agent-property-facts";
import type { PreOnBooking } from "@/lib/pre-send-time";

/**
 * Book an Appraisal, from the Market Appraisals screen (James, 6 Oct 2026).
 *
 * The old button took a name and an address and made an appraisal with no
 * contact behind it: no email, no mobile, so no confirmation, no
 * pre-appraisal deck in anyone's inbox, and nothing on Leads. Rhiannon booked
 * 79A Torquay Road that way and then again from a lead, and it existed twice.
 *
 * Now it is three screens and the result is the same as booking from a lead,
 * because it IS a lead:
 *
 *   1. The landlord   - name, mobile, email, another number, where they came from
 *   2. The property   - the address (looked up), type, bedrooms, bathrooms,
 *                       where things stand, what they want, anything to know
 *   3. The time       - the same diary and confirmation the lead drawer uses
 *
 * Nothing is saved until the end of screen 2, and nothing can be skipped: each
 * screen's button stays put until its required answers are in, and says which
 * are missing. The property facts the lookup finds are filled in for the agent
 * but must be confirmed - a two-bed flat on file was a six-bed HMO in real life.
 *
 * It checks the OS's own book and the office records for the same person as
 * the agent types, so a landlord who is already a lead is booked from that
 * lead instead of becoming a second one.
 */

type Step = 1 | 2 | "saved";

type OsMatch = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  address: string;
  kind: string;
  by: "email" | "mobile";
  appraisal: { id: string; at: string | null } | null;
};

type OfficeMatch = { id: string; name: string; email: string | null; mobile: string | null; address: string | null; score: number };

const SITUATIONS = ["Empty now", "Tenanted", "Landlord lives there", "Being done up", "Not sure yet"];
const WANTS = ["Fully managed", "Rent collection", "Tenant find only", "Not sure yet"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;

/** A UK mobile (07…, +447…, 00447…) or a number from abroad (+ and 8-15 digits). */
function mobileOk(v: string): boolean {
  const t = v.trim();
  const d = t.replace(/\D/g, "");
  if (/^07\d{9}$/.test(d)) return true;
  if (/^447\d{9}$/.test(d) && /^\+|^44|^00/.test(t.replace(/\s/g, ""))) return true;
  if (/^00447\d{9}$/.test(d)) return true;
  if (t.startsWith("+") && !t.startsWith("+44") && d.length >= 8 && d.length <= 15) return true;
  return false;
}

function postcodeIn(text: string): string {
  const m = text.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i) ?? text.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
  return m ? m[1].toUpperCase().replace(/\s*(\d[A-Z]{2})$/i, " $1") : "";
}

const whenLabel = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" })
    : "with no time set";

export default function BookAppraisalWizard({
  onClose,
  onFinished,
}: {
  onClose: () => void;
  /** Something was saved (a lead, and maybe an appraisal) - re-read the board. */
  onFinished: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [tried, setTried] = useState<{ 1: boolean; 2: boolean }>({ 1: false, 2: false });

  /* ── 1. the landlord ── */
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [other, setOther] = useState("");
  const [source, setSource] = useState("");

  /* ── 2. the property ── */
  const [address, setAddress] = useState("");
  const [resolved, setResolved] = useState<ResolvedAddress | null>(null);
  const [postcode, setPostcode] = useState("");
  const [type, setType] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [situation, setSituation] = useState("");
  const [wants, setWants] = useState("");
  const [notes, setNotes] = useState("");
  /* What the lookup said, so the agent can see it was a lookup and confirm it. */
  const [lookup, setLookup] = useState<{ busy: boolean; found: { type: string | null; beds: number | null; baths: number | null } | null }>({ busy: false, found: null });
  const [checked, setChecked] = useState(false);

  /* ── matches ── */
  const [osMatches, setOsMatches] = useState<OsMatch[]>([]);
  const [office, setOffice] = useState<OfficeMatch | null>(null);
  const [officeAnswer, setOfficeAnswer] = useState<"yes" | "no" | null>(null);
  const [different, setDifferent] = useState(false);

  /* ── saving and booking ── */
  const [me, setMe] = useState<{ name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMe()
      .then((j) => setMe({ name: (j?.user?.name ?? "").trim() }))
      .catch(() => setMe({ name: "" }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !booking && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, booking]);

  /* Braces, not an arrow's value: newer Chrome returns a promise from
     scrollTo, and React reads an effect's return as its clean-up. */
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [step]);

  /* Already on the OS? Asked as the email and mobile are typed. */
  useEffect(() => {
    const e = EMAIL.test(email.trim()) ? email.trim() : "";
    const m = mobile.replace(/\D/g, "").length >= 10 ? mobile.trim() : "";
    if (!e && !m) {
      setOsMatches([]);
      return;
    }
    const t = window.setTimeout(() => {
      fetch(`/api/contacts/existing?email=${encodeURIComponent(e)}&mobile=${encodeURIComponent(m)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { matches?: OsMatch[] }) => setOsMatches(Array.isArray(j.matches) ? j.matches.filter((x) => x.kind === "landlord") : []))
        .catch(() => setOsMatches([]));
    }, 450);
    return () => window.clearTimeout(t);
  }, [email, mobile]);

  /* In the office records already? Then the new lead is linked to that
     record rather than making a second one there. */
  useEffect(() => {
    const e = EMAIL.test(email.trim()) ? email.trim() : "";
    const m = mobile.replace(/\D/g, "").length >= 10 ? mobile.trim() : "";
    if (!e && !m) {
      setOffice(null);
      return;
    }
    const t = window.setTimeout(() => {
      fetch("/api/contacts/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email: e, mobile: m }),
      })
        .then((r) => r.json())
        .then((j: { matches?: OfficeMatch[] }) => {
          const best = (j.matches ?? []).filter((x) => x.score >= 75)[0] ?? null;
          setOffice((cur) => {
            if (cur?.id !== best?.id) setOfficeAnswer(null);
            return best;
          });
        })
        .catch(() => setOffice(null));
    }, 650);
    return () => window.clearTimeout(t);
  }, [name, email, mobile]);

  const osMatch = osMatches[0] ?? null;

  /* ── what each screen still needs ── */
  const need1 = useMemo(() => {
    const n: Record<string, string> = {};
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!name.trim()) n.name = "Their name";
    else if (words.length < 2) n.name = "Their full name, first and last";
    if (!mobile.trim()) n.mobile = "A mobile number";
    else if (!mobileOk(mobile)) n.mobile = "That doesn't look like a mobile number";
    if (!email.trim()) n.email = "An email address";
    else if (!EMAIL.test(email.trim())) n.email = "That doesn't look like an email address";
    if (!source) n.source = "Where they came from";
    if (osMatch && !different) n.match = "Decide about the landlord already on the system";
    if (office && officeAnswer === null) n.office = "Say whether this is the same person";
    return n;
  }, [name, mobile, email, source, osMatch, different, office, officeAnswer]);

  const lookedUp = Boolean(lookup.found && (lookup.found.type || lookup.found.beds != null || lookup.found.baths != null));
  const need2 = useMemo(() => {
    const n: Record<string, string> = {};
    if (!address.trim()) n.address = "The property's address";
    if (!postcode.trim()) n.postcode = "The postcode";
    else if (!POSTCODE.test(postcode.trim())) n.postcode = "That doesn't look like a postcode";
    if (!type) n.type = "What type of property it is";
    const b = Number(beds);
    if (beds === "") n.beds = "How many bedrooms";
    else if (!Number.isInteger(b) || b < 0 || b > 30) n.beds = "Bedrooms as a number";
    else if (b === 0 && type !== "Studio") n.beds = "Bedrooms - 0 only for a studio";
    const ba = Number(baths);
    if (baths === "") n.baths = "How many bathrooms";
    else if (!Number.isInteger(ba) || ba < 1 || ba > 20) n.baths = "Bathrooms as a number, at least 1";
    if (!situation) n.situation = "Where things stand at the property";
    if (lookedUp && !checked) n.checked = "Confirm the details with the landlord";
    return n;
  }, [address, postcode, type, beds, baths, situation, lookedUp, checked]);

  const show1 = tried[1];
  const show2 = tried[2];

  function next1() {
    setTried((t) => ({ ...t, 1: true }));
    if (Object.keys(need1).length) return;
    setStep(2);
  }

  /* The address picked from the list: read the property and fill in what is
     known. Pre-filled, never final - see the tick below the facts. */
  async function resolvedAddress(a: ResolvedAddress) {
    setResolved(a);
    const pc = a.postcode ?? postcodeIn(a.address);
    if (pc) setPostcode(pc);
    if (!pc) return;
    setLookup({ busy: true, found: null });
    setChecked(false);
    try {
      const r = await fetch(`/api/dossier?address=${encodeURIComponent(a.address)}&postcode=${encodeURIComponent(pc)}`, { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; propertyType?: string; beds?: number; baths?: number };
      if (!j.ok) {
        setLookup({ busy: false, found: null });
        return;
      }
      const found = { type: j.propertyType ?? null, beds: j.beds ?? null, baths: j.baths ?? null };
      setLookup({ busy: false, found });
      if (found.type && !type) setType(found.type);
      if (found.beds != null && beds === "") setBeds(String(found.beds));
      if (found.baths != null && baths === "") setBaths(String(found.baths));
    } catch {
      setLookup({ busy: false, found: null });
    }
  }

  const typeOptions = useMemo(
    () => [...new Set([...(type && !PROPERTY_TYPES.includes(type) ? [type] : []), ...PROPERTY_TYPES])],
    [type]
  );

  /** Everything the agent was told that has no field of its own, kept on the lead. */
  function leadNotes(): string {
    return [
      "Booked from Market Appraisals.",
      `Where things stand: ${situation}.`,
      wants ? `Looking for: ${wants}.` : null,
      other.trim() ? `Other number: ${other.trim()}.` : null,
      notes.trim() ? `Notes: ${notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function save() {
    setTried((t) => ({ ...t, 2: true }));
    if (Object.keys(need2).length || saving) return;
    if (savedId) {
      setBooking(true);
      return;
    }
    setSaving(true);
    setError(null);
    const pc = postcode.trim().toUpperCase().replace(/\s*(\d[A-Z]{2})$/i, " $1");
    const addr = address.trim();
    try {
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "landlord",
          name: name.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
          address: addr,
          postcode: pc,
          source,
          enquiry: "Landlord",
          notes: leadNotes(),
          rexId: office && officeAnswer === "yes" ? office.id : null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { contact?: { id?: string }; error?: string };
      const id = j.contact?.id;
      if (!id) throw new Error(j.error ?? "The landlord did not save.");
      const leadId = `os-${id}`;
      const facts = { type, beds: Number(beds), baths: Number(baths) };
      /* The property, on the lead (its Properties card) and for the deck
         builder, which uses the agent's word over the lookup's. Neither may
         cost the booking: the lead exists, and the builder can be corrected. */
      await Promise.all([
        fetch(`/api/leads/${encodeURIComponent(leadId)}/facts`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            property: {
              ...EMPTY_PROPERTY,
              ...facts,
              address: addr,
              postcode: pc,
              lat: resolved?.lat ?? null,
              lng: resolved?.lng ?? null,
              matched: resolved ? "pin" : null,
            },
          }),
        }).catch(() => null),
        fetch("/api/case-state", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "appraisal-facts", id: leadId, payload: { ...facts, ignoreLookup: false }, by: me?.name ?? "" }),
        }).catch(() => null),
      ]);
      setSavedId(id);
      onFinished();
      setBooking(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The landlord did not save.");
    } finally {
      setSaving(false);
    }
  }

  /* The booker's own save, the same as the lead drawer's (LeadDrawer
     onBooked): the appraisal, then the confirmation if the agent left it on. */
  async function onBooked(v: {
    startsAt: string | null;
    minutes: number;
    confirmation?: { send: boolean; subject?: string; html?: string; again?: boolean };
  }): Promise<BookedResult> {
    const leadId = `os-${savedId}`;
    const said: string[] = [];
    const res = await fetch("/api/appraisals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId,
        landlord: name.trim(),
        address: address.trim(),
        postcode: postcode.trim(),
        agent: me?.name || null,
        appointmentAt: v.startsAt,
      }),
    })
      .then((r) => r.json() as Promise<{ appraisal?: { id?: string }; outlook?: { ok?: boolean; detail?: string }; pre?: PreOnBooking | null; error?: string }>)
      .catch(() => null);
    const id = res?.appraisal?.id;
    if (!id) return { said: `The appraisal did not save: ${res?.error ?? "the connection dropped"}. Try again.` };
    setBooked(id);
    said.push(res?.outlook?.ok ? "In your Outlook calendar." : (res?.outlook?.detail ?? "Booked."));
    if (v.confirmation?.send) {
      const c = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", kind: "appraisal", id, subject: v.confirmation.subject, html: v.confirmation.html, again: v.confirmation.again, minutes: v.minutes }),
      })
        .then((r) => r.json() as Promise<{ sent?: boolean; detail?: string; error?: string }>)
        .catch(() => null);
      said.push(c?.sent ? `Confirmation sent. ${c.detail ?? ""}`.trim() : `The confirmation did not send: ${c?.detail ?? c?.error ?? "the connection dropped"}. Send it from the appraisal.`);
    } else {
      said.push("No confirmation sent. Send it from the appraisal when you are ready.");
    }
    onFinished();
    return {
      said: said.join(" "),
      goTo: { ask: "The appraisal is on the board. Open its file now?", label: "Open the appraisal", href: `/market-appraisals/${encodeURIComponent(id)}`, stay: "Back to the board" },
      pre: res?.pre ?? null,
    };
  }

  const field = "w-full rounded-xl border bg-white px-3 py-2.5 text-[13.5px] outline-none transition focus:border-black/30";
  const edge = (bad: boolean) => (bad ? "border-[#c9675f]" : "border-line");
  const Err = ({ k, of, on }: { k: string; of: Record<string, string>; on: boolean }) =>
    on && of[k] ? <span className="mt-1 block text-[11.5px] text-[#9d4340]">{of[k]}</span> : null;
  const Label = ({ children, opt }: { children: React.ReactNode; opt?: boolean }) => (
    <span className="text-[12px] font-semibold">
      {children}
      {opt ? <span className="ml-1 font-normal text-muted">(optional)</span> : <span className="ml-0.5 text-accent-dark">*</span>}
    </span>
  );
  const Chips = ({ options, value, onPick, bad }: { options: string[]; value: string; onPick: (v: string) => void; bad?: boolean }) => (
    <div className={`mt-1.5 flex flex-wrap gap-1.5 rounded-xl ${bad ? "ring-1 ring-[#c9675f] ring-offset-2" : ""}`}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(value === o ? "" : o)}
          aria-pressed={value === o}
          className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${value === o ? "border-accent-dark bg-accent-dark text-white" : "border-line bg-white hover:border-ink/40"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );

  const steps = [
    { n: 1, label: "The Landlord" },
    { n: 2, label: "The Property" },
    { n: 3, label: "The Time" },
  ];
  const at = step === 1 ? 1 : step === 2 ? 2 : 3;
  const missing1 = Object.keys(need1).length;
  const missing2 = Object.keys(need2).length;

  return (
    <>
      {!booking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b201d]/45 p-3 sm:p-6" onClick={savedId ? undefined : onClose}>
          <div
            className="drawer-in flex max-h-[94vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[26px] bg-page shadow-[0_30px_80px_-30px_rgba(40,25,20,0.6)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Book an Appraisal"
          >
            <div className="border-b border-line/60 px-5 pb-4 pt-5 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                  <DoodleIcon name="calendar" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-dark">Market appraisals</p>
                  <h2 className="text-[22px] font-normal leading-tight tracking-normal">Book an Appraisal</h2>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <ol className="mt-4 grid grid-cols-3 gap-2">
                {steps.map((s) => (
                  <li key={s.n} className="min-w-0">
                    <span className={`block h-1 rounded-full ${s.n <= at ? "bg-accent-dark" : "bg-line"}`} />
                    <span className={`mt-1.5 block truncate text-[11.5px] ${s.n === at ? "font-semibold text-ink" : "text-muted"}`}>
                      {s.n}. {s.label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div ref={body} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
              {step === 1 && (
                <>
                  <p className="text-[12.5px] leading-relaxed text-muted">
                    Who the appraisal is for. They become a landlord lead, so their confirmation, their pre-appraisal deck and every
                    message after reach them.
                  </p>
                  <label className="block">
                    <Label>Full name</Label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="off" className={`mt-1.5 ${field} ${edge(show1 && !!need1.name)}`} autoFocus />
                    <Err k="name" of={need1} on={show1} />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <Label>Mobile</Label>
                      <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="07…" inputMode="tel" autoComplete="off" className={`mt-1.5 ${field} ${edge(show1 && !!need1.mobile)}`} />
                      <Err k="mobile" of={need1} on={show1} />
                    </label>
                    <label className="block">
                      <Label opt>Other number</Label>
                      <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Home or work" inputMode="tel" autoComplete="off" className={`mt-1.5 ${field} border-line`} />
                    </label>
                  </div>
                  <label className="block">
                    <Label>Email</Label>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Where the confirmation goes" inputMode="email" autoComplete="off" className={`mt-1.5 ${field} ${edge(show1 && !!need1.email)}`} />
                    <Err k="email" of={need1} on={show1} />
                  </label>
                  <label className="block">
                    <Label>Where did they come from?</Label>
                    <select value={source} onChange={(e) => setSource(e.target.value)} className={`mt-1.5 ${field} ${edge(show1 && !!need1.source)}`}>
                      <option value="">Choose one</option>
                      {LEAD_SOURCES.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <Err k="source" of={need1} on={show1} />
                  </label>

                  {osMatch && !different && (
                    <div className={`rounded-2xl border bg-accent-soft/40 p-4 ${show1 ? "border-[#c9675f]" : "border-accent-dark/40"}`}>
                      <p className="text-[13px] font-semibold">
                        {osMatch.name} is already a landlord on the system
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted">
                        Same {osMatch.by === "email" ? "email" : "mobile"}. {osMatch.address ? `${osMatch.address}. ` : ""}
                        {osMatch.appraisal
                          ? `They already have an appraisal, ${whenLabel(osMatch.appraisal.at)}.`
                          : "They have no appraisal yet - book it from their lead so it stays one record."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {osMatch.appraisal ? (
                          <button type="button" onClick={() => router.push(`/market-appraisals/${osMatch.appraisal!.id}`)} className="rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-white">
                            Open their appraisal
                          </button>
                        ) : (
                          <button type="button" onClick={() => router.push(`/leads?open=os-${osMatch.id}&side=landlord&book=appraisal`)} className="rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-white">
                            Book from their lead
                          </button>
                        )}
                        <button type="button" onClick={() => setDifferent(true)} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12px] font-semibold">
                          This is a different property
                        </button>
                      </div>
                    </div>
                  )}

                  {office && (!osMatch || different) && (
                    <div className={`rounded-2xl border p-4 ${show1 && officeAnswer === null ? "border-[#c9675f]" : "border-line/80"}`}>
                      <p className="text-[13px] font-semibold">Already in the office records - is this them?</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted">
                        {[office.name, office.email, office.mobile, office.address].filter(Boolean).join(" · ")}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(["yes", "no"] as const).map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setOfficeAnswer(a)}
                            aria-pressed={officeAnswer === a}
                            className={`rounded-full border px-4 py-2 text-[12px] font-semibold ${officeAnswer === a ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 bg-white"}`}
                          >
                            {a === "yes" ? "Yes, that's them" : "No, someone else"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <p className="text-[12.5px] leading-relaxed text-muted">
                    The home being appraised. Pick the address from the list and we&apos;ll read what is on record - then check it
                    with {name.trim().split(/\s+/)[0] || "the landlord"}, because records can be out of date.
                  </p>
                  <div>
                    <Label>Address</Label>
                    <div className={`mt-1.5 rounded-xl ${show2 && need2.address ? "ring-1 ring-[#c9675f]" : ""}`}>
                      <AddressField
                        value={address}
                        onChange={(v) => {
                          setAddress(v);
                          if (resolved && v !== resolved.address) setResolved(null);
                        }}
                        onResolved={(a) => void resolvedAddress(a)}
                      />
                    </div>
                    <Err k="address" of={need2} on={show2} />
                  </div>
                  <label className="block sm:max-w-[200px]">
                    <Label>Postcode</Label>
                    <input value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} placeholder="TQ3 2SE" autoComplete="off" className={`mt-1.5 ${field} ${edge(show2 && !!need2.postcode)}`} />
                    <Err k="postcode" of={need2} on={show2} />
                  </label>

                  {lookup.busy && (
                    <p className="flex items-center gap-2 text-[12px] text-muted">
                      <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                      Reading the property&apos;s records…
                    </p>
                  )}

                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="block">
                      <Label>Property type</Label>
                      <select value={type} onChange={(e) => { setType(e.target.value); setChecked(false); }} className={`mt-1.5 ${field} ${edge(show2 && !!need2.type)}`}>
                        <option value="">Choose one</option>
                        {typeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <Err k="type" of={need2} on={show2} />
                    </label>
                    <label className="block">
                      <Label>Bedrooms</Label>
                      <input type="number" min={0} max={30} inputMode="numeric" value={beds} onChange={(e) => { setBeds(e.target.value); setChecked(false); }} className={`mt-1.5 ${field} ${edge(show2 && !!need2.beds)}`} />
                      <Err k="beds" of={need2} on={show2} />
                    </label>
                    <label className="block">
                      <Label>Bathrooms</Label>
                      <input type="number" min={1} max={20} inputMode="numeric" value={baths} onChange={(e) => { setBaths(e.target.value); setChecked(false); }} className={`mt-1.5 ${field} ${edge(show2 && !!need2.baths)}`} />
                      <Err k="baths" of={need2} on={show2} />
                    </label>
                  </div>

                  {lookedUp && (
                    <label className={`flex items-start gap-2.5 rounded-xl border p-3 text-[12.5px] leading-relaxed ${show2 && need2.checked ? "border-[#c9675f]" : "border-line/80"}`}>
                      <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
                      <span>
                        <span className="font-semibold">I&apos;ve checked these with the landlord.</span>{" "}
                        <span className="text-muted">
                          The records say{" "}
                          {[lookup.found?.type, lookup.found?.beds != null ? `${lookup.found.beds} bedrooms` : null, lookup.found?.baths != null ? `${lookup.found.baths} bathrooms` : null]
                            .filter(Boolean)
                            .join(", ")}
                          . Change anything that is wrong - the deck and the comparables use what is here.
                        </span>
                      </span>
                    </label>
                  )}

                  <div>
                    <Label>Where things stand</Label>
                    <Chips options={SITUATIONS} value={situation} onPick={setSituation} bad={show2 && !!need2.situation} />
                    <Err k="situation" of={need2} on={show2} />
                  </div>
                  <div>
                    <Label opt>What they&apos;re looking for</Label>
                    <Chips options={WANTS} value={wants} onPick={setWants} />
                  </div>
                  <label className="block">
                    <Label opt>Anything the agent should know</Label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Access, parking, why they're thinking of moving agent, the rent they have in mind…"
                      className={`mt-1.5 ${field} border-line resize-none`}
                    />
                  </label>
                </>
              )}

              {step === "saved" && (
                <div className="space-y-3">
                  <p className="text-[14px] font-semibold">{name.trim()} is saved as a lead, with the property.</p>
                  <p className="text-[12.5px] leading-relaxed text-muted">
                    The appraisal is not booked yet. Choose a time now, or book it later from their lead.
                  </p>
                </div>
              )}

              {error ? <p className="rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12.5px] text-[#9d4340]">{error}</p> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line/60 py-4 pl-5 pr-20 sm:px-6">
              {step === 1 && (
                <>
                  <button type="button" onClick={next1} className="btn-press rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white">
                    Next: The Property →
                  </button>
                  <button type="button" onClick={onClose} className="rounded-full border border-line/80 bg-card px-4 py-2.5 text-[12.5px] font-semibold">
                    Cancel
                  </button>
                  {show1 && missing1 > 0 && (
                    <span className="text-[11.5px] text-[#9d4340]">
                      {missing1} {missing1 === 1 ? "thing" : "things"} still needed
                    </span>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <button type="button" onClick={() => void save()} disabled={saving} className="btn-press rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
                    {saving ? "Saving…" : "Save and Choose a Time →"}
                  </button>
                  <button type="button" onClick={() => setStep(1)} disabled={saving} className="rounded-full border border-line/80 bg-card px-4 py-2.5 text-[12.5px] font-semibold">
                    ← Back
                  </button>
                  {show2 && missing2 > 0 && (
                    <span className="text-[11.5px] text-[#9d4340]">
                      {missing2} {missing2 === 1 ? "thing" : "things"} still needed
                    </span>
                  )}
                </>
              )}
              {step === "saved" && savedId && (
                <>
                  <button type="button" onClick={() => setBooking(true)} className="btn-press rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white">
                    Choose a Time
                  </button>
                  <button type="button" onClick={() => router.push(`/leads?open=os-${savedId}&side=landlord`)} className="rounded-full border border-line/80 bg-card px-4 py-2.5 text-[12.5px] font-semibold">
                    Open the lead
                  </button>
                  <button type="button" onClick={onClose} className="rounded-full border border-line/80 bg-card px-4 py-2.5 text-[12.5px] font-semibold">
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {savedId && (
        <ViewingBooker
          open={booking}
          onClose={() => {
            setBooking(false);
            if (booked) onClose();
            else setStep("saved");
          }}
          mode="appraisal"
          address={[address.trim(), postcode.trim()].filter((x) => x && !address.includes(x)).join(", ")}
          origin={resolved?.lat != null && resolved?.lng != null ? { lat: resolved.lat, lng: resolved.lng } : null}
          lead={{ name: name.trim(), email: email.trim(), phone: mobile.trim() }}
          properties={[]}
          leadId={`os-${savedId}`}
          agent={me?.name ?? ""}
          onBooked={onBooked}
        />
      )}
    </>
  );
}
