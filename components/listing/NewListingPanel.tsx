"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import FloatSheet, { FloatFoot } from "@/components/new-look/FloatSheet";
import { useNewLook } from "@/lib/use-new-look";
import SignInAgain from "@/components/SignInAgain";
import { fiveWeeks, money } from "@/components/listing/listing-draft";
import { SERVICE_LEVELS } from "@/lib/listing-requirements";

/**
 * ADD A NEW LISTING (16 Sep 2026). The button used to open REX in a new tab.
 *
 * Three answers and it exists: the address, what it is, and the rent. The
 * address is looked up first so a second record for the same home is never
 * made by accident - the commonest way a book ends up with two of everything.
 * Everything else - photos, description, key features, bills and services -
 * is the Marketing tab, which the panel hands straight over to, because that
 * is where Fill it in for me does most of it.
 */

interface Props {
  onClose: () => void;
  /** The new listing, so the board can open its record, and the property it hangs off. */
  onCreated: (listingId: string, propertyId?: string) => void;
  /**
   * Started from an appraisal file (Howard, 1 Oct 2026: "they can do
   * everything whilst still in here"). The home it is about and what was
   * agreed, so the agent checks three answers rather than retyping them.
   * Nothing is created until they press the button, the same as from Listings.
   */
  /** The panel's title: "Re-let this home" when it comes from Portfolio. */
  heading?: string;
  prefill?: {
    /** The appraisal file it is made from. A test file's listing stays in the OS. */
    appraisalId?: string | null;
    propertyId?: string | null;
    address?: string | null;
    rent?: number | null;
    serviceLevel?: string | null;
  };
}

type Found = { id: string; address: string };
type Option = { id: string; label: string };

const FIELD = "w-full rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[13.5px] outline-none focus:border-ink";
const LABEL = "block text-[11px] text-muted";
const CARD = "rounded-[20px] border border-line/50 bg-white p-4";

/** "Re-let this home" -> "Re-let This Home": titles in Title Case, small words lower. */
const SMALL = new Set(["a", "an", "the", "of", "to", "and", "on", "in", "for"]);
const titleCase = (t: string) => t.split(" ").map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

export default function NewListingPanel({ onClose, onCreated, prefill, heading = "Add a new listing" }: Props) {
  /* The new look draws it on the floating sheet the other new-look pop-ups
     use (James, 16 Nov 2026: Re-let and taking a home off still showed in the
     old style). Same fields, same saves; only the frame and the boxes change. */
  const look = useNewLook("listing") === true;
  const field = look ? "nl-fs-input" : FIELD;
  const label = look ? "nl-fs-label block" : LABEL;
  const card = look ? "nl-fs-card" : CARD;
  const [shown, setShown] = useState(false);
  /* A known home is already picked; an address alone is searched for, so the
     agent still chooses the record rather than us guessing it. */
  const [query, setQuery] = useState(prefill?.propertyId ? "" : (prefill?.address ?? ""));
  const [found, setFound] = useState<Found[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [picked, setPicked] = useState<Found | null>(
    prefill?.propertyId ? { id: String(prefill.propertyId), address: prefill.address ?? `Property ${prefill.propertyId}` } : null
  );
  const [fresh, setFresh] = useState<{ streetNumber: string; streetName: string; town: string; postcode: string; propertyTypeId: string } | null>(null);
  const [types, setTypes] = useState<Option[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<Option[]>([]);
  const [typeId, setTypeId] = useState("");
  const [rent, setRent] = useState(prefill?.rent ? String(prefill.rent) : "");
  const [deposit, setDeposit] = useState("");
  /* Typed over? Then the rent stops filling it in. */
  const [depositByHand, setDepositByHand] = useState(false);
  const [availableFrom, setAvailableFrom] = useState("");
  const [serviceLevel, setServiceLevel] = useState(
    SERVICE_LEVELS.some((s) => s.id === prefill?.serviceLevel) ? (prefill?.serviceLevel as string) : "managed"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Their REX sign-in has run out: asked for on the spot, then it carries on. */
  const [needsSignIn, setNeedsSignIn] = useState(false);
  /* The home already has a current listing: that one is opened, not a second made. */
  const [existing, setExisting] = useState<string | null>(null);
  /* HOW THE LANDLORD CAME TO US, ASKED HERE (James, 16 Nov 2026: "We need to
     allow the agent to pick the source"). A listing can't be made on a home
     with no Source, and the agent was sent off to find a picker on the home's
     page that some homes never show. Read when a known home is picked; with
     none on it, a pick is asked for here and saved before the listing is
     made. "unknown" (couldn't read it) does not stop them. */
  const [homeSource, setHomeSource] = useState<{ state: "idle" | "none" | "has" | "unknown"; options: string[] }>({ state: "idle", options: [] });
  const [sourcePick, setSourcePick] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

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

  /* A TEST FILE (James, 13 Oct 2026): its home is never in REX, so there is
     no address to look up or make - the listing is made in the OS alone, on
     the file's own address, and the panel says so rather than sending the
     tester hunting through REX for 14 Test Street. */
  const [testFile, setTestFile] = useState(false);
  useEffect(() => {
    const id = prefill?.appraisalId;
    if (!id) return;
    let off = false;
    fetch(`/api/listings/create?testFile=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { test?: boolean }) => !off && setTestFile(j.test === true))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [prefill?.appraisalId]);

  /* The address lookup, a beat after they stop typing. */
  useEffect(() => {
    if (picked || fresh || testFile) return;
    const q = query.trim();
    if (q.length < 3) {
      setFound(null);
      return;
    }
    setLooking(true);
    const t = setTimeout(() => {
      fetch(`/api/listings/create?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; addresses?: Found[] }) => setFound(j.ok ? (j.addresses ?? []) : []))
        .catch(() => setFound([]))
        .finally(() => setLooking(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query, picked, fresh, testFile]);

  const suggested = fiveWeeks(Number(rent) || null);
  /* Five weeks, filled in rather than only suggested: it is a required field
     before the listing can go live, and it is five weeks nearly every time
     (16 Sep 2026 - the first one made in the OS went in with no deposit). */
  useEffect(() => {
    if (!depositByHand) setDeposit(suggested == null ? "" : String(suggested));
  }, [suggested, depositByHand]);
  const pickedId = !testFile && picked && /^\d+$/.test(picked.id) ? picked.id : null;
  useEffect(() => {
    setSourcePick("");
    if (!pickedId) return setHomeSource({ state: "idle", options: [] });
    let live = true;
    fetch(`/api/homes/source?property=${encodeURIComponent(pickedId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; source?: string | null; options?: string[] }) => {
        if (!live) return;
        const options = Array.isArray(j.options) ? j.options : [];
        setHomeSource({ state: !j.ok || j.source == null ? "unknown" : j.source ? "has" : options.length ? "none" : "unknown", options });
      })
      .catch(() => live && setHomeSource({ state: "unknown", options: [] }));
    return () => {
      live = false;
    };
  }, [pickedId]);
  const ready =
    Boolean((testFile || picked || (fresh?.streetName && fresh.town && fresh.postcode)) && typeId && Number(rent) > 0) &&
    (homeSource.state !== "none" || Boolean(sourcePick));

  async function create() {
    setSaving(true);
    setError(null);
    setNeedsSignIn(false);
    setExisting(null);
    try {
      if (homeSource.state === "none" && pickedId && sourcePick) {
        const sr = await fetch("/api/homes/source", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ property: pickedId, source: sourcePick }),
        });
        const sj = (await sr.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!sj.ok) throw new Error(sj.error ?? "The Source didn't save, so the listing wasn't made. Try again.");
        setHomeSource((h) => ({ ...h, state: "has" }));
      }
      const r = await fetch("/api/listings/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appraisalId: prefill?.appraisalId ?? undefined,
          propertyId: testFile ? undefined : picked?.id,
          address: picked || testFile ? undefined : fresh,
          typeId,
          typeLabel: types.find((t) => t.id === typeId)?.label,
          rent: Number(rent),
          deposit: deposit === "" ? null : Number(deposit),
          availableFrom: availableFrom || null,
          serviceLevel,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; listingId?: string; propertyId?: string; signIn?: boolean; existingListingId?: string };
      if (!j.ok && j.existingListingId) {
        setExisting(j.existingListingId);
        return;
      }
      if (!j.ok && j.signIn) {
        if (j.propertyId && fresh) {
          const address = [fresh.streetNumber, fresh.streetName, fresh.town, fresh.postcode].map((x) => x.trim()).filter(Boolean).join(", ");
          setPicked({ id: j.propertyId, address });
          setFresh(null);
        }
        setNeedsSignIn(true);
        return;
      }
      /* The address can be made when the listing is then refused. Hold on to
         it, so trying again adds the listing to that address rather than
         making a second one (the route returns its id for exactly this). */
      if (!j.ok && j.propertyId && fresh) {
        const address = [fresh.streetNumber, fresh.streetName, fresh.town, fresh.postcode].map((x) => x.trim()).filter(Boolean).join(", ");
        setPicked({ id: j.propertyId, address });
        setFresh(null);
        throw new Error(`${j.error ?? "The listing was not created."} The address is saved, so trying again will not add it twice.`);
      }
      if (!j.ok || !j.listingId) throw new Error(j.error ?? "The listing was not created.");
      onCreated(j.listingId, j.propertyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The listing was not created.");
    } finally {
      setSaving(false);
    }
  }

  const createButton = (
    !needsSignIn && !existing ? <button
            type="button"
            disabled={!ready || saving}
            onClick={() => void create()}
            className={look ? "nl-btn nl-btn--primary" : "press-ring flex shrink-0 items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"}
          >
            {!look && <DoodleIcon name="home" size={14} />}
            {saving ? "Creating it…" : look ? "Create the Listing" : "Create the listing"}
          </button> : null
  );
  const content = (
    <>
          {/* 1. The address */}
          <section className={card}>
            <p className={label}>The address</p>
            {testFile ? (
              <p className="mt-1.5 text-[13.5px] font-semibold">
                {prefill?.address ?? "The test file's home"}
                <span className="mt-0.5 block text-[11.5px] font-normal text-muted">A test file, so the listing is made in the OS only - nothing goes to REX or the portals.</span>
              </p>
            ) : picked ? (
              <p className="mt-1.5 flex items-center justify-between gap-3 text-[13.5px] font-semibold">
                {picked.address}
                <button type="button" onClick={() => { setPicked(null); setQuery(""); }} className="shrink-0 text-[11.5px] font-semibold text-muted hover:text-ink">Change</button>
              </p>
            ) : fresh ? (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input placeholder="4" value={fresh.streetNumber} onChange={(e) => setFresh({ ...fresh, streetNumber: e.target.value })} className={field} />
                  <input placeholder="Williams Court" value={fresh.streetName} onChange={(e) => setFresh({ ...fresh, streetName: e.target.value })} className={`${field} col-span-2`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Cullompton" value={fresh.town} onChange={(e) => setFresh({ ...fresh, town: e.target.value })} className={field} />
                  <input placeholder="EX15 1ZH" value={fresh.postcode} onChange={(e) => setFresh({ ...fresh, postcode: e.target.value.toUpperCase() })} className={field} />
                </div>
                {propertyTypes.length > 0 && (
                  <select value={fresh.propertyTypeId} onChange={(e) => setFresh({ ...fresh, propertyTypeId: e.target.value })} className={`${field} ${fresh.propertyTypeId ? "" : "text-muted"}`}>
                    <option value="">What kind of building is it?</option>
                    {propertyTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => setFresh(null)} className="text-[11.5px] font-semibold text-muted hover:text-ink">Search again instead</button>
              </div>
            ) : (
              <>
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing the address…" className={`${field} mt-1.5`} />
                {looking && <p className="mt-2 text-[11.5px] text-muted">Looking…</p>}
                {found && found.length > 0 && (
                  <ul className="mt-2 divide-y divide-line/40 overflow-hidden rounded-xl border border-line/50">
                    {found.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => setPicked(f)} className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-page">{f.address}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {found && found.length === 0 && !looking && <p className="mt-2 text-[12px] text-muted">Nothing on file with that address.</p>}
                <button
                  type="button"
                  onClick={() => setFresh({ streetNumber: "", streetName: "", town: "", postcode: "", propertyTypeId: "" })}
                  className="mt-2 text-[11.5px] font-semibold text-accent-dark hover:underline"
                >
                  It is a brand new address
                </button>
              </>
            )}
          </section>

          {/* 2. What it is */}
          <section className={card}>
            <label className={label}>
              What kind of property is it?
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={`${field} mt-1 ${typeId ? "" : "text-muted"}`}>
                <option value="">Choose…</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <p className="mt-1.5 text-[11px] text-muted">The portals turn a listing away without this.</p>
          </section>

          {/* 3. The let */}
          <section className={card}>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Rent, pcm
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
                  <input type="number" min={0} value={rent} onChange={(e) => setRent(e.target.value)} className={`${field} pl-7`} style={look ? { paddingLeft: 28 } : undefined} />
                </div>
              </label>
              <label className={label}>
                Deposit
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
                  <input type="number" min={0} value={deposit} onChange={(e) => { setDepositByHand(true); setDeposit(e.target.value); }} className={`${field} pl-7`} style={look ? { paddingLeft: 28 } : undefined} />
                </div>
              </label>
              <label className={label}>
                Available from
                <input type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className={`${field} mt-1`} />
              </label>
              <label className={label}>
                Service
                <select value={serviceLevel} onChange={(e) => setServiceLevel(e.target.value)} className={`${field} mt-1`}>
                  {SERVICE_LEVELS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
            {suggested != null && (
              <p className="mt-2 text-[11px] text-muted">
                {Number(deposit) === suggested ? `Five weeks' rent, the most a deposit can be.` : `Five weeks' rent is ${money(suggested)}, the most a deposit can be.`}
              </p>
            )}
          </section>

          {homeSource.state === "none" && (
            <section className={look ? "nl-fs-card" : "rounded-2xl border border-accent-dark/30 bg-accent-soft/40 p-4"} data-steve="listing.new-source">
              <label className={label}>
                <span className="text-[12px] text-accent-dark">This home has no Source yet. Add one - how the landlord came to us.</span>
                <select value={sourcePick} onChange={(e) => setSourcePick(e.target.value)} className={`${field} mt-1.5`} aria-label="How the landlord came to us">
                  <option value="">Add a source</option>
                  {homeSource.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          {needsSignIn && <SignInAgain doing="create the listing" onDone={() => void create()} />}
          {existing && (
            <div className={look ? "nl-fs-card flex flex-wrap items-center justify-between gap-3" : "flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft/60 px-3.5 py-3"}>
              <p className="text-[12px] leading-relaxed text-accent-dark">This home is already on Listings, so there is nothing new to make. Carry on with that one.</p>
              <a href={`/listings?open=${encodeURIComponent(existing)}&tab=marketing`} className="shrink-0 rounded-full bg-[var(--brown)] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90">
                Open the listing <span aria-hidden>→</span>
              </a>
            </div>
          )}
          {error && <p className={look ? "nl-fs-card nl-fs-err" : "rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-accent-dark"}>{error}</p>}
    </>
  );

  if (look) {
    return (
      <FloatSheet
        title={titleCase(heading)}
        onClose={onClose}
        dismissible={!saving}
        foot={<FloatFoot left={<span className="nl-meta">Photos, the description and the rest come next, on the listing.</span>}>{createButton}</FloatFoot>}
      >
        {content}
      </FloatSheet>
    );
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/45 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <div
        ref={box}
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[26px] border border-line/50 bg-page shadow-[0_40px_90px_-30px_rgba(0,0,0,0.5)] transition-[transform,opacity] duration-300"
        style={{ transform: shown ? "translateY(0)" : "translateY(12px)", opacity: shown ? 1 : 0 }}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-dark">Listings</p>
            <h2 className="hand mt-1 text-[23px] leading-tight">{heading}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/60 text-[13px] text-muted hover:border-ink/40 hover:text-ink" title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4">
          {content}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line/50 bg-white px-6 py-4">
          <p className="text-[11px] leading-snug text-muted">Photos, the description and the rest come next, on the listing.</p>
          {/* While the sign-in card or the existing listing is showing, that
              card holds the one button to press - never two that both say create. */}
          {createButton}
        </div>
      </div>
    </div>
  );
}
