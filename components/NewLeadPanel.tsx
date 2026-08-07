"use client";

import { useEffect, useRef, useState } from "react";
import AddressField, { type ResolvedAddress } from "@/components/AddressField";
import { DoneTick, PressButton } from "@/components/Bits";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { LEAD_SOURCES } from "@/lib/leads-sample";
import rexSample from "@/lib/rex-sample.json";

/**
 * Creating a lead is the same act as reading one, so it happens in the same
 * sheet at the same width — you're filling in the record, not completing a
 * form that later becomes a record.
 *
 * Three sections, in the order a phone call actually goes: who they are, what
 * they said, what they want to see.
 */

type Listing = {
  id: string; name: string; locality: string; rent: number | null; image: string | null;
};
const LISTINGS = rexSample.listings as Listing[];

type Draft = {
  name: string;
  mobile: string;
  email: string;
  address: string;
  source: string;
  enquiry: "Letting" | "Landlord" | "Valuation";
  notes: string;
};

const EMPTY: Draft = {
  name: "", mobile: "", email: "", address: "",
  source: "", enquiry: "Letting", notes: "",
};

const NEXT_ACTIONS = [
  { label: "Schedule a viewing", icon: "calendar" },
  { label: "Send an email", icon: "mail" },
  { label: "Set a follow-up", icon: "clock" },
  { label: "Open the record", icon: "user" },
];

function Section({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line/80 bg-panel p-5 ${className}`}>
      <h3 className="mb-4 flex items-center gap-2.5 text-[14px]">
        <DoodleIcon name={icon} size={17} className="text-accent-dark" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function NewLeadPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (d: Draft) => void;
}) {
  const [shown, setShown] = useState(false);
  const [d, setD] = useState<Draft>(EMPTY);
  const [geo, setGeo] = useState<ResolvedAddress | null>(null);
  const [saved, setSaved] = useState(false);

  // The shortlist, and the picker you drag from.
  const [picked, setPicked] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<"market" | "shortlist">("market");
  const [overDrop, setOverDrop] = useState(false);
  const [overMarket, setOverMarket] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const marketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    setD(EMPTY);
    setGeo(null);
    setSaved(false);
    setPicked([]);
    setPicking(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /**
   * Drag with POINTER events, not the HTML5 drag API — that one text-selects
   * the page underneath, doesn't work on touch, and gives no live feedback.
   * Clicking a card adds it too, so nothing depends on the drag succeeding.
   */
  function onPointerDown(e: React.PointerEvent, id: string, from: "market" | "shortlist") {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
    setDragFrom(from);
  }
  const inside = (el: HTMLElement | null, x: number, y: number) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  function onPointerMove(e: React.PointerEvent) {
    if (!dragId) return;
    setOverDrop(inside(dropRef.current, e.clientX, e.clientY));
    setOverMarket(inside(marketRef.current, e.clientX, e.clientY));
  }
  function onPointerUp() {
    if (dragId) {
      if (dragFrom === "market" && overDrop) add(dragId);
      // Dragging back onto the market un-shortlists it.
      if (dragFrom === "shortlist" && overMarket) remove(dragId);
    }
    setDragId(null);
    setOverDrop(false);
    setOverMarket(false);
  }
  const add = (id: string) => setPicked((cur) => (cur.includes(id) ? cur : [...cur, id]));
  const remove = (id: string) => setPicked((cur) => cur.filter((x) => x !== id));

  if (!open) return null;

  const ready = d.name.trim() && d.mobile.trim();
  const set = (k: keyof Draft) => (v: string) => setD((cur) => ({ ...cur, [k]: v }));
  const shortlist = LISTINGS.filter((l) => picked.includes(l.id));
  const available = LISTINGS.filter((l) => !picked.includes(l.id));

  const field =
    "w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink";
  const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted";

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Same width as the record drawer — creating and reading are one place. */}
      <aside
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-5">
          <div>
            <h2 className="text-[24px] leading-tight">{saved ? "Added" : "New lead"}</h2>
            {!saved && (
              <p className="mt-1 text-[12px] text-muted">
                Fill in what you have — the rest can wait until you&apos;ve spoken.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {saved ? (
            <div className="mx-auto flex max-w-md flex-col items-center pt-10 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[22px]">{d.name} is on the board</p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Saved to Leads{d.source ? ` · ${d.source}` : ""}
                {shortlist.length
                  ? ` · ${shortlist.length} propert${shortlist.length === 1 ? "y" : "ies"} shortlisted`
                  : ""}
                .
              </p>

              <div className="mt-8 w-full">
                <p className="mb-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                  What next?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {NEXT_ACTIONS.map((a) => (
                    <PressButton
                      key={a.label}
                      className="flex items-center gap-2.5 rounded-xl border border-line/80 px-3.5 py-3 text-left text-[12.5px] transition-colors hover:border-ink/40"
                    >
                      <DoodleIcon name={a.icon} size={16} className="shrink-0 text-accent-dark" />
                      {a.label}
                    </PressButton>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-5 w-full rounded-xl py-2.5 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
                >
                  Done for now
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* ── Who they are ── */}
              <Section title="Contact details" icon="user">
                <div className="space-y-3.5">
                  <label className="block">
                    <span className={label}>Name</span>
                    <input
                      autoFocus
                      value={d.name}
                      onChange={(e) => set("name")(e.target.value)}
                      placeholder="Sarah Johnson"
                      className={field}
                    />
                  </label>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <label className="block">
                      <span className={label}>Mobile</span>
                      <input
                        value={d.mobile}
                        onChange={(e) => set("mobile")(e.target.value)}
                        placeholder="07712 345 678"
                        inputMode="tel"
                        className={field}
                      />
                    </label>
                    <label className="block">
                      <span className={label}>Email</span>
                      <input
                        value={d.email}
                        onChange={(e) => set("email")(e.target.value)}
                        placeholder="sarah@email.com"
                        inputMode="email"
                        className={field}
                      />
                    </label>
                  </div>
                  <div>
                    <span className={label}>Current address</span>
                    <AddressField
                      value={d.address}
                      onChange={set("address")}
                      onResolved={setGeo}
                    />
                  </div>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <label className="block">
                      <span className={label}>Enquiry</span>
                      <select
                        value={d.enquiry}
                        onChange={(e) => set("enquiry")(e.target.value)}
                        className={field}
                      >
                        <option>Letting</option>
                        <option>Landlord</option>
                        <option>Valuation</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className={label}>Source</span>
                      <select
                        value={d.source}
                        onChange={(e) => set("source")(e.target.value)}
                        className={field}
                      >
                        <option value="">How did they find us?</option>
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
                    </label>
                  </div>
                </div>
              </Section>

              {/* ── What they said ── */}
              <Section title="Notes" icon="note">
                <textarea
                  value={d.notes}
                  onChange={(e) => set("notes")(e.target.value)}
                  rows={9}
                  placeholder="What did they say? Budget, timing, must-haves, anything that would change which properties you send…"
                  className={`${field} resize-none leading-relaxed`}
                />
                {geo?.postcode && (
                  <p className="mt-2 text-[11px] text-muted">
                    Address geotagged to {geo.postcode}.
                  </p>
                )}
              </Section>

              {/* ── What they want to see ── */}
              <Section title="Interested in" icon="home" className="lg:col-span-2">
                <div className={`grid gap-4 ${picking ? "lg:grid-cols-[1.1fr_1fr]" : ""}`}>
                  {/* The drop zone. */}
                  <div
                    ref={dropRef}
                    className={`rounded-2xl border-[1.5px] border-dashed p-4 transition-colors ${
                      overDrop ? "border-accent-dark bg-accent-soft/40" : "border-line"
                    }`}
                  >
                    {shortlist.length ? (
                      <ul className="space-y-2.5">
                        {shortlist.map((p) => (
                          <li
                            key={p.id}
                            onPointerDown={(e) => onPointerDown(e, p.id, "shortlist")}
                            className={`flex cursor-grab touch-none select-none items-center gap-3 rounded-xl p-1.5 transition-all active:cursor-grabbing ${
                              dragId === p.id
                                ? "scale-[1.04] -rotate-1 bg-card shadow-[0_14px_30px_-10px_rgba(0,0,0,0.45)]"
                                : ""
                            }`}
                          >
                            <span className="text-[11px] leading-none text-muted/70">⠿</span>
                            <PropertyPhoto src={p.image} className="h-10 w-12 shrink-0 rounded-lg" />
                            <span className="min-w-0 flex-1">
                              <span className="hand block truncate text-[12.5px]">{p.name}</span>
                              <span className="block truncate text-[10.5px] text-muted">
                                {p.locality}
                              </span>
                            </span>
                            <span className="figures shrink-0 text-[12.5px]">
                              £{p.rent?.toLocaleString("en-GB")}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPicked((c) => c.filter((x) => x !== p.id))}
                              className="shrink-0 px-1 text-[12px] text-muted transition-colors hover:text-ink"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : picking ? (
                      <p className="py-10 text-center text-[12.5px] text-muted">
                        Drag a property in from the right — or just click one.
                      </p>
                    ) : (
                      /* Before the picker opens, the whole box is the button. */
                      <PressButton
                        onClick={() => setPicking(true)}
                        className="flex w-full flex-col items-center gap-2 py-10 text-muted transition-colors hover:text-ink"
                      >
                        <DoodleIcon name="home" size={22} />
                        <span className="text-[13px] font-medium">+ Add property</span>
                        <span className="text-[11px]">Shortlist what they want to see</span>
                      </PressButton>
                    )}

                    {shortlist.length > 0 && !picking && (
                      <PressButton
                        onClick={() => setPicking(true)}
                        className="mt-3 w-full rounded-xl border border-dashed border-line py-2.5 text-[12px] font-medium text-muted transition-colors hover:border-ink/40 hover:text-ink"
                      >
                        + Add another
                      </PressButton>
                    )}
                  </div>

                  {/* The picker you drag from. */}
                  {picking && (
                    <div
                      ref={marketRef}
                      className={`fade-up rounded-2xl border p-4 transition-colors ${
                        overMarket && dragFrom === "shortlist"
                          ? "border-accent-dark bg-accent-soft/30"
                          : "border-line/80"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                          On the market
                        </p>
                        <button
                          type="button"
                          onClick={() => setPicking(false)}
                          className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                        >
                          Done
                        </button>
                      </div>
                      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {available.map((p) => (
                          <li
                            key={p.id}
                            onPointerDown={(e) => onPointerDown(e, p.id, "market")}
                            onClick={() => add(p.id)}
                            className={`flex cursor-grab touch-none select-none items-center gap-3 rounded-xl border p-2.5 transition-all active:cursor-grabbing ${
                              dragId === p.id
                                ? "scale-[1.04] -rotate-1 border-accent-dark bg-card shadow-[0_14px_30px_-10px_rgba(0,0,0,0.45)]"
                                : "border-line/60 hover:border-ink/40 hover:shadow-[0_4px_12px_-6px_rgba(0,0,0,0.25)]"
                            }`}
                          >
                            <span className="text-[11px] leading-none text-muted/70">⠿</span>
                            <PropertyPhoto src={p.image} className="h-9 w-11 shrink-0 rounded-md" />
                            <span className="min-w-0 flex-1">
                              <span className="hand block truncate text-[12px]">{p.name}</span>
                              <span className="block truncate text-[10px] text-muted">
                                {p.locality}
                              </span>
                            </span>
                            <span className="figures shrink-0 text-[11.5px]">
                              £{p.rent?.toLocaleString("en-GB")}
                            </span>
                          </li>
                        ))}
                        {!available.length && (
                          <p className="py-6 text-center text-[12px] text-muted">
                            Everything on the market is shortlisted.
                          </p>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>

              {/* ── Save ── */}
              <div className="lg:col-span-2">
                <PressButton
                  onClick={() => {
                    if (!ready) return;
                    onCreated?.(d);
                    setSaved(true);
                  }}
                  className={`w-full rounded-xl py-3.5 text-[14px] font-semibold transition-opacity ${
                    ready ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                  }`}
                >
                  Add lead
                </PressButton>
                {!ready && (
                  <p className="mt-2 text-center text-[11px] text-muted">
                    A name and a mobile is enough to start.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
