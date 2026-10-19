"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * THE ADVERT, ONLINE OR OFFLINE (James, 19 Oct 2026; lib/advert-offline).
 *
 * From the moment there's a let in progress the agent decides when the
 * advert comes down: now, or they pick a stage and are asked then (the
 * holding fee in, referencing done), or whenever they see fit. Nothing comes
 * down by itself.
 *
 * Taking it offline is four short screens, sliding across:
 *   1. the advert   - off Rightmove, OnTheMarket and Zoopla
 *   2. other offers - let them go: a "not this one" is drafted for each, to
 *                     read and send from the let, nothing sent from here
 *   3. viewings     - call off the ones still booked, the viewer told
 *   4. check        - what will happen, then one press
 * Each part reuses the screen that already does it: /api/listings/publish
 * "off", /api/offers/release-others and /api/viewings/change.
 *
 * Elsewhere on the page "open-take-offline" (a window event) opens it, so
 * the Next Step's reminder needs no wiring of its own.
 */

type When = "fee" | "references" | "manual";
const WHENS: { id: When; label: string }[] = [
  { id: "fee", label: "When the holding fee is in" },
  { id: "references", label: "When referencing is done" },
  { id: "manual", label: "I'll decide myself" },
];

type Advert = { when: When | null; offlineAt: string | null; offlineBy: string | null } | null;
type Pub = { status: string | null; onPortals: boolean } | null;
type Offer = { ref: string; name: string; amount: number | null; people: number };
type Viewing = {
  id: string;
  startsAt: string;
  mins: number;
  type: string | null;
  cancelled: boolean;
  contacts: { name: string; email: string | null }[];
};
type Line = { id: string; label: string; state: "waiting" | "doing" | "done" | "failed"; note?: string };

export const OPEN_TAKE_OFFLINE = "open-take-offline";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" }).replace(",", "");
const gbp = (n: number | null) => (n == null ? "" : ` · £${n.toLocaleString("en-GB")}`);
const firstName = (n: string) => n.trim().split(/\s+/)[0] || "there";

const primary = "press-ring inline-flex items-center justify-center gap-2 rounded-full bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50";
const quiet = "press-ring inline-flex items-center justify-center gap-2 rounded-full border border-line/70 bg-white px-4 py-2.5 text-[12.5px] font-semibold disabled:opacity-50";
/* The reason line in the Viewing Cancelled email (lib/email/tle-documents). */
const VIEWING_REASON = "The home has now been let.";

export default function AdvertOffline({
  listingId,
  applicationId = null,
  propertyId = null,
  address,
  className = "",
}: {
  listingId: string;
  applicationId?: string | null;
  propertyId?: string | null;
  address: string;
  className?: string;
}) {
  const [advert, setAdvert] = useState<Advert>(null);
  const [pub, setPub] = useState<Pub>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState<When | null>(null);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setErr(null);
    Promise.all([
      fetch(`/api/listings/offline?listing=${encodeURIComponent(listingId)}${applicationId ? `&application=${encodeURIComponent(applicationId)}` : ""}`, { cache: "no-store" })
        .then((r) => r.json() as Promise<{ ok?: boolean; advert?: Advert; error?: string }>),
      fetch(`/api/listings/publish?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
        .then((r) => r.json() as Promise<{ ok?: boolean; status?: string | null; onPortals?: boolean }>)
        .catch(() => null),
    ])
      .then(([a, p]) => {
        if (!live) return;
        if (!a.ok) setErr(a.error ?? "Couldn't read the advert.");
        setAdvert(a.advert ?? null);
        setPub(p?.ok ? { status: p.status ?? null, onPortals: Boolean(p.onPortals) } : null);
      })
      .catch(() => live && setErr("Couldn't read the advert - the connection dropped."))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [listingId, applicationId, tick]);

  useEffect(() => {
    const go = () => setOpen(true);
    window.addEventListener(OPEN_TAKE_OFFLINE, go);
    return () => window.removeEventListener(OPEN_TAKE_OFFLINE, go);
  }, []);

  async function plan(w: When) {
    setSaving(w);
    setErr(null);
    try {
      const r = await fetch("/api/listings/offline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, applicationId, action: "plan", when: w }),
      });
      const j = (await r.json()) as { ok?: boolean; advert?: Advert; error?: string };
      if (!j.ok) setErr(j.error ?? "That didn't save.");
      else setAdvert(j.advert ?? null);
    } catch {
      setErr("That didn't save - the connection dropped. Try again.");
    } finally {
      setSaving(null);
    }
  }

  const offline = Boolean(advert?.offlineAt);
  const onPortals = pub?.onPortals ?? null;

  /* A let that fell through: back on the portals, then the marker comes off. */
  const [backBusy, setBackBusy] = useState(false);
  const [backAsk, setBackAsk] = useState(false);
  async function putBack() {
    setBackBusy(true);
    setErr(null);
    try {
      if (pub?.status === "published" && !pub.onPortals) {
        const r = await fetch("/api/listings/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: Number(listingId), action: "on" }) });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!j.ok) {
          setErr(j.error ?? "It didn't go back on the portals. Try again.");
          return;
        }
      }
      const r = await fetch("/api/listings/offline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId, applicationId, action: "online" }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) setErr(j.error ?? "That didn't save.");
      setBackAsk(false);
      setTick((n) => n + 1);
    } catch {
      setErr("That didn't go through - the connection dropped. Try again.");
    } finally {
      setBackBusy(false);
    }
  }

  return (
    <section className={`rounded-2xl border border-line/60 bg-white p-4 ${className}`} data-advert-offline>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">The Advert</p>
          {!loaded ? (
            <p className="mt-1 flex items-center gap-2 text-[12.5px] text-muted">
              <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Checking the portals…
            </p>
          ) : offline ? (
            <p className="mt-1 flex items-center gap-2 text-[13px]">
              <span className="rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-page">Offline</span>
              <span className="text-muted">
                since {day(advert!.offlineAt!)}
                {advert?.offlineBy ? `, by ${advert.offlineBy.split(/\s+/)[0]}` : ""}
              </span>
            </p>
          ) : onPortals ? (
            <p className="mt-1 flex items-center gap-2 text-[13px]">
              <span className="rounded-full bg-[#e7efe1] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#3f5a32]">Online</span>
              <span className="text-muted">On Rightmove, OnTheMarket and Zoopla</span>
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-muted">{pub ? "Not on the portals" : "Couldn't check the portals just now"}</p>
          )}
        </div>
        {loaded && !offline && (
          <button type="button" onClick={() => setOpen(true)} className={primary}>
            <DoodleIcon name="lock" size={13} /> Take Offline
          </button>
        )}
        {loaded && offline && (
          backAsk ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-muted">Back on the portals?</span>
              <button type="button" disabled={backBusy} onClick={() => void putBack()} className={primary}>
                {backBusy ? "Working…" : "Yes, Put It Back"}
              </button>
              <button type="button" disabled={backBusy} onClick={() => setBackAsk(false)} className={quiet}>
                No
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setBackAsk(true)} className={quiet}>
              Put Back Online
            </button>
          )
        )}
      </div>

      {loaded && !offline && (
        <div className="mt-3.5 border-t border-line/50 pt-3">
          <p className="text-[12px] text-muted">Or ask me to take it offline:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WHENS.map((w) => {
              const on = advert?.when === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  aria-pressed={on}
                  disabled={saving !== null}
                  onClick={() => void plan(w.id)}
                  className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${on ? "border-accent-dark bg-accent-soft text-accent-dark" : "border-line/70 bg-white text-ink hover:border-ink/40"}`}
                >
                  {saving === w.id ? "Saving…" : w.label}
                </button>
              );
            })}
          </div>
          {advert?.when && advert.when !== "manual" && (
            <p className="mt-2 text-[11px] leading-snug text-muted">You&apos;ll be asked on Next Step then. It stays online until you say so.</p>
          )}
        </div>
      )}

      {err && <p className="mt-2 text-[12px] text-accent-dark">{err}</p>}

      {open && (
        <TakeOfflineSheet
          listingId={listingId}
          applicationId={applicationId}
          propertyId={propertyId}
          address={address}
          onPortals={onPortals}
          onClose={() => {
            setOpen(false);
            setTick((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}

function TakeOfflineSheet({
  listingId,
  applicationId,
  propertyId,
  address,
  onPortals,
  onClose,
}: {
  listingId: string;
  applicationId: string | null;
  propertyId: string | null;
  address: string;
  onPortals: boolean | null;
  onClose: () => void;
}) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [letId, setLetId] = useState<string | null>(applicationId);
  const [viewings, setViewings] = useState<Viewing[] | null>(null);
  const [letGo, setLetGo] = useState<Set<string>>(new Set());
  const [callOff, setCallOff] = useState<Set<string>>(new Set());
  const [tellViewers, setTellViewers] = useState(true);
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/listings/offline?listing=${encodeURIComponent(listingId)}${applicationId ? `&application=${encodeURIComponent(applicationId)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok?: boolean; offers?: Offer[]; acceptedId?: string | null }>)
      .then((j) => {
        if (!live) return;
        const list = j.offers ?? [];
        setOffers(list);
        setLetId(applicationId ?? j.acceptedId ?? null);
        setLetGo(new Set(list.map((o) => o.ref)));
      })
      .catch(() => live && setOffers([]));
    fetch(`/api/listings/viewings?id=${encodeURIComponent(listingId)}${propertyId ? `&property=${encodeURIComponent(propertyId)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok?: boolean; upcoming?: Viewing[] }>)
      .then((j) => {
        if (!live) return;
        const up = (j.upcoming ?? []).filter((v) => !v.cancelled && (v.id.startsWith("rex-") || v.id.startsWith("os-")));
        setViewings(up);
        setCallOff(new Set(up.map((v) => v.id)));
      })
      .catch(() => live && setViewings([]));
    return () => {
      live = false;
    };
  }, [listingId, applicationId, propertyId]);

  const close = useCallback(() => {
    if (lines && !finished) return;
    onClose();
  }, [lines, finished, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const loading = offers === null || viewings === null;
  /* Offers can only be let go from the let in progress. */
  const offerList = letId ? offers ?? [] : [];
  const steps = ["advert", ...(offerList.length ? ["offers"] : []), ...((viewings ?? []).length ? ["viewings"] : []), "check"] as const;
  const at = steps[Math.min(step, steps.length - 1)];
  const pickedOffers = offerList.filter((o) => letGo.has(o.ref));
  const pickedViewings = (viewings ?? []).filter((v) => callOff.has(v.id));

  const toggle = (set: (f: (s: Set<string>) => Set<string>) => void, id: string, on: boolean) =>
    set((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  async function run() {
    const plan: Line[] = [
      ...(onPortals !== false ? [{ id: "portals", label: "Off Rightmove, OnTheMarket and Zoopla", state: "waiting" as const }] : []),
      { id: "mark", label: "Marked Offline in the OS", state: "waiting" },
      ...(pickedOffers.length ? [{ id: "offers", label: `${pickedOffers.length} other offer${pickedOffers.length === 1 ? "" : "s"} let go`, state: "waiting" as const }] : []),
      ...pickedViewings.map((v) => ({ id: `v:${v.id}`, label: `Viewing ${when(v.startsAt)} called off`, state: "waiting" as const })),
    ];
    setLines(plan);
    const set = (id: string, state: Line["state"], note?: string) => setLines((ls) => (ls ?? []).map((l) => (l.id === id ? { ...l, state, note } : l)));
    const post = async (url: string, body: unknown) => {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; said?: string; declined?: number };
    };

    /* 1. The portals. If this fails nothing else is done: the advert is still up. */
    if (onPortals !== false) {
      set("portals", "doing");
      const j = await post("/api/listings/publish", { id: Number(listingId), action: "off" }).catch(() => null);
      if (!j?.ok) {
        set("portals", "failed", j?.error ?? "The connection dropped. Nothing else was done.");
        setLines((ls) => (ls ?? []).map((l) => (l.state === "waiting" ? { ...l, state: "failed", note: "Not done, because the advert is still up." } : l)));
        setFinished(true);
        return;
      }
      set("portals", "done", "Gone from the portals within about 10 minutes.");
    }

    /* 2. The marker. */
    set("mark", "doing");
    const m = await post("/api/listings/offline", { listingId, applicationId: letId, action: "offline" }).catch(() => null);
    set("mark", m?.ok ? "done" : "failed", m?.ok ? undefined : m?.error ?? "That didn't save.");

    /* 3. The other offers: declined here, a "not this one" drafted for each. */
    if (pickedOffers.length && letId) {
      set("offers", "doing");
      const j = await post("/api/offers/release-others", { applicationId: letId, refs: pickedOffers.map((o) => o.ref), reason: "offline" }).catch(() => null);
      set("offers", j?.ok ? "done" : "failed", j?.ok ? 'A "not this one" email is ready on the let for each, to read and send.' : j?.error ?? "That didn't save.");
    }

    /* 4. The viewings, one at a time, as Cancel viewing does. */
    for (const v of pickedViewings) {
      const id = `v:${v.id}`;
      set(id, "doing");
      const who = v.contacts.map((c) => c.name).filter(Boolean).join(" and ");
      const j = await post("/api/viewings/change", {
        viewingId: v.id,
        action: "cancel",
        reason: "organiser",
        reasonText: VIEWING_REASON,
        oldStartsAt: v.startsAt,
        minutes: v.mins,
        applicantName: who,
        applicantEmail: v.contacts.find((c) => c.email)?.email ?? null,
        address,
        unaccompanied: /unaccompanied/i.test(v.type ?? ""),
        notify: tellViewers,
      }).catch(() => null);
      set(id, j?.ok ? "done" : "failed", j?.ok ? (tellViewers ? `${who || "The viewer"} emailed.` : "Nobody emailed.") : j?.said ?? j?.error ?? "That didn't cancel it.");
    }
    setFinished(true);
  }

  const body = (
    <div role="dialog" aria-modal="true" aria-label="Take the advert offline" className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={close} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-line/70 bg-page shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-3 px-6 pt-6 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{address}</p>
            <h2 className="mt-1 text-[22px] leading-tight">Take It Offline</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">
            ✕
          </button>
        </div>

        {!lines && (
          <div className="mt-3 flex gap-1.5 px-6 sm:px-8" aria-hidden>
            {steps.map((s, i) => (
              <span key={s} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-accent-dark" : "bg-line/70"}`} />
            ))}
          </div>
        )}

        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8">
          {loading ? (
            <p className="flex items-center gap-2 text-[12.5px] text-muted">
              <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Reading the offers and viewings…
            </p>
          ) : lines ? (
            <div>
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 rounded-xl border border-line/60 bg-white px-3.5 py-2.5 text-[12.5px]">
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] ${
                        l.state === "done" ? "bg-[#3f5a32] text-white" : l.state === "failed" ? "bg-accent-dark text-white" : "border-[1.5px] border-line"
                      } ${l.state === "doing" ? "animate-spin border-t-accent-dark" : ""}`}
                    >
                      {l.state === "done" ? "✓" : l.state === "failed" ? "!" : ""}
                    </span>
                    <span className="min-w-0">
                      <span className="font-semibold">{l.label}</span>
                      {l.note && <span className={`block text-[11.5px] ${l.state === "failed" ? "text-accent-dark" : "text-muted"}`}>{l.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {finished && (
                <button type="button" onClick={onClose} className={`${primary} mt-5 w-full`}>
                  Done
                </button>
              )}
            </div>
          ) : (
            <div key={at} className="fade-up">
              {at === "advert" && (
                <>
                  <p className="text-[13px] leading-relaxed">
                    {onPortals === false
                      ? "It isn't on the portals now. Marking it Offline keeps it that way on every screen."
                      : "It comes off Rightmove, OnTheMarket and Zoopla. It takes about 10 minutes to drop off. You can put it back online from here if the let falls through."}
                  </p>
                  {(offerList.length > 0 || (viewings ?? []).length > 0) && (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                      Next: {[offerList.length ? `${offerList.length} other offer${offerList.length === 1 ? "" : "s"}` : "", (viewings ?? []).length ? `${viewings!.length} viewing${viewings!.length === 1 ? "" : "s"} still booked` : ""].filter(Boolean).join(" and ")}. You choose what happens to each.
                    </p>
                  )}
                </>
              )}

              {at === "offers" && (
                <>
                  <p className="text-[13px] leading-relaxed">Let the other applicants go?</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">
                    Each one ticked is declined, and a &quot;not this one&quot; email with similar homes is drafted on the let for you to read and send. Nothing is sent from here.
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {offerList.map((o) => (
                      <li key={o.ref}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line/60 bg-white px-3 py-2.5 text-[12.5px]">
                          <input type="checkbox" className="mt-0.5 accent-[var(--brown)]" checked={letGo.has(o.ref)} onChange={(e) => toggle(setLetGo, o.ref, e.target.checked)} />
                          <span>
                            {o.name}
                            <span className="text-muted">{gbp(o.amount)}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-muted">Untick anyone you want to keep as a back-up.</p>
                </>
              )}

              {at === "viewings" && (
                <>
                  <p className="text-[13px] leading-relaxed">Call off the viewings still booked?</p>
                  <ul className="mt-3 space-y-1.5">
                    {(viewings ?? []).map((v) => {
                      const who = v.contacts.map((c) => c.name).filter(Boolean).join(" and ") || "Viewer not named";
                      return (
                        <li key={v.id}>
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line/60 bg-white px-3 py-2.5 text-[12.5px]">
                            <input type="checkbox" className="mt-0.5 accent-[var(--brown)]" checked={callOff.has(v.id)} onChange={(e) => toggle(setCallOff, v.id, e.target.checked)} />
                            <span>
                              {who}
                              <span className="block text-[11.5px] text-muted">{when(v.startsAt)}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[12.5px]">
                    <input type="checkbox" className="mt-0.5 accent-[var(--brown)]" checked={tellViewers} onChange={(e) => setTellViewers(e.target.checked)} />
                    <span>Email each viewer to say it&apos;s off</span>
                  </label>
                  {tellViewers && pickedViewings[0] && (
                    <div className="mt-2.5 rounded-xl border border-dashed border-line/80 bg-white px-3.5 py-3 text-[12px] leading-relaxed text-muted">
                      <p className="text-[10.5px] font-semibold uppercase tracking-wide">What they&apos;ll read</p>
                      <p className="mt-1">
                        Hi {firstName(pickedViewings[0].contacts[0]?.name ?? "")}, I&apos;m sorry, but your viewing at {address} on {when(pickedViewings[0].startsAt)} can no longer go ahead. {VIEWING_REASON} If you&apos;d still like to see it, or something similar, just reply to this email and I&apos;ll find you another time.
                      </p>
                    </div>
                  )}
                </>
              )}

              {at === "check" && (
                <>
                  <p className="text-[13px] leading-relaxed">When you press Take It Offline:</p>
                  <ul className="mt-3 space-y-2 text-[12.5px] leading-snug">
                    <li className="flex gap-2.5">
                      <DoodleIcon name="lock" size={14} className="mt-0.5 shrink-0 text-accent-dark" />
                      <span>{onPortals === false ? "It's marked Offline across the OS." : "It comes off Rightmove, OnTheMarket and Zoopla, and is marked Offline across the OS."}</span>
                    </li>
                    <li className="flex gap-2.5">
                      <DoodleIcon name="mail" size={14} className="mt-0.5 shrink-0 text-accent-dark" />
                      <span>
                        {pickedOffers.length
                          ? `${pickedOffers.map((o) => o.name).join(", ")} ${pickedOffers.length === 1 ? "is" : "are"} declined, with an email drafted for you to send.`
                          : offerList.length
                            ? "The other offers stay open."
                            : "No other offers to let go."}
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <DoodleIcon name="calendar" size={14} className="mt-0.5 shrink-0 text-accent-dark" />
                      <span>
                        {pickedViewings.length
                          ? `${pickedViewings.length} viewing${pickedViewings.length === 1 ? "" : "s"} called off${tellViewers ? ", and each viewer is emailed" : ", nobody emailed"}.`
                          : (viewings ?? []).length
                            ? "The viewings stay booked."
                            : "No viewings booked."}
                      </span>
                    </li>
                  </ul>
                </>
              )}

              <div className="mt-6 flex gap-2">
                {step > 0 && (
                  <button type="button" onClick={() => setStep((s) => s - 1)} className={quiet}>
                    Back
                  </button>
                )}
                {at === "check" ? (
                  <button type="button" onClick={() => void run()} className={`${primary} flex-1`}>
                    <DoodleIcon name="lock" size={13} /> Take It Offline
                  </button>
                ) : (
                  <button type="button" onClick={() => setStep((s) => s + 1)} className={`${primary} flex-1`}>
                    Next
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
