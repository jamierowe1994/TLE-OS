"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import SignInAgain from "@/components/SignInAgain";
import SignModal from "@/components/landlord/SignModal";
import { AGENT_SIGNING } from "@/lib/signing-steps";
import { fiveWeeks, money } from "@/components/listing/listing-draft";
import { LEAD_SOURCES } from "@/lib/leads-sample";
import { isScottish } from "@/lib/property-flags";

/**
 * NEW LISTING, IN FIVE SCREENS (James, 12 Oct 2026).
 *
 * "We can create a listing, but we can't attach [a landlord]. We always need
 * a landlord attached to a property ... When they click a new listing, it
 * should say 1 out of whatever ... They skip the leads part, but then they
 * still need to fill in the information ... they're still going to need to
 * sign the terms of business as an absolute minimum."
 *
 *   1. The Home      - the address, found in REX or typed new, and checked
 *                      against the files the OS already has for it
 *   2. The Landlord  - required; matched to the office records, never a
 *                      second copy of somebody we know
 *   3. The Let       - rent, deposit, service and the fees (no let type:
 *                      with Section 21 gone there is no choice to make)
 *   4. Check         - everything on one screen, then Create
 *   5. Terms         - the contract drawn up from all that, the agent signs
 *                      their half, and Send - which they press, nothing
 *                      goes on its own
 *
 * Creating saves the landlord through the same POST /api/contacts every
 * landlord goes through, then app/api/listings/new makes the home, the
 * listing (landlord on it) and the file behind it.
 */

type Found = { id: string; address: string };
type Option = { id: string; label: string };
type OsFile = { id: string; address: string; landlord: string; stage: string };
type OfficeMatch = { id: string; name: string; email: string | null; mobile: string | null; address: string | null; score: number };
type Party = { role: "agent" | "landlord"; embedSrc: string; sentAt: string | null; completedAt: string | null };
type Created = { listingId: string; propertyId: string; appraisalId: string | null; owner: { state: string; detail?: string } | null; fileNote: string | null };

const SERVICES = [
  { id: "full_managed", label: "Fully managed" },
  { id: "tenant_find", label: "Tenant find" },
  { id: "rent_collect", label: "Rent collect" },
] as const;
const STEPS = ["The Home", "The Landlord", "The Let", "Check", "Terms"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const STAGE_WORDS: Record<string, string> = { booked: "appraisal booked", pre_appraisal: "pre-appraisal", appraisal: "appraisal", post_appraisal: "terms out", takeon: "take-on", aml: "AML", won: "won" };

const field = "w-full rounded-xl border bg-white px-3 py-2.5 text-[13.5px] outline-none transition focus:border-black/30";
const edge = (bad: boolean) => (bad ? "border-[#c9675f]" : "border-line");

export default function NewListingWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (listingId: string) => void }) {
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const body = useRef<HTMLDivElement>(null);

  /* 1. The home */
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [files, setFiles] = useState<OsFile[]>([]);
  const [looking, setLooking] = useState(false);
  const [picked, setPicked] = useState<Found | null>(null);
  const [pickedListing, setPickedListing] = useState<string | null>(null);
  const [pickedFiles, setPickedFiles] = useState<OsFile[]>([]);
  const [fresh, setFresh] = useState<{ streetNumber: string; streetName: string; town: string; postcode: string; propertyTypeId: string } | null>(null);
  const [types, setTypes] = useState<Option[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<Option[]>([]);
  const [typeId, setTypeId] = useState("");

  /* 2. The landlord */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [source, setSource] = useState("");
  const [landlordAddress, setLandlordAddress] = useState("");
  const [larn, setLarn] = useState("");
  const [office, setOffice] = useState<OfficeMatch | null>(null);
  const [officeAnswer, setOfficeAnswer] = useState<"yes" | "no" | null>(null);

  /* 3. The let */
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [depositByHand, setDepositByHand] = useState(false);
  const [availableFrom, setAvailableFrom] = useState("");
  const [service, setService] = useState("");
  const [feePct, setFeePct] = useState("");
  const [setupFee, setSetupFee] = useState("");

  /* 4-5. Made, and the terms */
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [existing, setExisting] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [made, setMade] = useState<Created | null>(null);
  const [parties, setParties] = useState<Party[] | null>(null);
  const [sendUnlocked, setSendUnlocked] = useState<boolean | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "sign" | "send">(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !signing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, signing]);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    fetch("/api/listings/create?lists=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; types?: Option[]; propertyTypes?: Option[] }) => {
        if (!j.ok) return;
        setTypes(j.types ?? []);
        setPropertyTypes(j.propertyTypes ?? []);
      })
      .catch(() => {});
  }, []);

  /* The address: REX's records and the OS's own files, a beat after typing stops. */
  useEffect(() => {
    if (picked || fresh) return;
    const q = query.trim();
    if (q.length < 3) {
      setFound(null);
      setFiles([]);
      return;
    }
    setLooking(true);
    const t = setTimeout(() => {
      Promise.all([
        fetch(`/api/listings/create?q=${encodeURIComponent(q)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/listings/new?q=${encodeURIComponent(q)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ])
        .then(([a, b]: [{ ok?: boolean; addresses?: Found[] }, { files?: OsFile[] }]) => {
          setFound(a.ok ? (a.addresses ?? []) : []);
          setFiles(b.files ?? []);
        })
        .finally(() => setLooking(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query, picked, fresh]);

  /* A home picked: is it already on Listings, or already somebody's file? */
  useEffect(() => {
    setPickedListing(null);
    setPickedFiles([]);
    if (!picked) return;
    fetch(`/api/listings/new?property=${encodeURIComponent(picked.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { listingId?: string | null; files?: OsFile[] }) => {
        setPickedListing(j.listingId ?? null);
        setPickedFiles(j.files ?? []);
      })
      .catch(() => {});
  }, [picked]);

  /* The landlord in the office records already? Then the listing carries on
     that record rather than making a second one. */
  useEffect(() => {
    const e = EMAIL.test(email.trim()) ? email.trim() : "";
    const m = mobile.replace(/\D/g, "").length >= 10 ? mobile.trim() : "";
    if (!e && !m) {
      setOffice(null);
      return;
    }
    const t = window.setTimeout(() => {
      fetch("/api/contacts/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email: e, mobile: m }) })
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

  const suggested = fiveWeeks(Number(rent) || null);
  useEffect(() => {
    if (!depositByHand) setDeposit(suggested == null ? "" : String(suggested));
  }, [suggested, depositByHand]);

  const homeLabel = picked
    ? picked.address
    : fresh
      ? [[fresh.streetNumber, fresh.streetName].map((x) => x.trim()).filter(Boolean).join(" "), fresh.town.trim()].filter(Boolean).join(", ")
      : "";
  const homePostcode = picked ? (picked.address.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0] ?? "") : fresh?.postcode.trim() ?? "";
  const scottish = isScottish(homePostcode, homeLabel);

  /* What each screen still needs, said rather than greyed out. */
  const need = useMemo(() => {
    const n: Record<string, string>[] = [{}, {}, {}];
    if (!picked && !fresh) n[0].home = "Find the home, or say it is a brand new address";
    if (fresh) {
      if (!fresh.streetNumber.trim()) n[0].streetNumber = "The door number";
      if (!fresh.streetName.trim()) n[0].streetName = "The street";
      if (!fresh.town.trim()) n[0].town = "The town";
      if (!POSTCODE.test(fresh.postcode.trim())) n[0].postcode = "A full postcode";
    }
    if (picked && pickedListing) n[0].home = "This home is already on Listings - open that one instead";
    if (!typeId) n[0].typeId = "What kind of property it is";
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) n[1].name = "Their full name, first and last";
    if (!EMAIL.test(email.trim())) n[1].email = "An email - the terms of business go to it";
    if (mobile.replace(/\D/g, "").length < 10) n[1].mobile = "A mobile number";
    if (!source) n[1].source = "Where they came from";
    if (!landlordAddress.trim()) n[1].landlordAddress = "Their own address, for the contract";
    if (office && officeAnswer === null) n[1].office = "Say whether this is the same person";
    if (!(Number(rent) > 0)) n[2].rent = "The rent";
    if (!service) n[2].service = "The service";
    const fee = Number(feePct);
    if (feePct === "" || !Number.isFinite(fee) || fee < 0 || fee > 100) n[2].feePct = "The fee, as a percentage";
    const setup = Number(setupFee);
    if (setupFee === "" || !Number.isFinite(setup) || setup < 0) n[2].setupFee = "The set-up fee (0 if none)";
    return n;
  }, [picked, fresh, pickedListing, typeId, name, email, mobile, source, landlordAddress, office, officeAnswer, rent, service, feePct, setupFee]);

  function next() {
    setTried((t) => ({ ...t, [step]: true }));
    if (step <= 2 && Object.keys(need[step]).length) return;
    setStep((s) => Math.min(s + 1, 3));
  }

  async function create() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setNeedsSignIn(false);
    setExisting(null);
    try {
      /* The landlord, the way every landlord is saved - once, even if the
         listing half has to be tried again. */
      let cid = contactId;
      if (!cid) {
        const r = await fetch("/api/contacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "landlord",
            name: name.trim(),
            email: email.trim(),
            mobile: mobile.trim(),
            address: homeLabel,
            postcode: homePostcode.toUpperCase(),
            source,
            enquiry: "Landlord",
            notes: `Listing made directly from Listings (New listing). Landlord's own address: ${landlordAddress.trim()}`,
            rexId: office && officeAnswer === "yes" ? office.id : null,
          }),
        });
        const j = (await r.json().catch(() => ({}))) as { contact?: { id?: string }; error?: string };
        if (!j.contact?.id) throw new Error(j.error ?? "The landlord did not save.");
        cid = j.contact.id;
        setContactId(cid);
      }
      const r = await fetch("/api/listings/new", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: cid,
          propertyId: picked?.id,
          address: picked ? undefined : fresh,
          homeLabel,
          postcode: homePostcode.toUpperCase(),
          typeId,
          typeLabel: types.find((t) => t.id === typeId)?.label,
          rent: Number(rent),
          deposit: deposit === "" ? null : Number(deposit),
          availableFrom: availableFrom || null,
          service,
          feePct: Number(feePct),
          setupFee: Number(setupFee),
          landlordAddress: landlordAddress.trim(),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as Partial<Created> & { ok?: boolean; error?: string; signIn?: boolean; existingListingId?: string };
      if (!j.ok && j.existingListingId) return setExisting(j.existingListingId);
      if (!j.ok && j.signIn) {
        if (j.propertyId && fresh) {
          setPicked({ id: j.propertyId, address: homeLabel });
          setFresh(null);
        }
        return setNeedsSignIn(true);
      }
      if (!j.ok && j.propertyId && fresh) {
        setPicked({ id: j.propertyId, address: homeLabel });
        setFresh(null);
        throw new Error(`${j.error ?? "The listing was not created."} The address is saved, so trying again will not add it twice.`);
      }
      if (!j.ok || !j.listingId) throw new Error(j.error ?? "The listing was not created.");
      /* A Scottish home's landlord registration rides on the advert. */
      if (scottish && larn.trim()) {
        await fetch("/api/listings/details", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: j.listingId, landlordRegistration: larn.trim() }),
        }).catch(() => null);
      }
      setMade({ listingId: j.listingId, propertyId: j.propertyId ?? "", appraisalId: j.appraisalId ?? null, owner: j.owner ?? null, fileNote: j.fileNote ?? null });
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The listing was not created.");
    } finally {
      setSaving(false);
    }
  }

  /* ── 5. the terms: drawn up, signed by the agent, sent when they say ── */
  const pull = useCallback(async () => {
    if (!made?.appraisalId) return;
    try {
      const r = await fetch(`/api/appraisals/${encodeURIComponent(made.appraisalId)}/terms`, { cache: "no-store" });
      const j = (await r.json()) as { parties?: Party[]; sendUnlocked?: boolean };
      setParties(j.parties ?? []);
      setSendUnlocked(j.sendUnlocked ?? false);
    } catch {
      setParties([]);
    }
  }, [made?.appraisalId]);
  useEffect(() => {
    if (step === 4) void pull();
  }, [step, pull]);
  const recheck = useCallback(() => {
    void pull();
    [1500, 4000, 8000].forEach((ms) => window.setTimeout(() => void pull(), ms));
  }, [pull]);
  const agentParty = parties?.find((p) => p.role === "agent") ?? null;
  const landlordParty = parties?.find((p) => p.role === "landlord") ?? null;
  const signed = Boolean(agentParty?.completedAt);

  async function openSigning() {
    if (busy || !made?.appraisalId) return;
    setError(null);
    if (agentParty?.embedSrc) return setSigning(agentParty.embedSrc);
    setBusy("sign");
    try {
      const r = await fetch("/api/docuseal/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: made.appraisalId }) });
      const j = (await r.json()) as { ok?: boolean; embedSrc?: string; error?: string };
      if (j.ok && j.embedSrc) setSigning(j.embedSrc);
      else setError(j.error ?? "Couldn't draw up the contract.");
    } catch {
      setError("Couldn't draw up the contract just now.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (busy || !made?.appraisalId) return;
    setBusy("send");
    setError(null);
    try {
      const r = await fetch(`/api/appraisals/${encodeURIComponent(made.appraisalId)}/terms`, { method: "POST" });
      const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
      if (j.ok) {
        setSent(j.message ?? `Sent to ${email.trim()}.`);
        void pull();
      } else setError(j.error ?? "Couldn't send it.");
    } catch {
      setError("Couldn't send it just now.");
    } finally {
      setBusy(null);
    }
  }

  const Label = ({ children, opt }: { children: React.ReactNode; opt?: boolean }) => (
    <span className="text-[12px] font-semibold">
      {children}
      {opt ? <span className="ml-1 font-normal text-muted">(optional)</span> : <span className="ml-0.5 text-accent-dark">*</span>}
    </span>
  );
  const Err = ({ k }: { k: string }) => {
    const msg = step <= 2 && tried[step] ? need[step][k] : null;
    return msg ? <span className="mt-1 block text-[11.5px] text-[#9d4340]">{msg}</span> : null;
  };
  const bad = (k: string) => edge(Boolean(step <= 2 && tried[step] && need[step][k]));
  const missing = step <= 2 && tried[step] ? Object.keys(need[step]).length : 0;
  const serviceLabel = SERVICES.find((s) => s.id === service)?.label ?? "";
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-1.5 text-[12.5px]">
      <span className="text-muted">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#2b201d]/45 p-3 sm:p-6" onClick={made ? undefined : onClose}>
      <div
        className="drawer-in flex max-h-[94vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[26px] bg-page shadow-[0_30px_80px_-30px_rgba(40,25,20,0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New listing"
      >
        <div className="border-b border-line/60 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name="home" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-dark">Listings · {step + 1} of {STEPS.length}</p>
              <h2 className="text-[22px] font-normal leading-tight tracking-normal">New Listing</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <ol className="mt-4 grid grid-cols-5 gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="min-w-0">
                <span className={`block h-1 rounded-full ${i <= step ? "bg-accent-dark" : "bg-line"}`} />
                <span className={`mt-1.5 block truncate text-[11px] ${i === step ? "font-semibold text-ink" : "text-muted"}`}>
                  {i + 1}.<span className={i === step ? "" : "hidden sm:inline"}> {s}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div ref={body} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 0 && (
            <>
              <p className="text-[12.5px] leading-relaxed text-muted">Which home is going on the market. If we already have a file for it, carry on there instead.</p>
              <div>
                <Label>The address</Label>
                {picked ? (
                  <p className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5 text-[13.5px] font-semibold">
                    {picked.address}
                    <button type="button" onClick={() => { setPicked(null); setQuery(""); }} className="shrink-0 text-[11.5px] font-semibold text-muted hover:text-ink">Change</button>
                  </p>
                ) : fresh ? (
                  <div className="mt-1.5 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input placeholder="Door number" value={fresh.streetNumber} onChange={(e) => setFresh({ ...fresh, streetNumber: e.target.value })} className={`${field} ${bad("streetNumber")}`} />
                      <input placeholder="Street" value={fresh.streetName} onChange={(e) => setFresh({ ...fresh, streetName: e.target.value })} className={`${field} col-span-2 ${bad("streetName")}`} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Town" value={fresh.town} onChange={(e) => setFresh({ ...fresh, town: e.target.value })} className={`${field} ${bad("town")}`} />
                      <input placeholder="Postcode" value={fresh.postcode} onChange={(e) => setFresh({ ...fresh, postcode: e.target.value.toUpperCase() })} className={`${field} ${bad("postcode")}`} />
                    </div>
                    {propertyTypes.length > 0 && (
                      <select value={fresh.propertyTypeId} onChange={(e) => setFresh({ ...fresh, propertyTypeId: e.target.value })} className={`${field} border-line ${fresh.propertyTypeId ? "" : "text-muted"}`}>
                        <option value="">What kind of building is it? (optional)</option>
                        {propertyTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    )}
                    {["streetNumber", "streetName", "town", "postcode"].map((k) => <Err key={k} k={k} />)}
                    <button type="button" onClick={() => setFresh(null)} className="text-[11.5px] font-semibold text-muted hover:text-ink">Search again instead</button>
                  </div>
                ) : (
                  <>
                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing the address…" className={`mt-1.5 ${field} ${bad("home")}`} />
                    {looking && <p className="mt-2 text-[11.5px] text-muted">Looking…</p>}
                    {files.length > 0 && (
                      <div className="mt-2 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3">
                        <p className="text-[12px] font-semibold">We already have a file for {files.length === 1 ? "this home" : "homes like this"}</p>
                        <ul className="mt-1.5 space-y-1">
                          {files.map((f) => (
                            <li key={f.id} className="flex items-center justify-between gap-3 text-[12px]">
                              <span className="min-w-0 truncate">{f.address} · {f.landlord} · {STAGE_WORDS[f.stage] ?? f.stage}</span>
                              <a href={`/market-appraisals/${encodeURIComponent(f.id)}`} className="shrink-0 font-semibold text-accent-dark hover:underline">Open the file →</a>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-[11px] text-muted">Carry on from that file and the listing, landlord and terms are already joined up.</p>
                      </div>
                    )}
                    {found && found.length > 0 && (
                      <ul className="mt-2 divide-y divide-line/40 overflow-hidden rounded-xl border border-line/50 bg-white">
                        {found.map((f) => (
                          <li key={f.id}>
                            <button type="button" onClick={() => setPicked(f)} className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-page">{f.address}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {found && found.length === 0 && !looking && <p className="mt-2 text-[12px] text-muted">Nothing on file with that address.</p>}
                    <button type="button" onClick={() => setFresh({ streetNumber: "", streetName: "", town: "", postcode: "", propertyTypeId: "" })} className="mt-2 text-[11.5px] font-semibold text-accent-dark hover:underline">
                      It is a brand new address
                    </button>
                    <Err k="home" />
                  </>
                )}
                {picked && pickedListing && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft/60 px-3.5 py-3">
                    <p className="text-[12px] leading-relaxed text-accent-dark">This home is already on Listings, so there is nothing new to make.</p>
                    <a href={`/listings?open=${encodeURIComponent(pickedListing)}&tab=marketing`} className="shrink-0 rounded-full bg-[var(--brown)] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90">Open the listing →</a>
                  </div>
                )}
                {picked && !pickedListing && pickedFiles.length > 0 && (
                  <div className="mt-2 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px]">
                    <p className="font-semibold">There is already a file for this home: {pickedFiles[0].landlord}, {STAGE_WORDS[pickedFiles[0].stage] ?? pickedFiles[0].stage}.</p>
                    <a href={`/market-appraisals/${encodeURIComponent(pickedFiles[0].id)}`} className="mt-1 inline-block font-semibold text-accent-dark hover:underline">Carry on from that file →</a>
                  </div>
                )}
              </div>
              <label className="block">
                <Label>What kind of property is it?</Label>
                <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={`mt-1.5 ${field} ${bad("typeId")} ${typeId ? "" : "text-muted"}`}>
                  <option value="">Choose…</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <Err k="typeId" />
              </label>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-[12.5px] leading-relaxed text-muted">Every listing has a landlord. They become a landlord on the system, and the terms of business go to them.</p>
              <label className="block">
                <Label>Full name</Label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="off" className={`mt-1.5 ${field} ${bad("name")}`} autoFocus />
                <Err k="name" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <Label>Mobile</Label>
                  <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="07…" inputMode="tel" autoComplete="off" className={`mt-1.5 ${field} ${bad("mobile")}`} />
                  <Err k="mobile" />
                </label>
                <label className="block">
                  <Label>Email</Label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Where the terms go" inputMode="email" autoComplete="off" className={`mt-1.5 ${field} ${bad("email")}`} />
                  <Err k="email" />
                </label>
              </div>
              <label className="block">
                <Label>Their own address</Label>
                <input value={landlordAddress} onChange={(e) => setLandlordAddress(e.target.value)} placeholder="Where they live, with the postcode" autoComplete="off" className={`mt-1.5 ${field} ${bad("landlordAddress")}`} />
                <button type="button" onClick={() => setLandlordAddress([homeLabel, homePostcode].filter(Boolean).join(", "))} className="mt-1 text-[11.5px] font-semibold text-muted hover:text-ink">They live at the home</button>
                <Err k="landlordAddress" />
              </label>
              <label className="block">
                <Label>Where did they come from?</Label>
                <select value={source} onChange={(e) => setSource(e.target.value)} className={`mt-1.5 ${field} ${bad("source")}`}>
                  <option value="">Choose one</option>
                  {LEAD_SOURCES.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </optgroup>
                  ))}
                </select>
                <Err k="source" />
              </label>
              {scottish && (
                <label className="block">
                  <Label opt>Landlord registration number</Label>
                  <input value={larn} onChange={(e) => setLarn(e.target.value)} placeholder="As the council gives it, e.g. 123456/230/12345" autoComplete="off" className={`mt-1.5 ${field} border-line`} />
                  <span className="mt-1 block text-[11px] text-muted">A Scottish home. The advert has to carry this before it goes live.</span>
                </label>
              )}
              {office && (
                <div className={`rounded-2xl border bg-accent-soft/40 p-4 ${tried[1] && officeAnswer === null ? "border-[#c9675f]" : "border-accent-dark/40"}`}>
                  <p className="text-[13px] font-semibold">Is this {office.name}, already in the office records?</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{[office.email, office.mobile, office.address].filter(Boolean).join(" · ")}</p>
                  <div className="mt-2.5 flex gap-2">
                    {(["yes", "no"] as const).map((a) => (
                      <button key={a} type="button" onClick={() => setOfficeAnswer(a)} aria-pressed={officeAnswer === a} className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold ${officeAnswer === a ? "border-accent-dark bg-accent-dark text-white" : "border-line bg-white"}`}>
                        {a === "yes" ? "Yes, the same person" : "No, someone else"}
                      </button>
                    ))}
                  </div>
                  <Err k="office" />
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-[12.5px] leading-relaxed text-muted">What goes on the advert, and the figures the terms of business are drawn up from.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <Label>Rent, pcm</Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
                    <input type="number" min={0} inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} className={`${field} pl-7 ${bad("rent")}`} />
                  </div>
                  <Err k="rent" />
                </label>
                <label className="block">
                  <Label opt>Deposit</Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
                    <input type="number" min={0} inputMode="decimal" value={deposit} onChange={(e) => { setDepositByHand(true); setDeposit(e.target.value); }} className={`${field} border-line pl-7`} />
                  </div>
                  {suggested != null && <span className="mt-1 block text-[11px] text-muted">{Number(deposit) === suggested ? "Five weeks' rent, the most a deposit can be." : `Five weeks' rent is ${money(suggested)}, the most a deposit can be.`}</span>}
                </label>
                <label className="block">
                  <Label opt>Available from</Label>
                  <input type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className={`mt-1.5 ${field} border-line`} />
                </label>
                <label className="block">
                  <Label>Service</Label>
                  <select value={service} onChange={(e) => setService(e.target.value)} className={`mt-1.5 ${field} ${bad("service")} ${service ? "" : "text-muted"}`}>
                    <option value="">Choose…</option>
                    {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <Err k="service" />
                </label>
                <label className="block">
                  <Label>Fee, % of the rent</Label>
                  <div className="relative mt-1.5">
                    <input type="number" min={0} max={100} step="0.5" inputMode="decimal" value={feePct} onChange={(e) => setFeePct(e.target.value)} className={`${field} pr-8 ${bad("feePct")}`} />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">%</span>
                  </div>
                  <Err k="feePct" />
                </label>
                <label className="block">
                  <Label>Set-up fee</Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
                    <input type="number" min={0} inputMode="decimal" value={setupFee} onChange={(e) => setSetupFee(e.target.value)} className={`${field} pl-7 ${bad("setupFee")}`} />
                  </div>
                  <Err k="setupFee" />
                </label>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-[12.5px] leading-relaxed text-muted">Check it all once. Create makes the landlord, the listing (a draft, with the landlord on it) and the file behind it. Nothing is emailed yet.</p>
              <section className="rounded-[18px] border border-line/50 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">The home</p>
                <Row k="Address" v={[homeLabel, picked ? "" : homePostcode].filter(Boolean).join(", ")} />
                <Row k="Type" v={types.find((t) => t.id === typeId)?.label ?? "-"} />
              </section>
              <section className="rounded-[18px] border border-line/50 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">The landlord</p>
                <Row k="Name" v={name.trim()} />
                <Row k="Email" v={email.trim()} />
                <Row k="Mobile" v={mobile.trim()} />
                <Row k="Their address" v={landlordAddress.trim()} />
                {office && officeAnswer === "yes" && <Row k="Office records" v={`Carries on ${office.name}'s record`} />}
                {scottish && <Row k="Registration" v={larn.trim() || "Not given yet"} />}
              </section>
              <section className="rounded-[18px] border border-line/50 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">The let</p>
                <Row k="Rent" v={`${money(Number(rent))} pcm`} />
                <Row k="Deposit" v={deposit === "" ? "-" : money(Number(deposit))} />
                <Row k="Available from" v={availableFrom ? new Date(availableFrom).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "-"} />
                <Row k="Service" v={serviceLabel} />
                <Row k="Fee" v={`${Number(feePct)}% of the rent`} />
                <Row k="Set-up fee" v={money(Number(setupFee))} />
              </section>
              {needsSignIn && <SignInAgain doing="create the listing" onDone={() => void create()} />}
              {existing && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft/60 px-3.5 py-3">
                  <p className="text-[12px] leading-relaxed text-accent-dark">This home is already on Listings, so there is nothing new to make.</p>
                  <a href={`/listings?open=${encodeURIComponent(existing)}&tab=marketing`} className="shrink-0 rounded-full bg-[var(--brown)] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90">Open the listing →</a>
                </div>
              )}
            </>
          )}

          {step === 4 && made && (
            <>
              <div className="rounded-[18px] border border-[#cfe0c4] bg-[#f1f4ec] px-4 py-3 text-[12.5px] leading-relaxed text-[#3f5a32]">
                <p className="font-semibold">The listing is made, as a draft.</p>
                <p className="mt-0.5">
                  {name.trim()} is saved as the landlord.{" "}
                  {made.owner?.state === "added" || made.owner?.state === "already"
                    ? "They are on the listing too."
                    : "They aren't on the listing record yet, so ask the office to add them before it goes to Propoly."}
                </p>
                {made.fileNote && <p className="mt-0.5 text-[#9d4340]">{made.fileNote}</p>}
              </div>
              <section className="rounded-[18px] border border-line/50 bg-white p-4">
                <p className="text-[13px] font-semibold">Terms of business</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                  The listing can't go on the portals until {name.trim().split(/\s+/)[0]} has signed them. Drawn up from what you put in: {money(Number(rent))} pcm, {serviceLabel.toLowerCase()}, {Number(feePct)}% and {money(Number(setupFee))} to set up.
                </p>
                {!made.appraisalId ? (
                  <p className="mt-3 text-[12px] text-[#9d4340]">The file behind the listing did not save, so the terms can't be drawn up here. Ask the office.</p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-line/60 px-3 py-2.5">
                      <span className="text-[12.5px]">
                        <span className="font-semibold">1. Sign your half</span>
                        <span className="block text-[11.5px] text-muted">{signed ? "Signed." : "You sign first, so the landlord gets a contract they can act on."}</span>
                      </span>
                      {!signed && (
                        <button type="button" onClick={() => void openSigning()} disabled={busy !== null} className="shrink-0 rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50">
                          {busy === "sign" ? "Drawing it up…" : agentParty ? "Sign it" : "Draw up and sign"}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-line/60 px-3 py-2.5">
                      <span className="text-[12.5px]">
                        <span className="font-semibold">2. Send it to {name.trim().split(/\s+/)[0]}</span>
                        <span className="block text-[11.5px] text-muted">
                          {sent ?? (landlordParty?.sentAt ? "Sent." : sendUnlocked === false ? "Emails to customers are switched off here, so this can't go yet." : `One email, from you, to ${email.trim()}. It goes when you press Send.`)}
                        </span>
                      </span>
                      {!sent && !landlordParty?.sentAt && (
                        <button type="button" onClick={() => void send()} disabled={!signed || busy !== null || sendUnlocked === false} className="shrink-0 rounded-full bg-[var(--brown)] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">
                          {busy === "send" ? "Sending…" : "Send"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {error && <p className="rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-accent-dark">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 bg-white px-5 py-4 sm:px-6">
          {step <= 2 && (
            <>
              <button type="button" onClick={next} className="btn-press rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white">
                Next: {STEPS[step + 1]} →
              </button>
              <button type="button" onClick={() => (step === 0 ? onClose() : setStep(step - 1))} className="rounded-full border border-line/80 bg-card px-4 py-2.5 text-[12.5px] font-semibold">
                {step === 0 ? "Cancel" : "← Back"}
              </button>
              {missing > 0 && <span className="text-[11.5px] text-[#9d4340]">{missing} {missing === 1 ? "thing" : "things"} still needed</span>}
            </>
          )}
          {step === 3 && !needsSignIn && !existing && (
            <>
              <button type="button" onClick={() => void create()} disabled={saving} className="btn-press flex items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
                <DoodleIcon name="home" size={14} />
                {saving ? "Creating it…" : "Create the listing"}
              </button>
              <button type="button" onClick={() => setStep(2)} disabled={saving} className="rounded-full border border-line/80 bg-card px-4 py-2.5 text-[12.5px] font-semibold">← Back</button>
            </>
          )}
          {step === 4 && made && (
            <>
              <button type="button" onClick={() => onCreated(made.listingId)} className="btn-press rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white">
                Open the listing →
              </button>
              <span className="text-[11.5px] text-muted">Photos and the description are next, on the listing.</span>
            </>
          )}
        </div>
      </div>

      {signing && (
        <SignModal
          url={signing}
          steps={AGENT_SIGNING}
          closeLabel="Finish later"
          onClose={() => { setSigning(null); recheck(); }}
          onDone={() => { setSigning(null); recheck(); }}
        />
      )}
    </div>
  );
}
