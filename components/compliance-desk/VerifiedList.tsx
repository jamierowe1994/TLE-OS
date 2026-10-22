"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { GREEN, RED } from "@/components/compliance-desk/CheckRow";
import SendToTenants from "@/components/portfolio/SendToTenants";
import SendRecord, { stamp } from "@/components/portfolio/SendRecord";
import type { VerifiedItem } from "@/lib/compliance-desk";

/**
 * Verified and Sent: the second and third tabs of To verify.
 *
 * Jo, 21 Oct 2026 ("PLC Checks and OS Updates"): once a renewed certificate is
 * verified it should leave To verify and sit somewhere of its own, where it is
 * sent to the tenants. Under the Renters' Rights Act they must have it within
 * 28 days of the work, with a record that they did.
 *
 * James, 22 Oct 2026, after Jo's first morning: done ones get out of the way,
 * and it all happens on the one page - "it lands, it moves over into the next
 * section, she clicks the tab, and then sends it off straight away without
 * having to click in the sidebar." So Verified (waiting to go) and Sent are
 * tabs beside To verify, not screens of their own.
 *
 * Email Tenant is Email Certificates (lib/home-send), opened with this
 * certificate ticked: editable, sent from the OS, and kept as the legal record
 * on the home's file. Sent, it moves to Sent with View Record and Send Again.
 */
const AMBER = "bg-amber-50 text-amber-700";
const day = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function clock(daysLeft: number): { label: string; tone: string } {
  if (daysLeft < 0) return { label: `${-daysLeft} day${daysLeft === -1 ? "" : "s"} over the 28`, tone: RED };
  if (daysLeft === 0) return { label: "Due today", tone: RED };
  return { label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`, tone: daysLeft <= 7 ? AMBER : GREEN };
}

/** The verified certificates, waiting and sent, read once for the tabs and their counts. */
export function useVerified() {
  const [items, setItems] = useState<VerifiedItem[] | null>(null);
  const [stored, setStored] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    fetch("/api/compliance-desk/verified", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) { setError(j?.error ?? "The verified certificates couldn't be read."); return; }
        setItems(j.items ?? []);
        setStored(j.stored !== false);
        setError(null);
      })
      .catch(() => setError("The verified certificates couldn't be read. Try again in a minute."));
  }, []);
  useEffect(reload, [reload]);
  const waiting = (items ?? []).filter((r) => !r.sent);
  const sent = (items ?? []).filter((r) => r.sent);
  return { items, waiting, sent, stored, error, reload };
}

type Target = { id: string; listing: string; listings: string[]; title: string; start: string };

export default function VerifiedList({ view, waiting, sent, ready, reload }: { view: "verified" | "sent"; waiting: VerifiedItem[]; sent: VerifiedItem[]; ready: boolean; reload: () => void }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<Target | null>(null);
  const [record, setRecord] = useState<string | null>(null);

  const open = async (r: VerifiedItem) => {
    setOpening(r.id);
    setRowError((e) => ({ ...e, [r.id]: "" }));
    try {
      const j = await fetch(`/api/compliance-desk/verified?target=${encodeURIComponent(r.id)}`, { cache: "no-store" }).then((x) => x.json());
      if (!j?.ok) setRowError((e) => ({ ...e, [r.id]: j?.error ?? "The home couldn't be found." }));
      else setTarget({ id: r.id, listing: j.listing, listings: j.listings, title: j.title, start: j.start });
    } catch {
      setRowError((e) => ({ ...e, [r.id]: "The home couldn't be found. Try again in a minute." }));
    } finally {
      setOpening(null);
    }
  };

  const over = waiting.filter((r) => r.daysLeft < 0).length;

  return (
    <>
      {view === "verified" && ready && waiting.length === 0 && (
        <div className="fade-up mt-5 flex items-center gap-3 rounded-[22px] border border-line/70 bg-card p-5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${GREEN}`}><span className="h-2.5 w-2.5 rounded-full bg-[#56634a]" /></span>
          <p className="text-[13.5px]">Nothing waiting. Every verified certificate has gone to the tenants.</p>
        </div>
      )}

      {view === "verified" && waiting.length > 0 && (
        <>
          <p className="fade-up mt-4 text-[12.5px] text-muted">
            {waiting.length} to send{over ? `, ${over} of them past the 28 days` : ""}. The tenants must have each within 28 days of the work. Oldest first.
          </p>
          <ul className="fade-up mt-3 space-y-3">
            {waiting.map((r) => {
              const c = clock(r.daysLeft);
              return (
                <li key={r.id} className="rounded-[18px] border border-line/70 bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[min(100%,260px)] flex-1">
                      <p className="text-[14px] font-semibold leading-snug">{r.what} - {r.property}</p>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                        Verified{r.verifiedBy ? ` by ${r.verifiedBy}` : ""} on {day(r.verifiedAt)}. {r.fromIssue ? `Work done ${day(r.from)}` : `Came in ${day(r.from)}`}.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-page px-2.5 py-1 text-[11px] text-muted">Expires {day(r.expiry)}</span>
                        {r.fileName && <span className="max-w-[240px] truncate rounded-full bg-page px-2.5 py-1 text-[11px] text-muted">{r.fileName}</span>}
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.tone}`}>{c.label}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {r.fileKey && (
                        <a
                          href={`/api/r2/file?key=${encodeURIComponent(r.fileKey)}`}
                          target="_blank"
                          rel="noreferrer"
                          title={r.fileName}
                          className="flex items-center gap-1.5 rounded-full border border-line/80 px-3 py-1.5 text-[12px] font-semibold transition hover:border-ink/40"
                        >
                          <DoodleIcon name="doc" size={13} className="shrink-0 text-accent-dark" />
                          Open the file
                        </a>
                      )}
                      <a
                        href={`/portfolio/home/${encodeURIComponent(r.propertyId)}?name=${encodeURIComponent(r.property)}&tab=compliance`}
                        className="rounded-full border border-line/80 px-3 py-1.5 text-[12px] font-semibold transition hover:border-ink/40"
                      >
                        The home
                      </a>
                    </div>
                  </div>
                  {rowError[r.id] && <p className={`mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-snug ${RED}`}>{rowError[r.id]}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={opening === r.id}
                      onClick={() => void open(r)}
                      className="flex items-center gap-1.5 rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    >
                      <DoodleIcon name="mail" size={13} />
                      {opening === r.id ? "Opening..." : "Email Tenant"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {view === "sent" && ready && sent.length === 0 && (
        <p className="fade-up mt-5 rounded-[22px] border border-line/70 bg-card p-5 text-[13.5px] text-muted">Nothing sent from here yet.</p>
      )}
      {view === "sent" && sent.length > 0 && (
        <>
          <p className="fade-up mt-4 text-[12.5px] text-muted">Newest first. Each one is also on its home&apos;s file.</p>
          <ul className="fade-up mt-3 space-y-2">
            {sent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-line/70 bg-card px-4 py-3">
                <div className="min-w-[min(100%,240px)] flex-1">
                  <p className="text-[13px] font-semibold leading-snug">{r.what} - {r.property}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">
                    Sent {stamp(r.sent!.at)}{r.sent!.to.length ? ` to ${r.sent!.to.join(", ")}` : ""}{r.sent!.by ? `, ${r.sent!.record ? `by ${r.sent!.by}` : r.sent!.by.toLowerCase()}` : ""}.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${GREEN}`}>Sent {day(r.sent!.at)}</span>
                  {r.sent!.record && (
                    <button type="button" onClick={() => setRecord(r.sent!.record)} className="rounded-full border border-line/80 px-3 py-1.5 text-[12px] font-semibold transition hover:border-ink/40">
                      View Record
                    </button>
                  )}
                  <button type="button" disabled={opening === r.id} onClick={() => void open(r)} className="rounded-full border border-line/80 px-3 py-1.5 text-[12px] font-semibold transition hover:border-ink/40 disabled:opacity-40">
                    {opening === r.id ? "Opening..." : "Send Again"}
                  </button>
                </div>
                {rowError[r.id] && <p className={`w-full rounded-xl px-3.5 py-2.5 text-[12.5px] leading-snug ${RED}`}>{rowError[r.id]}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      {target && (
        <SendToTenants
          listing={target.listing}
          listings={target.listings}
          title={target.title}
          heading="Email Tenant"
          start={target.start}
          onClose={() => setTarget(null)}
          onSent={reload}
        />
      )}
      {record && <SendRecord id={record} onClose={() => setRecord(null)} />}
    </>
  );
}
