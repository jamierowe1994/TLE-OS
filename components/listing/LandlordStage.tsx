"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ContactBlock from "@/components/ContactBlock";
import { InlineField } from "@/components/Bits";
import { AddPersonModal, type HomePerson, type Kind, type MainLandlord } from "@/components/HomeLandlords";

/**
 * Edit landlord, on the stage (James, 25 Oct 2026): "the landlord at the top
 * with no background, so the word 'landlord', and then we'll have different
 * things popping in... when you click it, it'll expand out of nowhere. You'll
 * be able to fill in the details, and then you can drag and drop who you want
 * the point of contact to be."
 *
 * The same people and the same saving as the landlords section everywhere
 * else (components/HomeLandlords: the record's landlord through its own ref,
 * additional landlords and contacts on the home through /api/portfolio/people),
 * drawn as boxes floating on a darkened screen, each rising in on its own
 * beat. A box opens in place to edit. The order is the agent's: the first box
 * is the point of contact, kept per home (/api/portfolio/people/order). Drag a
 * box to the top, or press "Make point of contact" on a phone.
 */

type Entry =
  | { key: string; kind: "main"; m: MainLandlord }
  | { key: string; kind: Kind; p: HomePerson };

const TAG: Record<Entry["kind"], string> = { main: "Landlord", joint_landlord: "Additional landlord", contact: "Contact" };
const beat = (i: number) => ({ animationDelay: `${140 + i * 90}ms` });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export default function LandlordStage({
  open,
  onClose,
  homeKey,
  address,
  main,
  mainSlot,
  mainProblem = null,
  mainAction,
  readOnly = null,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  homeKey: string | null;
  address: string;
  main: MainLandlord[] | null;
  mainSlot?: React.ReactNode;
  mainProblem?: string | null;
  mainAction?: React.ReactNode;
  readOnly?: string | null;
  onChanged?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [people, setPeople] = useState<HomePerson[] | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState<Kind | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setShown(false);
      setOpenKey(null);
      setSaid(null);
      return;
    }
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || adding) return;
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    const was = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = was;
    };
  }, [open, onClose, adding]);

  const load = useCallback(() => {
    if (!homeKey) {
      setPeople([]);
      return;
    }
    Promise.all([
      fetch(`/api/portfolio/people?property=${encodeURIComponent(homeKey)}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/portfolio/people/order?property=${encodeURIComponent(homeKey)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ])
      .then(([pj, oj]) => {
        if (!pj?.ok) {
          setFailed(pj?.error ?? "The other people on this home couldn't be read.");
          setPeople([]);
        } else {
          setFailed(null);
          setPeople(pj.people ?? []);
        }
        setOrder(oj?.ok && Array.isArray(oj.keys) ? oj.keys : []);
      })
      .catch(() => {
        setFailed("The other people on this home couldn't be read.");
        setPeople([]);
      });
  }, [homeKey]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  /* Everyone, in the agent's order; anyone new goes after the rest. */
  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = [
      ...(mainSlot ? [] : (main ?? []).map((m): Entry => ({ key: `main:${m.key}`, kind: "main", m }))),
      ...(people ?? []).filter((p) => p.kind === "joint_landlord").map((p): Entry => ({ key: p.id, kind: "joint_landlord", p })),
      ...(people ?? []).filter((p) => p.kind === "contact").map((p): Entry => ({ key: p.id, kind: "contact", p })),
    ];
    const at = (k: string) => {
      const i = order.indexOf(k);
      return i < 0 ? 1000 + all.findIndex((e) => e.key === k) : i;
    };
    return [...all].sort((a, b) => at(a.key) - at(b.key));
  }, [main, mainSlot, people, order]);
  const landlords = entries.filter((e) => e.kind !== "contact").length + (mainSlot ? 1 : 0);
  const nameOf = (e: Entry) => (e.kind === "main" ? e.m.name : e.p.name);

  async function saveOrder(keys: string[]) {
    if (!homeKey) return;
    setOrder(keys);
    const first = entries.find((e) => e.key === keys[0]);
    const j = await fetch("/api/portfolio/people/order", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ property: homeKey, keys, first: first ? nameOf(first) : undefined }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setSaid(j?.ok ? (first ? `${nameOf(first)} is the point of contact now.` : "Order saved.") : j?.error ?? "The order didn't save. Try again.");
  }
  const moveTo = (key: string, index: number) => {
    const keys = entries.map((e) => e.key).filter((k) => k !== key);
    keys.splice(index, 0, key);
    void saveOrder(keys);
  };

  async function patch(p: HomePerson, change: Partial<HomePerson>): Promise<{ ok: boolean; error?: string }> {
    const next = { ...p, ...change };
    const j = await fetch("/api/portfolio/people", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, name: next.name, email: next.email ?? "", phone: next.phone ?? "", relation: next.relation ?? "" }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (!j?.ok) return { ok: false, error: j?.error ?? "That didn't save." };
    setPeople((all) => (all ?? []).map((x) => (x.id === p.id ? { ...x, ...(j.person ?? next) } : x)));
    onChanged?.();
    return { ok: true };
  }

  async function remove(p: HomePerson) {
    if (p.kind === "joint_landlord" && landlords <= 1) return setSaid("Every home needs a landlord. Add the right one first, then take this one off.");
    if (!window.confirm(`Take ${p.name} off this home?`)) return;
    const j = await fetch(`/api/portfolio/people?id=${encodeURIComponent(p.id)}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) return setSaid(j?.error ?? "That didn't come off. Try again.");
    setOpenKey(null);
    load();
    onChanged?.();
    setSaid(p.kind === "joint_landlord" ? `${p.name} is off this home. If they're on a Propoly deal, take them off it there too.` : `${p.name} is off this home.`);
  }

  if (!open || typeof document === "undefined") return null;
  /* Whatever has arrived shows; what hasn't says so in its place. */
  const reading = main === null && people === null;

  const box = (e: Entry, i: number) => {
    const isOpen = openKey === e.key;
    const first = i === 0;
    const person = e.kind === "main" ? { name: e.m.name, email: e.m.email, phone: e.m.phone } : { name: e.p.name, email: e.p.email, phone: e.p.phone };
    const relation = e.kind === "main" ? null : e.p.relation;
    return (
      <li
        key={e.key}
        className={`nl-ls-box nl-po-in${isOpen ? " is-open" : ""}${first ? " is-first" : ""}${drag === e.key ? " is-dragging" : ""}`}
        style={beat(i + 1)}
        draggable={!readOnly && !isOpen}
        onDragStart={(ev) => {
          setDrag(e.key);
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", e.key);
        }}
        onDragEnd={() => setDrag(null)}
        onDragOver={(ev) => {
          if (drag && drag !== e.key) ev.preventDefault();
        }}
        onDrop={(ev) => {
          ev.preventDefault();
          if (drag && drag !== e.key) moveTo(drag, i);
          setDrag(null);
        }}
      >
        <button type="button" className="nl-ls-row" aria-expanded={isOpen} onClick={() => setOpenKey(isOpen ? null : e.key)}>
          {!readOnly && (
            <span className="nl-ls-grip" aria-hidden title="Drag to reorder">
              <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="9" r="1.4" /><circle cx="9" cy="9" r="1.4" /><circle cx="3" cy="15" r="1.4" /><circle cx="9" cy="15" r="1.4" /></svg>
            </span>
          )}
          <span className={`nl-ls-av is-${e.kind}`}>{initials(person.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="nl-ls-tags">
              {first && <span className="nl-ls-first">Point of contact</span>}
              <span className="nl-ls-kind">{TAG[e.kind]}</span>
            </span>
            <span className="nl-ls-name">{person.name || "Name not held"}</span>
            <span className="nl-ls-sub">{[relation, person.phone, person.email].filter(Boolean).join(" · ") || "No phone or email held"}</span>
          </span>
          <svg className="nl-ls-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {isOpen && (
          <div className="nl-ls-edit">
            <ContactBlock
              role={e.kind === "contact" ? "point of contact" : "landlord"}
              call={e.kind === "contact"}
              person={person}
              personRef={readOnly || e.kind !== "main" ? null : e.m.personRef}
              saver={
                readOnly
                  ? undefined
                  : e.kind === "main"
                    ? e.m.saver
                    : async (field, value) => {
                        const r = await patch(e.p, { [field]: value || null } as Partial<HomePerson>);
                        return { ok: r.ok, error: r.error, detail: "Saved on the home." };
                      }
              }
              home={e.kind !== "contact" ? { propertyAddress: address } : undefined}
              about={address}
              onSaved={e.kind === "main" ? () => { e.m.onSaved?.(); onChanged?.(); } : undefined}
            />
            {e.kind !== "main" && (
              <div className="nl-ls-who">
                <span>Who they are:</span>
                {readOnly ? (
                  <span>{e.p.relation || "Not said"}</span>
                ) : (
                  <InlineField value={e.p.relation} placeholder={e.kind === "contact" ? "e.g. Partner, lets us in" : "e.g. Director, Wife"} onChange={(v) => void patch(e.p, { relation: v.trim().slice(0, 80) })} className="text-[12.5px] text-ink" />
                )}
              </div>
            )}
            {e.kind === "main" && e.m.note && <p className="nl-ls-note">{e.m.note}</p>}
            {e.kind === "main" && e.m.after}
            {e.kind === "main" && mainAction}
            {e.kind === "contact" && <p className="nl-ls-note">Not a landlord: not on the contract, and never sent to Propoly.</p>}
            {!readOnly && (
              <div className="nl-ls-acts">
                {!first && (
                  <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => moveTo(e.key, 0)}>
                    Make point of contact
                  </button>
                )}
                {e.kind !== "main" && !(e.kind === "joint_landlord" && landlords <= 1) && (
                  <button type="button" className="nl-link" onClick={() => void remove(e.p)}>
                    Take off this home
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  return createPortal(
    <div data-look="new" className="nl-po nl-ls" data-shown={shown} role="dialog" aria-modal="true" aria-label="The landlord">
      <button type="button" className="nl-po-scrim" aria-label="Close" onClick={onClose} />
      <div className="nl-po-card">
        <div className="nl-po-head nl-po-in" style={{ animationDelay: "40ms" }}>
          <div className="min-w-0 flex-1">
            <p className="nl-eyebrow">{address}</p>
            <h2 className="nl-po-title">{landlords > 1 ? "Landlords" : "Landlord"}</h2>
            <p className="nl-ls-lede">Press anyone to change their details. The first is who we ring: drag someone to the top to make them the point of contact.</p>
          </div>
          <button type="button" className="nl-iconbtn" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {reading ? (
          <p className="nl-po-wait">
            <span className="nl-po-spin" aria-hidden />
            Looking up the landlord…
          </p>
        ) : (
          <>
            {mainSlot && <div className="nl-po-box nl-po-in" style={beat(1)}>{mainSlot}</div>}
            {(main === null || people === null) && (
              <p className="nl-po-wait">
                <span className="nl-po-spin" aria-hidden />
                {main === null ? "Looking up the landlord…" : "Reading the other people on this home…"}
              </p>
            )}
            {!mainSlot && main !== null && people !== null && entries.filter((e) => e.kind !== "contact").length === 0 && (
              <div className="nl-ls-none nl-po-in" style={beat(1)}>
                <b>No landlord held.</b> Every home needs one.{mainProblem ? ` ${mainProblem}` : ""}
              </div>
            )}
            {entries.length > 0 && <ul className="nl-ls-list">{entries.map(box)}</ul>}
            {failed && <p className="nl-ls-said nl-po-in" style={beat(entries.length + 1)}>{failed}</p>}
            {said && <p className="nl-ls-said">{said}</p>}
            {readOnly && <p className="nl-ls-said">{readOnly}</p>}
            {!readOnly && homeKey && (
              <div className="nl-ls-adds nl-po-in" style={beat(entries.length + 2)}>
                <button type="button" className="nl-ls-add" onClick={() => setAdding("joint_landlord")}>
                  + Add another landlord
                </button>
                <button type="button" className="nl-ls-add" onClick={() => setAdding("contact")}>
                  + Add a contact
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {adding && homeKey && (
        <AddPersonModal
          kind={adding}
          address={address}
          onClose={() => setAdding(null)}
          onSubmit={async (f) => {
            const j = await fetch("/api/portfolio/people", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ propertyId: homeKey, kind: f.kind, name: f.name, email: f.email, phone: f.phone, relation: f.relation }),
            })
              .then((r) => r.json())
              .catch(() => null);
            if (!j?.ok) return { ok: false, error: j?.error ?? "That didn't save. Try again." };
            if (f.kind === "joint_landlord" && f.address.trim() && f.email.trim()) {
              await fetch("/api/people/home-address", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: f.email, name: f.name, address: f.address }) }).catch(() => null);
            }
            load();
            onChanged?.();
            return { ok: true };
          }}
        />
      )}
    </div>,
    document.body
  );
}
