"use client";

import { useCallback, useEffect, useState } from "react";
import ContactBlock from "@/components/ContactBlock";
import DoodleIcon from "@/components/DoodleIcon";
import { InlineField } from "@/components/Bits";

/**
 * THE LANDLORDS SECTION, THE SAME EVERYWHERE A LANDLORD SHOWS (James, 20 Oct
 * 2026): "in any place where there are details of the landlords, we need to
 * be able to adjust that. Whether that's in the application or in the
 * listings, we always need to be able to update their details. We should
 * never stop them from doing it."
 *
 * One section on the let, the listing, the home's page and the appraisal:
 *   - the landlord(s) the record holds, every field changeable (REX contacts
 *     through REX; the home's own record on the record; anyone else by the
 *     screen's own `saver`)
 *   - additional landlords, a co-owner on the home
 *   - points of contact: somebody who isn't a landlord but is who we ring -
 *     a partner, a son, a PA - say for access
 *   - "+ Add additional landlord" and "+ Add point of contact", always
 *
 * Additional landlords and points of contact are kept against the HOME
 * (lib/property-people, os_property_people), so one added on the listing is
 * on the let and the home's page too. `homeKey` is the REX property id, a
 * REX PM home's id, or the screen's own key where there is no home yet.
 * Kept in the OS only: nothing here is written to REX.
 */

export type Kind = "joint_landlord" | "contact";
export type HomePerson = { id: string; kind: Kind; name: string; email: string | null; phone: string | null; relation: string };
export type Saver = (field: "name" | "email" | "phone", value: string) => Promise<{ ok: boolean; error?: string; detail?: string }>;
/** A landlord the record holds, with how it is changed. */
export type MainLandlord = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** "rex:<id>", "os:<id>" or "home:<homeKey>" (the home's own record). */
  personRef: string | null;
  /** Where neither ref fits: the screen saves them its own way. */
  saver?: Saver;
  /** One line under them: where they come from. */
  note?: string | null;
  /** Anything under them: Change landlord, the Propoly line. */
  after?: React.ReactNode;
  /** After a change saved through their ref (the let page then tells Propoly). */
  onSaved?: () => void;
};
/** What adding sends; the screen may route it (the let page also tells Propoly). */
export type AddForm = { kind: Kind; name: string; email: string; phone: string; relation: string; address: string };

const eyebrow = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
const KIND_TAG: Record<Kind, string> = { joint_landlord: "Additional landlord", contact: "Point of contact" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function HomeLandlords({
  homeKey,
  address,
  main,
  mainSlot,
  mainProblem = null,
  mainAction,
  requireOne = true,
  readOnly = null,
  addLandlord,
  extraLine,
  onChanged,
  className = "",
  heading,
}: {
  homeKey: string | null;
  /** The home's address, for "Same as the let property" and emails. */
  address: string;
  /** null while the landlord is being looked up. */
  main: MainLandlord[] | null;
  /** In place of the main list (a landlord changed in the OS has its own card). */
  mainSlot?: React.ReactNode;
  mainProblem?: string | null;
  /** Under the main landlord(s): Change landlord. */
  mainAction?: React.ReactNode;
  /** Say so in pink when no landlord is held at all. */
  requireOne?: boolean;
  /** A reason this place can't keep people (a test listing). */
  readOnly?: string | null;
  /** Route an added landlord through the screen (the let page tells Propoly). */
  addLandlord?: (f: AddForm) => Promise<{ ok: boolean; error?: string }>;
  /** Under an additional landlord: the let's Propoly line. */
  extraLine?: (p: HomePerson) => React.ReactNode;
  /** After any add, change or take-off; with the person when there is one. */
  onChanged?: (p?: HomePerson) => void;
  className?: string;
  /** null where the card already says "The landlord" (the appraisal). */
  heading?: string | null;
}) {
  const [people, setPeople] = useState<HomePerson[] | null>(homeKey ? null : []);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState<Kind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!homeKey) { setPeople([]); return; }
    fetch(`/api/portfolio/people?property=${encodeURIComponent(homeKey)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) { setFailed(j?.error ?? "The other people on this home couldn't be read."); setPeople([]); return; }
        setFailed(null);
        setPeople(j.people ?? []);
      })
      .catch(() => { setFailed("The other people on this home couldn't be read."); setPeople([]); });
  }, [homeKey]);
  useEffect(() => { setPeople(homeKey ? null : []); load(); }, [load, homeKey]);

  const joint = (people ?? []).filter((p) => p.kind === "joint_landlord");
  const contacts = (people ?? []).filter((p) => p.kind === "contact");
  const landlordCount = (main?.length ?? 0) + joint.length + (mainSlot ? 1 : 0);

  async function patch(p: HomePerson, change: Partial<HomePerson>): Promise<{ ok: boolean; error?: string }> {
    const next = { ...p, ...change };
    const j = await fetch("/api/portfolio/people", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, name: next.name, email: next.email ?? "", phone: next.phone ?? "", relation: next.relation ?? "" }),
    }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) return { ok: false, error: j?.error ?? "That didn't save." };
    setPeople((all) => (all ?? []).map((x) => (x.id === p.id ? { ...x, ...(j.person ?? next) } : x)));
    onChanged?.(j.person ?? next);
    return { ok: true };
  }

  async function remove(p: HomePerson) {
    setMsg(null);
    if (p.kind === "joint_landlord" && requireOne && landlordCount <= 1) {
      setMsg("Every home needs a landlord. Add the right one first, then take this one off.");
      return;
    }
    if (!window.confirm(`Take ${p.name} off this home?`)) return;
    const j = await fetch(`/api/portfolio/people?id=${encodeURIComponent(p.id)}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { setMsg(j?.error ?? "That didn't come off. Try again."); return; }
    load();
    onChanged?.();
    if (p.kind === "joint_landlord") setMsg(`${p.name} is off this home. If they're on a Propoly deal, take them off it there too.`);
  }

  const card = (p: HomePerson) => (
    <li key={p.id} className="rounded-xl border border-line/50 bg-white p-3.5">
      <div className="mb-1 flex items-start justify-between gap-2">
        {/* Points of contact sit under their own heading; only an additional landlord needs saying. */}
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-dark">
          {p.kind === "joint_landlord" ? KIND_TAG[p.kind] : ""}
        </p>
        {/* The last landlord on a home can't come off: every home needs one. */}
        {!readOnly && !(p.kind === "joint_landlord" && requireOne && landlordCount <= 1) && (
          <button type="button" onClick={() => void remove(p)} className="shrink-0 text-[11.5px] font-semibold text-muted hover:text-ink">Take off</button>
        )}
      </div>
      <ContactBlock
        role={p.kind === "joint_landlord" ? "landlord" : "point of contact"}
        call={p.kind === "contact"}
        person={{ name: p.name, email: p.email, phone: p.phone }}
        personRef={null}
        home={p.kind === "joint_landlord" ? { propertyAddress: address } : undefined}
        about={address}
        saver={readOnly ? undefined : async (field, value) => {
          const r = await patch(p, { [field]: value || null } as Partial<HomePerson>);
          return { ok: r.ok, error: r.error, detail: "Saved on the home." };
        }}
      />
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-[11.5px] text-muted">
        <span>Who they are:</span>
        {readOnly ? (
          <span className="text-ink">{p.relation || "Not said"}</span>
        ) : (
          <InlineField value={p.relation} placeholder={p.kind === "contact" ? "e.g. Partner, lets us in" : "e.g. Director, Wife"} onChange={(v) => void patch(p, { relation: v.trim().slice(0, 80) })} className="text-[11.5px] text-ink" />
        )}
      </div>
      {p.kind === "contact" && <p className="mt-1 text-[11px] text-muted">Not a landlord: not on the contract, and never sent to Propoly.</p>}
      {p.kind === "joint_landlord" && extraLine?.(p)}
    </li>
  );

  return (
    <div className={className} data-steve="landlords.section">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {heading === null ? <span /> : <p className={eyebrow}>{heading ?? (landlordCount > 1 ? `The landlords · ${landlordCount}` : "The landlord")}</p>}
        {!readOnly && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setAdding("joint_landlord")} disabled={people === null} className="inline-flex items-center gap-1 rounded-full border border-accent-dark/50 bg-white px-3 py-1 text-[11.5px] font-semibold text-accent-dark transition-colors hover:bg-accent-soft disabled:opacity-50">
              + Add additional landlord
            </button>
            <button type="button" onClick={() => setAdding("contact")} disabled={people === null} className="inline-flex items-center gap-1 rounded-full border border-line/80 bg-white px-3 py-1 text-[11.5px] font-semibold text-ink transition-colors hover:border-ink/40 disabled:opacity-50">
              + Add point of contact
            </button>
          </div>
        )}
      </div>

      {mainSlot ? (
        <div>{mainSlot}</div>
      ) : main === null ? (
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Looking up the landlord&hellip;
        </p>
      ) : main.length ? (
        <ul className="grid grid-cols-1 gap-3">
          {main.map((m) => (
            <li key={m.key} className="rounded-xl border border-line/50 bg-white p-3.5">
              <ContactBlock
                role="landlord"
                person={{ name: m.name, email: m.email, phone: m.phone }}
                personRef={readOnly ? null : m.personRef}
                saver={readOnly ? undefined : m.saver}
                home={{ propertyAddress: address }}
                onSaved={() => { m.onSaved?.(); onChanged?.(); }}
              />
              {m.note && <p className="mt-1.5 text-[11px] text-muted">{m.note}</p>}
              {m.after}
            </li>
          ))}
        </ul>
      ) : people !== null && !joint.length && requireOne ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fdefec] px-4 py-3 text-[12.5px] text-[#9d4340]">
          <span>
            <b className="font-semibold">No landlord held.</b> Every home needs one.{mainProblem ? ` ${mainProblem}` : ""}
          </span>
          {!readOnly && (
            <button type="button" onClick={() => setAdding("joint_landlord")} className="shrink-0 rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-page">
              Add the landlord
            </button>
          )}
        </div>
      ) : null}
      {!mainSlot && mainAction}

      {failed && <p className="mt-2 text-[11.5px] text-muted">{failed}</p>}
      {joint.length > 0 && <ul className="mt-3 grid grid-cols-1 gap-3">{joint.map(card)}</ul>}
      {contacts.length > 0 && (
        <>
          <p className={`${eyebrow} mb-2 mt-4`}>{contacts.length > 1 ? `Points of contact · ${contacts.length}` : "Point of contact"}</p>
          <ul className="grid grid-cols-1 gap-3">{contacts.map(card)}</ul>
        </>
      )}
      {readOnly && <p className="mt-2 text-[11.5px] text-muted">{readOnly}</p>}
      {msg && <p className="mt-2 text-[12px] text-muted">{msg}</p>}

      {adding && homeKey && (
        <AddPersonModal
          kind={adding}
          address={address}
          onClose={() => setAdding(null)}
          onSubmit={async (f) => {
            if (f.kind === "joint_landlord" && addLandlord) {
              const r = await addLandlord(f);
              if (r.ok) { load(); onChanged?.(); }
              return r;
            }
            const j = await fetch("/api/portfolio/people", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ propertyId: homeKey, kind: f.kind, name: f.name, email: f.email, phone: f.phone, relation: f.relation }),
            }).then((r) => r.json()).catch(() => null);
            if (!j?.ok) return { ok: false, error: j?.error ?? "That didn't save. Try again." };
            /* A landlord's own home goes where every landlord's is kept (lib/landlord-home). */
            if (f.kind === "joint_landlord" && f.address.trim() && f.email.trim()) {
              await fetch("/api/people/home-address", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: f.email, name: f.name, address: f.address }) }).catch(() => null);
            }
            load();
            onChanged?.(j.person);
            return { ok: true };
          }}
        />
      )}
    </div>
  );
}

/** The short form behind "+ Add additional landlord" and "+ Add point of contact". */
export function AddPersonModal({ kind, address, note, onClose, onSubmit }: {
  kind: Kind;
  address: string;
  /** What happens to them next, under the form (the let says where Propoly stands). */
  note?: string;
  onClose: () => void;
  onSubmit: (f: AddForm) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [d, setD] = useState({ name: "", email: "", phone: "", relation: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const landlord = kind === "joint_landlord";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save() {
    if (d.name.trim().length < 2) return setMsg("Put their name in.");
    if (d.email.trim() && !EMAIL.test(d.email.trim())) return setMsg("That email doesn't look right.");
    if (landlord && !d.email.trim()) return setMsg("A landlord needs an email address - the contracts and Propoly go to it.");
    if (!landlord && !d.email.trim() && !d.phone.trim()) return setMsg("Add a mobile or an email, so there's a way to reach them.");
    setBusy(true);
    setMsg(null);
    const r = await onSubmit({ kind, ...d });
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? "That didn't save. Try again.");
    onClose();
  }

  const field = "mt-1 w-full rounded-xl border border-line/80 bg-white px-3 py-2 text-[13px] outline-none focus:border-ink/40";
  const label = "block text-[11px] font-semibold text-muted";
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <button type="button" aria-label="Cancel" onClick={() => !busy && onClose()} className="absolute inset-0 cursor-default bg-ink/45" />
      <div role="dialog" aria-label={landlord ? "Add an additional landlord" : "Add a point of contact"} className="fade-up relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="px-6 pb-2 pt-5">
          <h2 className="flex items-center gap-2 text-[20px] font-normal tracking-normal">
            <DoodleIcon name={landlord ? "home" : "user"} size={16} className="text-accent-dark" />
            {landlord ? "Add an Additional Landlord" : "Add a Point of Contact"}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            {landlord
              ? `Somebody else who owns ${address || "the home"}, or its landlord if none is held.`
              : `Somebody we deal with about ${address || "the home"} who isn't a landlord - a partner, a son, a PA - for access and the like.`}
          </p>
          <div
            className="mt-4 space-y-3"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); void save(); }
            }}
          >
            <label className="block"><span className={label}>Full name</span><input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={field} placeholder={landlord ? "As on their ID, or the company's name" : "Their name"} /></label>
            <label className="block"><span className={label}>Who they are</span><input value={d.relation} maxLength={80} onChange={(e) => setD({ ...d, relation: e.target.value })} className={field} placeholder={landlord ? "e.g. Director, Wife" : "e.g. Partner, lets us in"} /></label>
            <label className="block"><span className={label}>Mobile</span><input type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} className={field} placeholder="07..." /></label>
            <label className="block"><span className={label}>Email</span><input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} className={field} placeholder="name@example.com" /></label>
            {landlord && (
              <>
                <label className="block"><span className={label}>Their own home address</span><input value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} className={field} placeholder="Where they live, with the postcode" /></label>
                {address && (
                  <button type="button" onClick={() => setD({ ...d, address })} className="text-[11.5px] font-semibold text-accent-dark hover:underline">Same as the let property</button>
                )}
              </>
            )}
            <p className="text-[11.5px] leading-relaxed text-muted">
              {note ?? (landlord ? "Kept on the home, so they show on its listing, its lets and its page." : "Kept on the home. Not a landlord: not on the contract, and never sent to Propoly.")}
            </p>
          </div>
          {msg && <p className="mt-3 text-[12.5px] font-semibold text-accent-dark">{msg}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line/60 px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-full bg-accent-dark px-5 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50">{busy ? "Saving…" : "Add them"}</button>
        </div>
      </div>
    </div>
  );
}
