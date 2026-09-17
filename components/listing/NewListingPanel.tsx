"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { fiveWeeks, money } from "@/components/listing/listing-draft";
import { LET_TYPES, SERVICE_LEVELS } from "@/lib/listing-requirements";

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
  /** The new listing, so the board can open its record. */
  onCreated: (listingId: string) => void;
}

type Found = { id: string; address: string };
type Option = { id: string; label: string };

const field = "w-full rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[13.5px] outline-none focus:border-ink";
const label = "block text-[11px] text-muted";

export default function NewListingPanel({ onClose, onCreated }: Props) {
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [picked, setPicked] = useState<Found | null>(null);
  const [fresh, setFresh] = useState<{ streetNumber: string; streetName: string; town: string; postcode: string; propertyTypeId: string } | null>(null);
  const [types, setTypes] = useState<Option[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<Option[]>([]);
  const [typeId, setTypeId] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  /* Typed over? Then the rent stops filling it in. */
  const [depositByHand, setDepositByHand] = useState(false);
  const [availableFrom, setAvailableFrom] = useState("");
  const [letType, setLetType] = useState("long_term");
  const [serviceLevel, setServiceLevel] = useState("managed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  /* The address lookup, a beat after they stop typing. */
  useEffect(() => {
    if (picked || fresh) return;
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
  }, [query, picked, fresh]);

  const suggested = fiveWeeks(Number(rent) || null);
  /* Five weeks, filled in rather than only suggested: it is a required field
     before the listing can go live, and it is five weeks nearly every time
     (16 Sep 2026 - the first one made in the OS went in with no deposit). */
  useEffect(() => {
    if (!depositByHand) setDeposit(suggested == null ? "" : String(suggested));
  }, [suggested, depositByHand]);
  const ready = Boolean((picked || (fresh?.streetName && fresh.town && fresh.postcode)) && typeId && Number(rent) > 0);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/listings/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          propertyId: picked?.id,
          address: picked ? undefined : fresh,
          typeId,
          rent: Number(rent),
          deposit: deposit === "" ? null : Number(deposit),
          availableFrom: availableFrom || null,
          letType,
          serviceLevel,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; listingId?: string; propertyId?: string };
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
      onCreated(j.listingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The listing was not created.");
    } finally {
      setSaving(false);
    }
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
            <h2 className="hand mt-1 text-[23px] leading-tight">Add a new listing</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/60 text-[13px] text-muted hover:border-ink/40 hover:text-ink" title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4">
          {/* 1. The address */}
          <section className="rounded-[20px] border border-line/50 bg-white p-4">
            <p className={label}>The address</p>
            {picked ? (
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
          <section className="rounded-[20px] border border-line/50 bg-white p-4">
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
          <section className="rounded-[20px] border border-line/50 bg-white p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Rent, pcm
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
                  <input type="number" min={0} value={rent} onChange={(e) => setRent(e.target.value)} className={`${field} pl-7`} />
                </div>
              </label>
              <label className={label}>
                Deposit
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
                  <input type="number" min={0} value={deposit} onChange={(e) => { setDepositByHand(true); setDeposit(e.target.value); }} className={`${field} pl-7`} />
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
              <label className={`${label} col-span-2`}>
                Let type
                <select value={letType} onChange={(e) => setLetType(e.target.value)} className={`${field} mt-1`}>
                  {LET_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
            {suggested != null && (
              <p className="mt-2 text-[11px] text-muted">
                {Number(deposit) === suggested ? `Five weeks' rent, the most a deposit can be.` : `Five weeks' rent is ${money(suggested)}, the most a deposit can be.`}
              </p>
            )}
          </section>

          {error && <p className="rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-accent-dark">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line/50 bg-white px-6 py-4">
          <p className="text-[11px] leading-snug text-muted">Photos, the description and the rest come next, on the listing.</p>
          <button
            type="button"
            disabled={!ready || saving}
            onClick={() => void create()}
            className="press-ring flex shrink-0 items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <DoodleIcon name="home" size={14} />
            {saving ? "Creating it…" : "Create the listing"}
          </button>
        </div>
      </div>
    </div>
  );
}
