"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";

/**
 * NOTIFY ENQUIRIES (James, 22 Oct 2026): "a click button to let the other
 * inquiries know that the property is now let", on the listing's Enquiries
 * tab once the home is let or let agreed.
 *
 * Everyone who enquired about the home or has already viewed it, each ticked,
 * with the email as the first of them will get it - Show Me Other Homes and
 * all. Never anybody on an offer, or with a viewing still booked; never
 * anybody told already (lib/let-notice works the list out on the server, and
 * again on the send). From the agent, behind the customer email switch, once
 * per person per home, recorded on os_let_notices. The same send Take It
 * Offline makes when its box is ticked.
 */

type Person = { email: string; name: string; why: "enquired" | "viewed" | "both" };
type Told = { email: string; name: string; at: string; by: string; askedAt: string | null };
const WHY: Record<Person["why"], string> = { enquired: "Enquired", viewed: "Viewed it", both: "Enquired and viewed" };
const short = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default function NotifyEnquiries({
  listingId,
  propertyId,
  address,
  onClose,
}: {
  listingId: string;
  propertyId: string | null;
  address: string;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [told, setTold] = useState<Told[]>([]);
  const [cap, setCap] = useState(60);
  const [emailsOn, setEmailsOn] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ listing: listingId, address, preview: "1" });
    if (propertyId) p.set("property", propertyId);
    fetch(`/api/listings/let-notice?${p}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; people?: Person[]; told?: Told[]; cap?: number; emailsOn?: boolean; email?: { subject: string; html: string } | null }) => {
        if (!live) return;
        if (!j.ok) {
          setErr(j.error ?? "Couldn't read who enquired.");
          setPeople([]);
          return;
        }
        const list = j.people ?? [];
        setPeople(list);
        setTold(j.told ?? []);
        setCap(j.cap ?? 60);
        setEmailsOn(j.emailsOn ?? null);
        setPreview(j.email ?? null);
        /* Opening: everyone ticked. Read again after a send: only those still picked. */
        setPicked((was) => (tick ? new Set(list.filter((x) => was.has(x.email)).map((x) => x.email)) : new Set(list.slice(0, j.cap ?? 60).map((x) => x.email))));
      })
      .catch(() => {
        if (!live) return;
        setErr("Couldn't read who enquired - the connection dropped.");
        setPeople([]);
      });
    return () => {
      live = false;
    };
  }, [listingId, propertyId, address, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sending, onClose]);

  const chosen = useMemo(() => (people ?? []).filter((p) => picked.has(p.email)), [people, picked]);
  const asked = told.filter((t) => t.askedAt).length;

  async function send() {
    if (sending || !chosen.length) return;
    setSending(true);
    setSaid(null);
    const j = (await fetch("/api/listings/let-notice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId, propertyId, address, emails: chosen.map((p) => p.email) }),
    })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; error?: string; said?: string; sent?: number } | null;
    setSending(false);
    setSaid({ ok: Boolean(j?.ok && (j.sent ?? 0) > 0), text: j?.said ?? j?.error ?? "That didn't send - the connection dropped." });
    setTick((n) => n + 1);
  }

  const body = (
    <div role="dialog" aria-modal="true" aria-label="Notify enquiries" className="fixed inset-0 z-[150] flex items-center justify-center p-4" data-steve-never>
      <button type="button" aria-label="Close" onClick={() => !sending && onClose()} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="shrink-0 border-b border-line/70 px-6 py-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{address}</p>
          <h2 className="mt-0.5 text-[19px] leading-tight">Notify Enquiries</h2>
          <p className="mt-0.5 text-[12px] text-muted">Tell everyone else who asked about it that it&apos;s been let, with a button to see your other homes.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {people === null ? (
            <p className="flex items-center gap-2 text-[12.5px] text-muted">
              <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Reading who enquired and viewed…
            </p>
          ) : (
            <>
              {emailsOn === false && (
                <p role="status" className="mb-4 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-accent-dark">
                  Emails to tenants are switched off just now, so nothing will reach them. Ask James or Susan to turn on Email to landlords and tenants.
                </p>
              )}
              {said && (
                <p className={`mb-4 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${said.ok ? "bg-[#e8eedf] text-[#3f5a32]" : "bg-accent-soft text-accent-dark"}`}>{said.text}</p>
              )}
              {err && <p className="mb-4 text-[12px] text-accent-dark">{err}</p>}

              {people.length ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Going to · {chosen.length} of {people.length}
                    </p>
                    <span className="flex gap-3 text-[11.5px] font-semibold text-muted">
                      <button type="button" onClick={() => setPicked(new Set(people.slice(0, cap).map((x) => x.email)))} className="hover:text-ink">All</button>
                      <button type="button" onClick={() => setPicked(new Set())} className="hover:text-ink">None</button>
                    </span>
                  </div>
                  <ul className="mt-2 max-h-[260px] space-y-1.5 overflow-y-auto">
                    {people.map((p) => (
                      <li key={p.email}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line/60 bg-white px-3 py-2.5 text-[12.5px]">
                          <input
                            type="checkbox"
                            className="accent-[var(--brown)]"
                            checked={picked.has(p.email)}
                            onChange={(e) =>
                              setPicked((s) => {
                                const n = new Set(s);
                                if (e.target.checked && n.size < cap) n.add(p.email);
                                else n.delete(p.email);
                                return n;
                              })
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold">{p.name}</span>
                            <span className="block truncate text-[11.5px] text-muted">{WHY[p.why]} · {p.email}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    Nobody on an offer, nobody with a viewing still booked, and nobody already told is on this list. One email each, ever{people.length > cap ? `, and up to ${cap} at a time` : ""}.
                  </p>
                </>
              ) : (
                <p className="rounded-xl border border-line/60 bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
                  {told.length ? "Everyone who enquired or viewed has been told." : "Nobody else has enquired about or viewed this home, so there's nobody to tell."}
                </p>
              )}

              {told.length > 0 && (
                <details className="mt-4 rounded-xl border border-line/60 bg-white px-3.5 py-2.5 text-[12px]">
                  <summary className="cursor-pointer font-semibold">
                    Already told · {told.length}
                    {asked ? <span className="font-normal text-muted"> · {asked} pressed Show Me Other Homes</span> : null}
                  </summary>
                  <ul className="mt-2 divide-y divide-line/40">
                    {told.map((t) => (
                      <li key={t.email} className="flex flex-wrap items-center gap-x-3 py-1.5">
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        <span className="text-muted">Told {short(t.at)}{t.by ? ` by ${t.by.split(/\s+/)[0]}` : ""}</span>
                        {t.askedAt && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-dark">Still looking</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {people.length > 0 && (
                <>
                  <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                    The email{chosen[0] ? `, as ${chosen[0].name.split(/\s+/)[0]} will get it` : ""}
                  </p>
                  {preview ? (
                    <>
                      <p className="mt-2 text-[12.5px]">
                        <span className="text-muted">Subject:</span> <span className="font-semibold">{preview.subject}</span>
                      </p>
                      <iframe title="The email" srcDoc={preview.html} sandbox="" className="mt-2 h-[460px] w-full rounded-2xl border border-line/60 bg-white" />
                      <p className="mt-2 text-[11px] leading-relaxed text-muted">
                        Show Me Other Homes opens the homes near them, no sign-up needed. When somebody presses it, you get a line in your bell and on their lead.
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-[12px] text-muted">Getting the email ready…</p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-50"
          >
            {said?.ok ? "Done" : "Cancel"}
          </button>
          {(people?.length ?? 0) > 0 && (
            <PressButton
              onClick={() => void send()}
              disabled={sending || !chosen.length}
              className={`press-ring flex items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-semibold ${!sending && chosen.length ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
            >
              <DoodleIcon name="mail" size={13} className={!sending && chosen.length ? "invert" : ""} />
              {sending ? `Sending to ${chosen.length}…` : `Send to ${chosen.length}`}
            </PressButton>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
