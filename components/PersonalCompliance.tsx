"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import {
  expiryFor,
  KIND_LABEL,
  STATE_WORDS,
  type ComplianceItem,
} from "@/lib/agent-compliance-types";

/**
 * The agent's own compliance, on their profile.
 *
 * What they hold personally, against the list Michael keeps, with the date
 * each runs out and a reminder that lands 30, 14 and 7 days before it does.
 * "Mark it done" is their word - the date they got it and, if they like, a
 * note or a link to where it is - and Michael's check is a separate act on
 * his screen. The two dates are shown as two dates.
 */

const today = () => new Date().toISOString().slice(0, 10);

function tone(state: ComplianceItem["state"]): "good" | "accent" | "neutral" {
  if (state === "verified") return "good";
  if (state === "held") return "neutral";
  return "accent";
}

export default function PersonalCompliance() {
  const [items, setItems] = useState<ComplianceItem[] | null>(null);
  const [stored, setStored] = useState(true);
  const [marking, setMarking] = useState<ComplianceItem | null>(null);
  const [doneAt, setDoneAt] = useState(today());
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/agent-compliance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; stored?: boolean; items?: ComplianceItem[] } | null) => {
        setItems(j?.items ?? []);
        setStored(j?.stored !== false);
      })
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  function open(i: ComplianceItem) {
    setMarking(i);
    setDoneAt(i.doneAt ?? today());
    setNote(i.note);
    setLink(i.link);
    setError(null);
  }

  async function save() {
    if (!marking || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/agent-compliance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requirementId: marking.requirement.id, doneAt, note, link }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; items?: ComplianceItem[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "That didn't save.");
      setItems(j.items ?? []);
      setMarking(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  const short = (items ?? []).filter((i) => i.requirement.required && i.state !== "verified" && i.state !== "held").length;

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
        The properties have their page - this one is yours: what a partner agent holds personally, when each runs
        out, and the reminder that lands a month before it does. Mark a thing done with the date you got it;
        Michael checks it from his side.
      </p>
      {!stored && <p className="mb-3 text-[12px] text-muted">No database on this environment, so nothing here is kept.</p>}
      {items === null ? (
        <p className="text-[12.5px] text-muted">Reading…</p>
      ) : !items.length ? (
        <p className="text-[12.5px] text-muted">Nothing is asked of you yet - the list is still being written.</p>
      ) : (
        <>
          {short > 0 && (
            <p className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-accent-dark">
              <DoodleIcon name="bell" size={14} />
              {short} thing{short === 1 ? "" : "s"} to sort.
            </p>
          )}
          <div className="overflow-x-auto rounded-2xl border border-line/70">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-line/70 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">What you hold</th>
                  <th className="px-4 py-3">Runs out</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.requirement.id} className="border-b border-line/40 last:border-0">
                    <td className="px-4 py-3.5">
                      <span className="block text-[12.5px] font-semibold">
                        {i.requirement.title}
                        {!i.requirement.required && <span className="ml-1.5 text-[10px] font-normal text-muted">optional</span>}
                      </span>
                      <span className="block text-[11px] leading-snug text-muted">{i.requirement.what}</span>
                      <span className="mt-0.5 block text-[10px] text-muted">
                        {KIND_LABEL[i.requirement.kind]}
                        {i.requirement.renewsMonths ? ` · every ${i.requirement.renewsMonths} months` : " · once"}
                        {i.requirement.howLink && (
                          <>
                            {" · "}
                            <a href={i.requirement.howLink} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-ink">
                              where to get it
                            </a>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      {i.expiresAt ? (
                        <>
                          <span className="figures block text-[12.5px]">{i.expiresAt}</span>
                          <span className={`block text-[10px] ${i.state === "due" || i.state === "expired" ? "font-semibold text-accent-dark" : "text-muted"}`}>
                            {i.daysLeft != null && i.daysLeft < 0
                              ? `${Math.abs(i.daysLeft)} days ago`
                              : i.daysLeft != null
                                ? `in ${i.daysLeft} days`
                                : ""}
                          </span>
                        </>
                      ) : i.doneAt ? (
                        <span className="text-[11px] text-muted">does not run out</span>
                      ) : (
                        <span className="text-[11px] text-muted">no record</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Pill tone={tone(i.state)}>{STATE_WORDS[i.state]}</Pill>
                      {i.verifiedBy && i.state === "verified" && (
                        <span className="mt-1 block text-[10px] text-muted">by {i.verifiedBy}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => open(i)}
                        className={`rounded-full px-4 py-2 text-[11px] font-semibold transition-colors ${
                          i.state === "missing" || i.state === "expired" || i.state === "due"
                            ? "press-ring bg-accent-dark text-page"
                            : "border border-ink/25 hover:border-ink"
                        }`}
                      >
                        {i.doneAt ? "Update" : "Mark it done"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
            Reminders go by email 30, 14 and 7 days before something runs out, and once for anything not on file.
            They stop by themselves when the date is in.
          </p>
        </>
      )}

      {marking && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setMarking(null)} className="absolute inset-0 cursor-default bg-ink/45" />
          <div className="fade-up relative w-full max-w-md rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <h2 className="hand text-[20px]">{marking.requirement.title}</h2>
            <p className="mt-1 text-[12.5px] text-muted">{marking.requirement.what}</p>
            <label className="mt-4 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              When you got it
              <input
                type="date"
                value={doneAt}
                max={today()}
                onChange={(e) => setDoneAt(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[13px] font-normal normal-case tracking-normal outline-none focus:border-ink"
              />
            </label>
            {marking.requirement.renewsMonths && doneAt && (
              <p className="mt-1.5 text-[11px] text-muted">
                Runs out {expiryFor(doneAt, marking.requirement.renewsMonths)}.
              </p>
            )}
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="A link to where it is (optional)"
              className="mt-3 block w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-ink"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything Michael should know (optional)"
              rows={2}
              className="mt-3 block w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-ink"
            />
            {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setMarking(null)} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium hover:border-ink/40">
                Cancel
              </button>
              <PressButton onClick={() => void save()} disabled={busy || !doneAt} className="rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40">
                {busy ? "Saving…" : "Done"}
              </PressButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
