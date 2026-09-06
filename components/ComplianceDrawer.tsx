"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyFile from "@/components/PropertyFile";
import { Pill } from "@/components/Wire";
import { CERT_META, requiredCerts, statusOf, type CertKey, type CompProperty } from "@/lib/compliance";
import { COMPLIANCE_READERS as R, houseByListing, housesIn, pickerOption, roomLabel, tabLabel, type House } from "@/lib/houses";
import RoomPicker from "@/components/RoomPicker";
import { useDocumentOpen } from "@/lib/doc-sheet";

/**
 * One home's compliance, pulled out to the width of the lead drawer
 * (James, 6 Sep 2026: "it should fully pull out, the same as a lead").
 *
 * A shared house opens with a tab for the house and one per room, the same
 * grouping Portfolio uses, so the certificate on the house is seen from any
 * room. The body is the property file - every duty, where it stands in REX,
 * the certificate itself, Attach - which is the same panel the listing, the
 * application and the appraisal show. Nothing is booked or sent from here:
 * open the certificate and the sheet offers Save and Send.
 */

function certLine(expires: number | null): string {
  if (expires == null) return "No record";
  if (expires < 0) return `Expired ${Math.abs(expires)}d ago`;
  if (expires <= 60) return `${expires}d left`;
  const months = Math.round(expires / 30.4);
  return `~${months} month${months === 1 ? "" : "s"}`;
}

export default function ComplianceDrawer({
  property,
  book,
  onClose,
}: {
  property: CompProperty | null;
  /** The whole book, so a room can find its house. */
  book: CompProperty[];
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState<string>("house");
  const docOpen = useDocumentOpen();

  const houses = useMemo(() => housesIn(book, R), [book]);
  const houseOf = useMemo(() => houseByListing(houses, R), [houses]);
  const house: House<CompProperty> | null = property ? houseOf.get(property.id) ?? null : null;

  useEffect(() => {
    if (!property) { setShown(false); return; }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [property]);
  useEffect(() => {
    if (!property) return;
    const opened = house ? house.rooms.find((r) => r.id === property.id || (house.kind === "rooms" && roomLabel(r).toLowerCase() === roomLabel(property).toLowerCase())) : null;
    setTab(opened && house?.house?.id !== property.id ? opened.id : "house");
  }, [property, house]);
  useEffect(() => {
    if (!property) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [property, onClose]);

  if (!property) return null;
  const room = house && tab !== "house" ? house.rooms.find((r) => r.id === tab) ?? null : null;
  const p: CompProperty = room ?? house?.house ?? (house ? house.rooms[0] : property);
  const houseView = Boolean(house) && !room;
  const lets = house?.kind === "lets";
  const required = requiredCerts(p);
  const title = house ? house.name : p.name;
  const sub = house
    ? lets
      ? `${house.locality} · ${house.rooms.length} lets on record in REX`
      : `${house.locality} · shared house · ${house.rooms.length} ${house.rooms.length === 1 ? "room" : "rooms"}`
    : `${p.locality} · landlord ${p.landlord || "not on record"}${p.tenant ? ` · ${p.tenant} in situ` : p.tenant === null ? " · vacant" : ""}`;

  /* The worst of every room, for the house tab. */
  const worstOf = (k: CertKey) => {
    const members = house ? house.members : [p];
    const order = ["expired", "urgent", "missing", "watch", "ok"];
    return members.map((m) => m.certs[k]).sort((a, b) => order.indexOf(statusOf(a)) - order.indexOf(statusOf(b)))[0];
  };

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[calc(100%-17rem)] ${shown && !docOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="shrink-0 border-b border-line/70 px-6 pt-5">
          <div className="flex items-start justify-between gap-3 pb-5">
            <div className="min-w-0">
              <h2 className="text-[20px] leading-tight">{title}</h2>
              <p className="mt-1 text-[12px] text-muted">
                {sub}
                {p.hmo && <span className="ml-1.5 font-semibold text-accent-dark">HMO</span>}
                {!p.hasGas && " · no gas at the property"}
                {p.onRex === false && " · not on REX"}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink">
              ✕
            </button>
          </div>
          {house && (
            <div className="flex flex-wrap items-center gap-2 pb-4">
              <button
                type="button"
                onClick={() => setTab("house")}
                className={`rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors ${tab === "house" ? "border-ink bg-ink text-page" : "border-line/80 hover:border-ink"}`}
              >
                The house
              </button>
              <RoomPicker
                options={house.rooms.map((r) => ({ id: r.id, ...pickerOption(house, r, R), bad: requiredCerts(r).some((k) => ["expired", "urgent", "missing"].includes(statusOf(r.certs[k]))) }))}
                value={tab === "house" ? null : tab}
                onChange={setTab}
                placeholder={lets ? "Tenants" : "Rooms"}
              />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* Where every duty stands, at a glance. On the house tab, the
              worst across the rooms; a room reads the house's certificates. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {required.map((k) => {
              const cert = houseView ? worstOf(k) : p.certs[k];
              const s = statusOf(cert);
              const bad = s === "expired" || s === "urgent" || s === "missing";
              return (
                <div key={k} className={`rounded-xl border px-3.5 py-3 ${s === "expired" ? "border-accent-dark bg-accent-soft/30" : bad ? "border-accent-dark/40" : "border-line/70"}`}>
                  <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                    <DoodleIcon name={CERT_META[k].icon} size={12} className="text-accent-dark" />
                    {CERT_META[k].short}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                    <Pill tone={bad ? "accent" : "good"}>{k === "gas" && !p.hasGas ? "No gas" : certLine(cert?.expires ?? null)}</Pill>
                    {cert?.inherited && <span className="text-[10.5px] text-muted">from the house</span>}
                  </p>
                </div>
              );
            })}
          </div>

          {houseView && house && !lets && (
            <section className="mt-6">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Rooms</p>
              <ul className="overflow-hidden rounded-xl border border-line/70 bg-panel">
                {house.rooms.map((r) => {
                  const bad = requiredCerts(r).filter((k) => ["expired", "urgent", "missing"].includes(statusOf(r.certs[k])));
                  return (
                    <li key={r.id} className="border-b border-line/40 last:border-0">
                      <button type="button" onClick={() => setTab(r.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[12.5px] transition-colors hover:bg-box">
                        <span className="font-semibold">{tabLabel(house, r, R)}</span>
                        <span className="min-w-0 flex-1 truncate text-muted">{r.tenant ?? "Empty"}</span>
                        {bad.length ? <Pill tone="accent">{bad.map((k) => CERT_META[k].short).join(", ")}</Pill> : <Pill tone="good">In date</Pill>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="mt-6">
            <PropertyFile
              key={p.id}
              propertyId={p.id}
              propertyName={house ? `${house.name}${room ? ` · ${tabLabel(house, room, R)}` : ""}` : p.name}
              screen="compliance"
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
