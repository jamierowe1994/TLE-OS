"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import DoodleIcon from "@/components/DoodleIcon";
import { GREEN, RED } from "@/components/compliance-desk/CheckRow";
import SendToTenants from "@/components/portfolio/SendToTenants";
import SendRecord, { stamp } from "@/components/portfolio/SendRecord";
import type { VerifiedItem } from "@/lib/compliance-desk";

/**
 * Verified: certificates checked on To verify, waiting to go to the tenants.
 *
 * Jo, 21 Oct 2026 ("PLC Checks and OS Updates"): once a renewed certificate is
 * verified it should leave To verify and sit somewhere of its own, where it is
 * sent to the tenants. Under the Renters' Rights Act they must have it within
 * 28 days of the work, with a record that they did.
 *
 * Email Tenant is Email Certificates, the same screens as on the home's
 * page, opened with this certificate ticked: editable, sent from the OS, and
 * kept as the legal record on the home's file.
 *
 * James, 22 Oct 2026, after Jo's first morning: done ones get out of the way.
 * Sent goes straight to the Sent view beside To Send, with the record, rather
 * than sitting under the waiting ones for a fortnight. The button is Email
 * Tenant, as it is on every certificate on the property file.
 */
const AMBER = "bg-amber-50 text-amber-700";
const day = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function clock(daysLeft: number): { label: string; tone: string } {
  if (daysLeft < 0) return { label: `${-daysLeft} day${daysLeft === -1 ? "" : "s"} over the 28`, tone: RED };
  if (daysLeft === 0) return { label: "Due today", tone: RED };
  return { label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`, tone: daysLeft <= 7 ? AMBER : GREEN };
}

type Target = { id: string; listing: string; listings: string[]; title: string; start: string };

export default function Verified() {
  const [items, setItems] = useState<VerifiedItem[] | null>(null);
  const [stored, setStored] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<Target | null>(null);
  const [record, setRecord] = useState<string | null>(null);
  const [view, setView] = useState<"send" | "sent">("send");
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get("view") === "sent") setView("sent"); } catch { /* fine */ }
  }, []);
  const pick = (v: "send" | "sent") => {
    setView(v);
    try {
      const u = new URL(window.location.href);
      if (v === "sent") u.searchParams.set("view", "sent"); else u.searchParams.delete("view");
      window.history.replaceState(null, "", u.toString());
    } catch { /* fine */ }
  };

  const load = useCallback(() => {
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
  useEffect(load, [load]);

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

  if (!items && !error) return <WorkspaceLoading />;
  const waiting = (items ?? []).filter((r) => !r.sent);
  const sent = (items ?? []).filter((r) => r.sent);
  const over = waiting.filter((r) => r.daysLeft < 0).length;

  return (
    <>
      <PageHeader
        title="Verified"
        blurb="Certificates you have verified, waiting to go to the tenants. They must have the renewed certificate within 28 days of the work, counted from the date on it (or the day it came in, if no date was filed). Email Tenant opens the email with the certificate attached: check it, change the words if you need to, and send. Sent ones move to Sent, and every email is kept on the home's file as the record."
        search={false}
      />
      {error && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-[#9d4340]">{error}</p>}
      {!stored && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-muted">No database on this environment.</p>}

      {items && stored && (
        <div role="tablist" className="fade-up mt-5 inline-flex rounded-full border border-line/70 bg-card p-1">
          {([["send", "To Send", waiting.length], ["sent", "Sent", sent.length]] as const).map(([v, l, n]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => pick(v)}
              className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition ${view === v ? "bg-ink text-page" : "text-muted hover:text-ink"}`}
            >
              {l} <span className={view === v ? "opacity-70" : ""}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {view === "send" && items && stored && waiting.length === 0 && (
        <div className="fade-up mt-5 flex items-center gap-3 rounded-[22px] border border-line/70 bg-card p-5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${GREEN}`}><span className="h-2.5 w-2.5 rounded-full bg-[#56634a]" /></span>
          <p className="text-[13.5px]">Nothing waiting. Every verified certificate has gone to the tenants.</p>
        </div>
      )}

      {view === "send" && waiting.length > 0 && (
        <>
          <p className="fade-up mt-4 text-[12.5px] text-muted">
            {waiting.length} to send{over ? `, ${over} of them past the 28 days` : ""}. Oldest first.
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

      {view === "sent" && sent.length === 0 && items && stored && (
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
                <div className="flex shrink-0 items-center gap-2">
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
          heading="Email Certificate"
          start={target.start}
          onClose={() => setTarget(null)}
          onSent={load}
        />
      )}
      {record && <SendRecord id={record} onClose={() => setRecord(null)} />}
    </>
  );
}
